// Leaderboard aggregation. Works on top of lib/results.ts, so it follows the
// same dual backend (Supabase or the local dev results file).
//
// Privacy: raw device ids are the write credential for /api/result, so they
// never leave the server — every row gets an opaque hash id instead, and the
// caller can pass its own device id to have its row flagged with `isYou`.

import { createHash } from "node:crypto";
import { getPuzzleForDate } from "./puzzles";
import { listRecentResults, listResultsForPuzzle } from "./results";

export interface DailyEntry {
  id: string;
  name: string;
  isYou: boolean;
  won: boolean;
  attempts: number;
  hintsUsed: number;
  finishedAt: string;
}

export interface AllTimeEntry {
  id: string;
  name: string;
  isYou: boolean;
  played: number;
  wins: number;
  winPct: number;
  avgAttempts: number;
}

function playerKey(row: { userId: string | null; deviceId: string }): string {
  return row.userId ? `user:${row.userId}` : `device:${row.deviceId}`;
}

function opaqueId(identity: string): string {
  return createHash("sha256").update(identity).digest("hex").slice(0, 10);
}

function displayName(name: string | null, id: string): string {
  return name?.trim() || `Player ${id.slice(0, 4).toUpperCase()}`;
}

/** Ranked results for one date's puzzle: wins first, fewer guesses, fewer hints, faster. */
export async function getDailyLeaderboard(
  date: string,
  meUserId: string
): Promise<DailyEntry[]> {
  let puzzleId: string;
  try {
    puzzleId = (await getPuzzleForDate(date)).id;
  } catch {
    return [];
  }
  const rows = await listResultsForPuzzle(puzzleId);
  return rows
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "won" ? -1 : 1;
      if (a.attempts !== b.attempts) return a.attempts - b.attempts;
      if (a.hintsUsed !== b.hintsUsed) return a.hintsUsed - b.hintsUsed;
      return a.finishedAt.localeCompare(b.finishedAt);
    })
    .slice(0, 100)
    .map((r) => {
      const id = opaqueId(playerKey(r));
      return {
        id,
        name: displayName(r.displayName, id),
        isYou: r.userId === meUserId,
        won: r.status === "won",
        attempts: r.attempts,
        hintsUsed: r.hintsUsed,
        finishedAt: r.finishedAt,
      };
    });
}

/** Per-player aggregate over recent results: most wins first. */
export async function getAllTimeLeaderboard(
  meUserId: string
): Promise<AllTimeEntry[]> {
  const rows = await listRecentResults();
  const byPlayer = new Map<
    string,
    { name: string | null; played: number; wins: number; attemptSum: number; isYou: boolean }
  >();
  for (const r of rows) {
    const identity = playerKey(r);
    const entry = byPlayer.get(identity) ?? {
      name: null,
      played: 0,
      wins: 0,
      attemptSum: 0,
      isYou: r.userId === meUserId,
    };
    entry.played += 1;
    if (r.status === "won") {
      entry.wins += 1;
      entry.attemptSum += r.attempts;
    }
    if (r.displayName?.trim()) entry.name = r.displayName;
    byPlayer.set(identity, entry);
  }
  return [...byPlayer.entries()]
    .map(([identity, e]) => {
      const id = opaqueId(identity);
      return {
        id,
        name: displayName(e.name, id),
        isYou: e.isYou,
        played: e.played,
        wins: e.wins,
        winPct: e.played ? Math.round((e.wins / e.played) * 100) : 0,
        avgAttempts: e.wins ? Math.round((e.attemptSum / e.wins) * 10) / 10 : 0,
      };
    })
    .sort((a, b) => b.wins - a.wins || b.winPct - a.winPct || a.avgAttempts - b.avgAttempts)
    .slice(0, 100);
}
