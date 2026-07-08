// Admin write operations with the same dual backend as the read side:
// Supabase when configured, local JSON/public-folder fallback for dev.
// Server-only — every caller must have passed assertAdmin() first.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { validatePuzzle, type AdminPuzzleInput } from "./adminPuzzles";
import {
  isSupabaseConfigured,
  supabaseDelete,
  supabaseGet,
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

function safeUploadBatchId(value?: string): string {
  const id = value?.trim().toLowerCase() ?? "";
  if (/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) return id;
  return `upload-${randomUUID()}`;
}

/**
 * Store one stem file for a date + anonymous upload batch + position. Returns
 * the storage path in the shape the puzzle rows expect: bucket-relative for
 * Supabase ("2026-07-20/upload-abc/stem-1.opus") or site-relative locally.
 * Paths are date-based on purpose — stem URLs are visible in devtools before
 * the game ends, so they must never mention the song.
 */
export async function storeStemFile(
  date: string,
  position: number,
  ext: string,
  data: Buffer,
  uploadBatchId?: string,
): Promise<string> {
  const filename = `stem-${position}${ext}`;
  const batchId = safeUploadBatchId(uploadBatchId);
  if (isSupabaseConfigured()) {
    const contentType = STEM_CONTENT_TYPES[ext] ?? "application/octet-stream";
    return supabaseUploadStem(`${date}/${batchId}/${filename}`, data, contentType);
  }
  const dir = join(ROOT, "public", "stems", date, batchId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), data);
  return `/stems/${date}/${batchId}/${filename}`;
}

// ------------------------------------------------------------------ puzzles

interface ExistingPuzzleRow {
  id: string;
  song_id: string;
  official_link: string | null;
  stems: {
    position: number;
    instrument_label: string;
    storage_path: string;
  }[];
}

interface ReusePuzzleInput {
  sourcePuzzleId: string;
  date: string;
  officialLink?: string;
}

function storagePathFromStemSrc(src: string): string {
  const proxyPrefix = "/api/stems/";
  if (src.startsWith(proxyPrefix)) {
    return src
      .slice(proxyPrefix.length)
      .split("/")
      .map((part) => decodeURIComponent(part))
      .join("/");
  }
  return src;
}

/** Schedule (or replace) the puzzle for a date, in Supabase or local JSON. */
export async function scheduleOrReplacePuzzle(input: AdminPuzzleInput): Promise<void> {
  validatePuzzle(input);

  if (isSupabaseConfigured()) {
    const puzzleRows = await supabasePost<{ id: string }[]>(
      "puzzles?on_conflict=puzzle_date",
      {
        song_id: input.songId.trim(),
        puzzle_date: input.date,
        status: "scheduled",
        official_link: input.officialLink?.trim() || null,
      }
    );
    const puzzleId = puzzleRows?.[0]?.id;
    if (!puzzleId) throw new Error("Could not resolve puzzle row");
    await supabaseDelete(`stems?puzzle_id=eq.${encodeURIComponent(puzzleId)}`);
    await supabasePost(
      "stems?on_conflict=puzzle_id,position",
      input.stems.map((stem) => ({
        puzzle_id: puzzleId,
        position: stem.position,
        instrument_label: stem.instrument.trim(),
        storage_path: stem.storagePath.trim(),
      }))
    );
    return;
  }

  // Local fallback mirrors scripts/add-puzzle.mjs conventions.
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

/** Schedule a new date by reusing the song and stem rows from an existing puzzle. */
export async function scheduleOrReplacePuzzleFromExisting(
  input: ReusePuzzleInput
): Promise<void> {
  if (!input.sourcePuzzleId.trim()) throw new Error("Pick a previous puzzle to reuse");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Date must be YYYY-MM-DD");

  if (isSupabaseConfigured()) {
    const rows = await supabaseGet<ExistingPuzzleRow[]>(
      `puzzles?id=eq.${encodeURIComponent(input.sourcePuzzleId.trim())}&select=id,song_id,official_link,stems(position,instrument_label,storage_path)&limit=1`
    );
    const source = rows?.[0];
    if (!source) throw new Error("Previous puzzle not found");
    await scheduleOrReplacePuzzle({
      songId: source.song_id,
      date: input.date,
      officialLink: input.officialLink?.trim() || source.official_link || undefined,
      stems: [...(source.stems ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((stem) => ({
          position: stem.position,
          instrument: stem.instrument_label,
          storagePath: stem.storage_path,
        })),
    });
    return;
  }

  const puzzles = readJson<PuzzleDefinition[]>(PUZZLES_PATH);
  const source = puzzles.find((p) => p.id === input.sourcePuzzleId || p.date === input.sourcePuzzleId);
  if (!source) throw new Error("Previous puzzle not found");
  await scheduleOrReplacePuzzle({
    songId: source.songId,
    date: input.date,
    officialLink: input.officialLink?.trim() || source.officialLink,
    stems: [...source.stems]
      .sort((a, b) => a.position - b.position)
      .map((stem) => ({
        position: stem.position,
        instrument: stem.instrument,
        storagePath: storagePathFromStemSrc(stem.src),
      })),
  });
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
