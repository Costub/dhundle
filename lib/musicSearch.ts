// External song search for the guess box. Server-only.
//
// Provider: Spotify Web API via client credentials. There is deliberately no
// local catalog or alternate-provider fallback for the public guess dropdown:
// the added answer pool must not be exposed to players.
// Results and individual tracks are cached in-memory so the guess route can
// re-resolve a candidate by id without trusting client-supplied metadata.

export interface TrackCandidate {
  /** "spotify:<id>" - opaque to the client. */
  sourceId: string;
  title: string;
  artists: string[];
  /** Album/collection; for Bollywood releases this is usually the movie. */
  movie: string;
  year: number | null;
  artworkUrl?: string;
  /** Public Spotify track page, handy as the reveal's official link. */
  url?: string;
}

const QUERY_TTL_MS = 10 * 60_000;
const TRACK_TTL_MS = 6 * 60 * 60_000;
const queryCache = new Map<string, { at: number; results: TrackCandidate[] }>();
const trackCache = new Map<string, { at: number; candidate: TrackCandidate }>();

function remember(candidates: TrackCandidate[]): TrackCandidate[] {
  const now = Date.now();
  for (const c of candidates) trackCache.set(c.sourceId, { at: now, candidate: c });
  if (trackCache.size > 3000) {
    for (const [key, val] of trackCache) {
      if (now - val.at > TRACK_TTL_MS) trackCache.delete(key);
    }
  }
  return candidates;
}

/**
 * Bollywood streaming titles often embed the movie: `Tum Hi Ho (From
 * "Aashiqui 2")`. Pull that out so the movie field is meaningful and the
 * title matches how players type it.
 */
function splitStreamingTitle(rawTitle: string, album: string): { title: string; movie: string } {
  const m = rawTitle.match(/^(.*?)\s*[([](?:from)\s+["']?(.+?)["']?\s*[)\]]/i);
  if (m) return { title: m[1].trim(), movie: m[2].trim() };
  const movie = album
    .replace(/\s*[([](?:original|from).*$/i, "")
    .replace(/\s*-\s*(original\s+)?(motion\s+picture\s+)?soundtrack.*$/i, "")
    .trim();
  return { title: rawTitle.trim(), movie: movie || album };
}

function yearFrom(dateStr?: string): number | null {
  const y = dateStr ? Number(dateStr.slice(0, 4)) : NaN;
  return Number.isInteger(y) && y > 1900 ? y : null;
}

interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { name: string; release_date?: string; images?: { url: string; width: number }[] };
  external_urls?: { spotify?: string };
}

let spotifyToken: { value: string; expiresAt: number } | null = null;

function spotifyCreds(): { id: string; secret: string } | null {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret || id.includes("<") || secret.includes("<")) return null;
  return { id, secret };
}

async function getSpotifyToken(): Promise<string> {
  if (spotifyToken && Date.now() < spotifyToken.expiresAt - 30_000) {
    return spotifyToken.value;
  }
  const creds = spotifyCreds();
  if (!creds) throw new Error("Spotify not configured");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${creds.id}:${creds.secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Spotify token failed (${res.status})`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  spotifyToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return spotifyToken.value;
}

function fromSpotifyTrack(t: SpotifyTrack): TrackCandidate {
  const { title, movie } = splitStreamingTitle(t.name, t.album.name);
  const smallest = [...(t.album.images ?? [])].sort((a, b) => a.width - b.width)[0];
  return {
    sourceId: `spotify:${t.id}`,
    title,
    artists: t.artists.map((a) => a.name),
    movie,
    year: yearFrom(t.album.release_date),
    artworkUrl: smallest?.url,
    url: t.external_urls?.spotify ?? `https://open.spotify.com/track/${t.id}`,
  };
}

async function spotifySearch(query: string): Promise<TrackCandidate[]> {
  const token = await getSpotifyToken();
  const res = await fetch(
    `https://api.spotify.com/v1/search?type=track&market=IN&limit=8&q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Spotify search failed (${res.status})`);
  const data = (await res.json()) as { tracks?: { items?: SpotifyTrack[] } };
  return (data.tracks?.items ?? []).map(fromSpotifyTrack);
}

async function spotifyTrack(id: string): Promise<TrackCandidate | null> {
  const token = await getSpotifyToken();
  const res = await fetch(`https://api.spotify.com/v1/tracks/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return fromSpotifyTrack((await res.json()) as SpotifyTrack);
}

/** Search Spotify. Failures return [] so typed alias guesses still work. */
export async function searchTracks(query: string): Promise<TrackCandidate[]> {
  if (!spotifyCreds()) return [];
  const key = `spotify:${query.trim().toLowerCase()}`;
  const cached = queryCache.get(key);
  if (cached && Date.now() - cached.at < QUERY_TTL_MS) return cached.results;
  let results: TrackCandidate[] = [];
  try {
    results = await spotifySearch(query);
  } catch {
    results = [];
  }
  queryCache.set(key, { at: Date.now(), results: remember(results) });
  if (queryCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of queryCache) {
      if (now - v.at > QUERY_TTL_MS) queryCache.delete(k);
    }
  }
  return results;
}

/** Trusted re-resolution of a Spotify search pick, used by the guess route. */
export async function getTrackCandidate(sourceId: string): Promise<TrackCandidate | null> {
  const cached = trackCache.get(sourceId);
  if (cached && Date.now() - cached.at < TRACK_TTL_MS) return cached.candidate;
  const [provider, id] = sourceId.split(":", 2);
  if (provider !== "spotify" || !id || !spotifyCreds()) return null;
  try {
    const candidate = await spotifyTrack(id);
    if (candidate) remember([candidate]);
    return candidate;
  } catch {
    return null;
  }
}
