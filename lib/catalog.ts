import songsJson from "@/data/songs.json";
import { supabaseGet } from "./supabase";
import type { Song } from "./types";

export const SONGS: Song[] = songsJson as Song[];

const byId = new Map(SONGS.map((s) => [s.id, s]));

interface SongRow {
  id: string;
  title: string;
  movie: string;
  year: number;
  singers: string[];
  actors?: string[];
  music_director: string;
  aliases: string[];
}

function fromSongRow(row: SongRow): Song {
  return {
    id: row.id,
    title: row.title,
    movie: row.movie,
    year: row.year,
    singers: row.singers ?? [],
    actors: row.actors ?? [],
    musicDirector: row.music_director,
    aliases: row.aliases ?? [],
  };
}

const SONG_SELECT = "id,title,movie,year,singers,actors,music_director,aliases";
const LEGACY_SONG_SELECT = "id,title,movie,year,singers,music_director,aliases";

export async function getAllSongs(): Promise<Song[]> {
  let rows: SongRow[] | null;
  try {
    rows = await supabaseGet<SongRow[]>(
      `songs?is_active=eq.true&select=${SONG_SELECT}&order=title.asc`
    );
  } catch {
    rows = await supabaseGet<SongRow[]>(
      `songs?is_active=eq.true&select=${LEGACY_SONG_SELECT}&order=title.asc`
    );
  }
  return rows ? rows.map(fromSongRow) : SONGS;
}

export async function getSongById(id: string): Promise<Song | undefined> {
  const encoded = encodeURIComponent(id);
  let rows: SongRow[] | null;
  try {
    rows = await supabaseGet<SongRow[]>(
      `songs?id=eq.${encoded}&select=${SONG_SELECT}&limit=1`
    );
  } catch {
    rows = await supabaseGet<SongRow[]>(
      `songs?id=eq.${encoded}&select=${LEGACY_SONG_SELECT}&limit=1`
    );
  }
  return rows ? rows[0] && fromSongRow(rows[0]) : byId.get(id);
}

/**
 * Fold search text so common alternate spellings collide.
 */
export function normalizeSearchText(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9\s]/g, " ") // punctuation → space
    .replace(/aa+/g, "a")
    .replace(/ee+/g, "i")
    .replace(/oo+/g, "u")
    .replace(/([a-z])\1+/g, "$1") // collapse doubled letters (chaiyya→chaiya→chaya-ish)
    .replace(/w/g, "v")
    .replace(/ph/g, "f")
    .replace(/\bth\b/g, "t")
    .replace(/(\w)h/g, "$1") // drop aspirations: bh→b, kh→k, dh→d, th→t...
    .replace(/\s+/g, " ")
    .trim();
}


export async function findSongByGuess(input: string): Promise<Song | undefined> {
  // Compare space-insensitively so "D.K. Bose" (→ "d k bose") still matches
  // a catalog "DK Bose" (→ "dk bose") — streaming metadata loves initials.
  const compact = (s: string) => normalizeSearchText(s).replace(/\s+/g, "");
  const query = compact(input);
  if (!query) return undefined;
  const songs = await getAllSongs();
  return songs.find((song) => {
    const candidates = [
      song.title,
      `${song.title} ${song.movie}`,
      song.movie,
      ...(song.aliases ?? []),
    ].map(compact);
    return candidates.some((candidate) => candidate === query);
  });
}

// NOTE: the catalog is intentionally never shipped to the game client — the
// guess box searches the streaming catalog (/api/search) and picks are
// resolved here server-side, so the answer pool can't be enumerated.
