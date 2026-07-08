// Server-only puzzle store.
//
// Dev/demo mode reads puzzle definitions from data/puzzles.json and rotates
// them by puzzle number when no definition matches today's date exactly.
// When Supabase is wired up (see supabase/migrations), swap the lookup in
// getPuzzleForDate for a DB query — the rest of the app only depends on
// PuzzleDefinition.

import puzzlesJson from "@/data/puzzles.json";
import { publicStorageUrl, supabaseGet } from "./supabase";
import type { PublicPuzzle, PuzzleDefinition } from "./types";
import { EPOCH_DATE, puzzleNumberForDate } from "./day";

const PUZZLES: PuzzleDefinition[] = puzzlesJson as PuzzleDefinition[];

interface PuzzleRow {
  id: string;
  song_id: string;
  puzzle_date: string | null;
  official_link: string | null;
  stems: {
    position: number;
    instrument_label: string;
    storage_path: string;
  }[];
}

function fromPuzzleRow(row: PuzzleRow): PuzzleDefinition {
  return {
    id: row.id,
    songId: row.song_id,
    date: row.puzzle_date ?? undefined,
    officialLink: row.official_link ?? undefined,
    stems: [...(row.stems ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((stem) => ({
        position: stem.position,
        instrument: stem.instrument_label,
        src: publicStorageUrl(stem.storage_path),
      })),
  };
}

export async function getPuzzleForDate(dateStr: string): Promise<PuzzleDefinition> {
  const rows = await supabaseGet<PuzzleRow[]>(
    `puzzles?puzzle_date=eq.${dateStr}&status=in.(scheduled,published)&select=id,song_id,puzzle_date,official_link,stems(position,instrument_label,storage_path)&limit=1`
  );
  if (rows?.[0]) return fromPuzzleRow(rows[0]);

  const exact = PUZZLES.find((p) => p.date === dateStr);
  if (exact) return exact;
  const undated = PUZZLES.filter((p) => !p.date);
  if (undated.length === 0) throw new Error(`No puzzle available for ${dateStr}`);
  const n = puzzleNumberForDate(dateStr);
  // Deterministic rotation so the demo always has a "today" puzzle.
  return undated[((n - 1) % undated.length + undated.length) % undated.length];
}

export async function getPuzzleById(id: string): Promise<PuzzleDefinition | undefined> {
  const encoded = encodeURIComponent(id);
  const rows = await supabaseGet<PuzzleRow[]>(
    `puzzles?id=eq.${encoded}&select=id,song_id,puzzle_date,official_link,stems(position,instrument_label,storage_path)&limit=1`
  );
  return rows ? rows[0] && fromPuzzleRow(rows[0]) : PUZZLES.find((p) => p.id === id);
}

export async function listScheduledPuzzles(limit = 30): Promise<PuzzleDefinition[]> {
  const rows = await supabaseGet<PuzzleRow[]>(
    `puzzles?status=in.(scheduled,published)&select=id,song_id,puzzle_date,official_link,stems(position,instrument_label,storage_path)&order=puzzle_date.asc&limit=${limit}`
  );
  if (rows) return rows.map(fromPuzzleRow);
  return [...PUZZLES]
    .filter((p) => p.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(0, limit);
}

export interface PlayableDate {
  date: string;
  number: number;
}

/**
 * Dates with a playable puzzle from the epoch up to (and including) `today`,
 * newest first. Only date + puzzle number — song info would be a spoiler.
 */
export async function listPlayableDates(today: string, limit = 90): Promise<PlayableDate[]> {
  const rows = await supabaseGet<{ puzzle_date: string }[]>(
    `puzzles?puzzle_date=lte.${today}&puzzle_date=gte.${EPOCH_DATE}&status=in.(scheduled,published)&select=puzzle_date&order=puzzle_date.desc&limit=${limit}`
  );
  if (rows) {
    return rows.map((r) => ({ date: r.puzzle_date, number: puzzleNumberForDate(r.puzzle_date) }));
  }

  // Local fallback: dated puzzles, plus the demo rotation which makes every
  // day from the epoch playable.
  const hasRotation = PUZZLES.some((p) => !p.date);
  const dates = new Set<string>(
    PUZZLES.map((p) => p.date).filter((d): d is string => Boolean(d) && d! <= today && d! >= EPOCH_DATE)
  );
  if (hasRotation) {
    let t = Date.parse(EPOCH_DATE);
    const end = Date.parse(today);
    for (let i = 0; i < limit && t <= end; i++, t += 86_400_000) {
      dates.add(new Date(t).toISOString().slice(0, 10));
    }
  }
  return [...dates]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, limit)
    .map((date) => ({ date, number: puzzleNumberForDate(date) }));
}

export function toPublicPuzzle(def: PuzzleDefinition, dateStr: string): PublicPuzzle {
  return {
    id: def.id,
    number: puzzleNumberForDate(dateStr),
    date: dateStr,
    stems: def.stems,
    maxAttempts: Math.max(1, Math.min(6, def.stems.length)),
  };
}
