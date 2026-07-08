// Admin write operations with the same dual backend as the read side:
// Supabase when configured, local JSON/public-folder fallback for dev.
// Server-only — every caller must have passed assertAdmin() first.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { schedulePuzzle, validatePuzzle, type AdminPuzzleInput } from "./adminPuzzles";
import {
  isSupabaseConfigured,
  supabaseDelete,
  supabasePost,
  supabaseUploadStem,
} from "./supabase";
import type { PuzzleDefinition, Song, StemInfo } from "./types";

const ROOT = process.cwd();
const SONGS_PATH = join(ROOT, "data", "songs.json");
const PUZZLES_PATH = join(ROOT, "data", "puzzles.json");

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;
const writeJson = (p: string, data: unknown) =>
  writeFileSync(p, JSON.stringify(data, null, 2) + "\n");

// ------------------------------------------------------------------ uploads

export const STEM_CONTENT_TYPES: Record<string, string> = {
  ".opus": "audio/ogg",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".webm": "audio/webm",
};

/**
 * Store one stem file for a given date+position. Returns the storage path in
 * the shape the puzzle rows expect: bucket-relative for Supabase
 * ("2026-07-20/stem-1.opus"), site-relative for local dev ("/stems/...").
 * Paths are date-based on purpose — stem URLs are visible in devtools before
 * the game ends, so they must never mention the song.
 */
export async function storeStemFile(
  date: string,
  position: number,
  ext: string,
  data: Buffer,
): Promise<string> {
  const filename = `stem-${position}${ext}`;
  if (isSupabaseConfigured()) {
    const contentType = STEM_CONTENT_TYPES[ext] ?? "application/octet-stream";
    return supabaseUploadStem(`${date}/${filename}`, data, contentType);
  }
  const dir = join(ROOT, "public", "stems", date);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), data);
  return `/stems/${date}/${filename}`;
}

// ------------------------------------------------------------------ puzzles

/** Schedule (or replace) the puzzle for a date, in Supabase or local JSON. */
export async function scheduleOrReplacePuzzle(input: AdminPuzzleInput): Promise<void> {
  if (isSupabaseConfigured()) {
    // Replace stems wholesale so a re-schedule can't leave stale positions.
    const existing = await supabasePost<{ id: string }[]>(
      "puzzles?on_conflict=puzzle_date",
      { song_id: input.songId.trim(), puzzle_date: input.date, status: "scheduled" }
    );
    const puzzleId = existing?.[0]?.id;
    if (puzzleId) await supabaseDelete(`stems?puzzle_id=eq.${puzzleId}`);
    await schedulePuzzle(input);
    return;
  }

  // Local fallback mirrors scripts/add-puzzle.mjs conventions.
  validatePuzzle(input);
  const puzzles = readJson<PuzzleDefinition[]>(PUZZLES_PATH);
  const stems: StemInfo[] = [...input.stems]
    .sort((a, b) => a.position - b.position)
    .map((s) => ({ position: s.position, instrument: s.instrument, src: s.storagePath }));
  const entry: PuzzleDefinition = {
    id: input.date,
    songId: input.songId.trim(),
    date: input.date,
    stems,
    ...(input.officialLink?.trim() ? { officialLink: input.officialLink.trim() } : {}),
  };
  const next = puzzles.filter((p) => p.date !== input.date && p.id !== input.date);
  next.push(entry);
  next.sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
  writeJson(PUZZLES_PATH, next);
}

/** Remove a puzzle (by Supabase id or local id/date). Stem files are kept. */
export async function deletePuzzle(id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    await supabaseDelete(`puzzles?id=eq.${encodeURIComponent(id)}`);
    return;
  }
  const puzzles = readJson<PuzzleDefinition[]>(PUZZLES_PATH);
  writeJson(
    PUZZLES_PATH,
    puzzles.filter((p) => p.id !== id && p.date !== id)
  );
}

// -------------------------------------------------------------------- songs

export function validateSong(song: Song): void {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(song.id)) {
    throw new Error("Song id must be a lowercase slug, e.g. tum-hi-ho-aashiqui-2");
  }
  if (!song.title.trim()) throw new Error("Title is required");
  if (!song.movie.trim()) throw new Error("Movie is required");
  if (!Number.isInteger(song.year) || song.year < 1930 || song.year > 2100) {
    throw new Error("Year must be between 1930 and 2100");
  }
  if (!song.singers.length || song.singers.some((s) => !s.trim())) {
    throw new Error("At least one artist is required");
  }
}

/** Create or update a catalog song. */
export async function upsertSong(song: Song): Promise<void> {
  validateSong(song);
  if (isSupabaseConfigured()) {
    const payload = {
      id: song.id,
      title: song.title.trim(),
      movie: song.movie.trim(),
      year: song.year,
      singers: song.singers.map((s) => s.trim()),
      actors: (song.actors ?? []).map((a) => a.trim()).filter(Boolean),
      music_director: song.musicDirector.trim() || song.singers[0]?.trim() || "Unknown",
      aliases: (song.aliases ?? []).map((a) => a.trim()).filter(Boolean),
      is_active: true,
    };
    try {
      await supabasePost("songs?on_conflict=id", payload);
    } catch {
      await supabasePost("songs?on_conflict=id", {
        id: payload.id,
        title: payload.title,
        movie: payload.movie,
        year: payload.year,
        singers: payload.singers,
        music_director: payload.music_director,
        aliases: payload.aliases,
        is_active: payload.is_active,
      });
    }
    return;
  }
  const songs = readJson<Song[]>(SONGS_PATH);
  const next = songs.filter((s) => s.id !== song.id);
  next.push({
    ...song,
    musicDirector: song.musicDirector.trim() || song.singers[0]?.trim() || "Unknown",
    actors: song.actors?.length ? song.actors : undefined,
    aliases: song.aliases?.length ? song.aliases : undefined,
  });
  next.sort((a, b) => a.year - b.year || a.title.localeCompare(b.title));
  writeJson(SONGS_PATH, next);
}

/** Deactivate a song (Supabase) or remove it from the local catalog. */
export async function deactivateSong(id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    await supabasePost("songs?on_conflict=id", { id, is_active: false });
    return;
  }
  const songs = readJson<Song[]>(SONGS_PATH);
  writeJson(
    SONGS_PATH,
    songs.filter((s) => s.id !== id)
  );
}
