// Finished-game results. Supabase `game_results` when configured; otherwise a
// local JSON file (data/results.local.json, gitignored) so the leaderboard
// works in dev too. One row per puzzle per device — replays never duplicate.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { GameStatus } from "./types";
import { isSupabaseConfigured, supabaseGet, supabasePatch, supabasePost } from "./supabase";

export interface FinishedGameResult {
  puzzleId: string;
  deviceId: string;
  userId?: string;
  status: Exclude<GameStatus, "playing">;
  attempts: number;
  hintsUsed: number;
  finishedAt: string;
  displayName?: string;
}

const LOCAL_RESULTS_PATH = join(process.cwd(), "data", "results.local.json");

function readLocalResults(): FinishedGameResult[] {
  try {
    if (!existsSync(LOCAL_RESULTS_PATH)) return [];
    return JSON.parse(readFileSync(LOCAL_RESULTS_PATH, "utf8")) as FinishedGameResult[];
  } catch {
    return [];
  }
}

function writeLocalResults(results: FinishedGameResult[]): void {
  try {
    mkdirSync(dirname(LOCAL_RESULTS_PATH), { recursive: true });
    writeFileSync(LOCAL_RESULTS_PATH, JSON.stringify(results, null, 2) + "\n");
  } catch {
    // read-only filesystem (deployed without Supabase) — results are dropped
  }
}

export async function recordFinishedGame(result: FinishedGameResult): Promise<void> {
  if (result.userId) {
    const signedPayload = {
      puzzle_id: result.puzzleId,
      user_id: result.userId,
      anonymous_device_id: null,
      status: result.status,
      attempts: result.attempts,
      hints_used: result.hintsUsed,
      finished_at: result.finishedAt,
      display_name: result.displayName ?? null,
    };
    try {
      const claimed = await supabasePatch<unknown[]>(
        `game_results?puzzle_id=eq.${encodeURIComponent(
          result.puzzleId
        )}&anonymous_device_id=eq.${encodeURIComponent(result.deviceId)}&user_id=is.null`,
        {
          user_id: result.userId,
          status: result.status,
          attempts: result.attempts,
          hints_used: result.hintsUsed,
          finished_at: result.finishedAt,
          display_name: result.displayName ?? null,
        }
      );
      if (claimed?.length) return;
    } catch {
      // A signed row may already exist; fall through to the account upsert.
    }

    const rows = await supabasePost<unknown[]>(
      "game_results?on_conflict=puzzle_id,user_id",
      signedPayload
    );
    if (rows) return;
  } else {
    const rows = await supabasePost<unknown[]>(
      "game_results?on_conflict=puzzle_id,anonymous_device_id",
      {
        puzzle_id: result.puzzleId,
        anonymous_device_id: result.deviceId,
        status: result.status,
        attempts: result.attempts,
        hints_used: result.hintsUsed,
        finished_at: result.finishedAt,
        display_name: result.displayName ?? null,
      }
    );
    if (rows) return;
  }

  const all = readLocalResults();
  const key = (r: FinishedGameResult) => `${r.puzzleId}:${r.userId ?? r.deviceId}`;
  const existing = all.find((r) => key(r) === key(result));
  if (existing) {
    // Keep the first finish; only the display name may be updated later.
    if (result.displayName !== undefined) existing.displayName = result.displayName;
  } else {
    all.push(result);
  }
  writeLocalResults(all);
}

// ---------------------------------------------------------------- read side

export interface ResultRow {
  deviceId: string;
  userId: string | null;
  displayName: string | null;
  status: "won" | "lost";
  attempts: number;
  hintsUsed: number;
  finishedAt: string;
  puzzleId: string;
}

interface GameResultRow {
  anonymous_device_id: string | null;
  user_id: string | null;
  display_name: string | null;
  status: "won" | "lost";
  attempts: number;
  hints_used: number;
  finished_at: string;
  puzzle_id: string;
}

function fromRow(row: GameResultRow): ResultRow {
  return {
    deviceId: row.anonymous_device_id ?? "unknown",
    userId: row.user_id,
    displayName: row.display_name,
    status: row.status,
    attempts: row.attempts,
    hintsUsed: row.hints_used,
    finishedAt: row.finished_at,
    puzzleId: row.puzzle_id,
  };
}

const SELECT =
  "select=anonymous_device_id,user_id,display_name,status,attempts,hints_used,finished_at,puzzle_id";
// Before migration 0002 the display_name column doesn't exist yet.
const SELECT_LEGACY =
  "select=anonymous_device_id,status,attempts,hints_used,finished_at,puzzle_id";

async function queryResults(filter: string): Promise<ResultRow[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const rows = await supabaseGet<GameResultRow[]>(`game_results?${filter}&${SELECT}`);
    return rows ? rows.map(fromRow) : null;
  } catch {
    const rows = await supabaseGet<GameResultRow[]>(`game_results?${filter}&${SELECT_LEGACY}`);
    return rows ? rows.map((r) => fromRow({ ...r, user_id: null, display_name: null })) : null;
  }
}

export async function listResultsForPuzzle(puzzleId: string): Promise<ResultRow[]> {
  const remote = await queryResults(
    `puzzle_id=eq.${encodeURIComponent(puzzleId)}&order=finished_at.asc&limit=500`
  );
  if (remote) return remote;
  return readLocalResults()
    .filter((r) => r.puzzleId === puzzleId)
    .sort((a, b) => a.finishedAt.localeCompare(b.finishedAt))
    .map((r) => ({
      deviceId: r.deviceId,
      userId: r.userId ?? null,
      displayName: r.displayName ?? null,
      status: r.status,
      attempts: r.attempts,
      hintsUsed: r.hintsUsed,
      finishedAt: r.finishedAt,
      puzzleId: r.puzzleId,
    }));
}

export async function listRecentResults(limit = 2000): Promise<ResultRow[]> {
  const remote = await queryResults(`order=finished_at.desc&limit=${limit}`);
  if (remote) return remote;
  return readLocalResults()
    .slice(-limit)
    .map((r) => ({
      deviceId: r.deviceId,
      userId: r.userId ?? null,
      displayName: r.displayName ?? null,
      status: r.status,
      attempts: r.attempts,
      hintsUsed: r.hintsUsed,
      finishedAt: r.finishedAt,
      puzzleId: r.puzzleId,
    }));
}

export async function listResultsForUser(userId: string, limit = 2000): Promise<ResultRow[]> {
  const remote = await queryResults(
    `user_id=eq.${encodeURIComponent(userId)}&order=finished_at.desc&limit=${limit}`
  );
  if (remote) return remote;
  return readLocalResults()
    .filter((r) => r.userId === userId)
    .slice(-limit)
    .map((r) => ({
      deviceId: r.deviceId,
      userId: r.userId ?? null,
      displayName: r.displayName ?? null,
      status: r.status,
      attempts: r.attempts,
      hintsUsed: r.hintsUsed,
      finishedAt: r.finishedAt,
      puzzleId: r.puzzleId,
    }));
}
