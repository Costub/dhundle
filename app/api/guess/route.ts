import { NextRequest, NextResponse } from "next/server";
import { findSongByGuess, getSongById } from "@/lib/catalog";
import { computeFeedback } from "@/lib/feedback";
import { getTrackCandidate, type TrackCandidate } from "@/lib/musicSearch";
import { getPuzzleById } from "@/lib/puzzles";
import {
  consumeAttempt,
  normalizeDeviceId,
  rateLimit,
  requestIdentity,
} from "@/lib/serverGuard";
import type { GuessResponse, Song } from "@/lib/types";

export const dynamic = "force-dynamic";

interface GuessRequestBody {
  puzzleId: string;
  deviceId: string;
  /** null = the player skipped this attempt */
  songId: string | null;
  /** External search pick from /api/search ("spotify:.."). */
  sourceId?: string;
  /** Free-text guess, resolved against normalized title/movie aliases. */
  query?: string;
  /** Signed token from the previous guess response. */
  playToken?: string;
}

/**
 * A guessed external track that isn't in our catalog still gets real
 * proximity feedback from its own public metadata. Composer/actor fields are
 * left empty on purpose: unknown must never read as "match".
 */
function songFromCandidate(candidate: TrackCandidate): Song {
  return {
    id: candidate.sourceId,
    title: candidate.title,
    movie: candidate.movie,
    year: candidate.year ?? 0,
    singers: candidate.artists,
    musicDirector: "",
    actors: [],
  };
}

/** Match an external pick to the catalog so the answer resolves as a win. */
async function resolveCandidate(candidate: TrackCandidate): Promise<Song> {
  const catalogHit =
    (await findSongByGuess(candidate.title)) ??
    (await findSongByGuess(`${candidate.title} ${candidate.movie}`));
  return catalogHit ?? songFromCandidate(candidate);
}

export async function POST(req: NextRequest) {
  let body: GuessRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { puzzleId, songId, sourceId, query, playToken } = body;
  const deviceId = normalizeDeviceId(body.deviceId);
  if (
    typeof puzzleId !== "string" ||
    !deviceId ||
    (songId !== null && typeof songId !== "string") ||
    (sourceId !== undefined && typeof sourceId !== "string") ||
    (query !== undefined && typeof query !== "string") ||
    (playToken !== undefined && typeof playToken !== "string")
  ) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const limited = rateLimit("guess", requestIdentity(req, deviceId), 24);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Too many guesses. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  const puzzle = await getPuzzleById(puzzleId);
  if (!puzzle) {
    return NextResponse.json({ error: "Unknown puzzle" }, { status: 404 });
  }
  const answer = await getSongById(puzzle.songId);
  if (!answer) {
    return NextResponse.json({ error: "Puzzle misconfigured" }, { status: 500 });
  }

  let guess: Song | undefined;
  if (songId !== null) {
    guess = await getSongById(songId);
  } else if (sourceId) {
    const candidate = await getTrackCandidate(sourceId);
    if (candidate) guess = await resolveCandidate(candidate);
  } else if (query?.trim()) {
    guess = await findSongByGuess(query);
  }
  if ((songId !== null || sourceId || query?.trim()) && !guess) {
    return NextResponse.json(
      { error: "Could not resolve that song. Try picking a search result." },
      { status: 400 }
    );
  }

  const maxAttempts = Math.max(1, Math.min(6, puzzle.stems.length));
  const attemptState = consumeAttempt(puzzleId, deviceId, playToken, maxAttempts);

  let response: GuessResponse;
  if (!guess) {
    response = { feedback: null, ...attemptState };
  } else {
    response = {
      feedback: computeFeedback(guess, answer),
      guess: { id: guess.id, title: guess.title, movie: guess.movie },
      ...attemptState,
    };
  }

  const correct = response.feedback?.correct ?? false;
  const gameOver = correct || attemptState.attempt >= maxAttempts;

  if (gameOver) {
    // Answer is only ever sent once the game is decided.
    response.answer = { song: answer, officialLink: puzzle.officialLink };
  }

  return NextResponse.json(response);
}
