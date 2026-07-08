// Client-side persistence (localStorage). Safe to import in client components only.

import type { GameState, PlayerStats } from "./types";
import { MAX_ATTEMPTS } from "./types";

const STATE_KEY = "dhundle-state-v1";
const STATS_KEY = "dhundle-stats-v1";
const DEVICE_KEY = "dhundle-device-id-v1";
const ARCHIVE_STATE_PREFIX = "dhundle-archive-state-v1:";
const ARCHIVE_RESULTS_KEY = "dhundle-archive-results-v1";
const NAME_KEY = "dhundle-player-name-v1";

export function loadGameState(): GameState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as GameState) : null;
  } catch {
    return null;
  }
}

export function saveGameState(state: GameState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // storage full/blocked — game still works for the session
  }
}

export function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const generated =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_KEY, generated);
    return generated;
  } catch {
    return "memory-only-device";
  }
}

// --- Archive (past challenges) ---------------------------------------------
// Archive plays are stored per date, completely separate from the daily state
// and stats, so replaying old puzzles never touches the daily streak.

export function loadArchiveState(date: string): GameState | null {
  try {
    const raw = localStorage.getItem(ARCHIVE_STATE_PREFIX + date);
    return raw ? (JSON.parse(raw) as GameState) : null;
  } catch {
    return null;
  }
}

export function saveArchiveState(state: GameState): void {
  try {
    localStorage.setItem(ARCHIVE_STATE_PREFIX + state.date, JSON.stringify(state));
  } catch {
    // non-fatal
  }
}

export interface ArchiveResult {
  status: "won" | "lost";
  attempts: number;
  maxAttempts?: number;
}

export function loadArchiveResults(): Record<string, ArchiveResult> {
  try {
    const raw = localStorage.getItem(ARCHIVE_RESULTS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ArchiveResult>) : {};
  } catch {
    return {};
  }
}

export function recordArchiveResult(date: string, result: ArchiveResult): void {
  try {
    const all = loadArchiveResults();
    all[date] = result;
    localStorage.setItem(ARCHIVE_RESULTS_KEY, JSON.stringify(all));
  } catch {
    // non-fatal
  }
}

// --- Player display name (for the leaderboard) ------------------------------

export function getPlayerName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setPlayerName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name.trim().slice(0, 24));
  } catch {
    // non-fatal
  }
}

export function emptyStats(): PlayerStats {
  return {
    played: 0,
    won: 0,
    currentStreak: 0,
    maxStreak: 0,
    distribution: Array(MAX_ATTEMPTS).fill(0),
  };
}

export function loadStats(): PlayerStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    return raw ? { ...emptyStats(), ...JSON.parse(raw) } : emptyStats();
  } catch {
    return emptyStats();
  }
}

function previousDate(dateStr: string): string {
  return new Date(Date.parse(dateStr) - 86_400_000).toISOString().slice(0, 10);
}

/** Record a finished game into stats and persist. Call exactly once per puzzle. */
export function recordResult(
  won: boolean,
  attempts: number,
  date: string
): PlayerStats {
  const stats = loadStats();
  if (stats.lastPlayedDate === date) return stats; // already recorded
  stats.played += 1;
  stats.lastPlayedDate = date;
  if (won) {
    stats.won += 1;
    stats.distribution[Math.min(attempts, MAX_ATTEMPTS) - 1] += 1;
    stats.currentStreak =
      stats.lastWinDate === previousDate(date) ? stats.currentStreak + 1 : 1;
    stats.lastWinDate = date;
    stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
  } else {
    stats.currentStreak = 0;
  }
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    // non-fatal
  }
  return stats;
}
