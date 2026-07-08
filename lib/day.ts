// Day boundary logic. Dhoondle days roll over at midnight IST (Asia/Kolkata).

/** Dhoondle #1 corresponds to this IST date. */
export const EPOCH_DATE = "2026-07-07";

const IST_OFFSET_MINUTES = 5.5 * 60;

/** Current date string (YYYY-MM-DD) in IST. */
export function todayIST(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + IST_OFFSET_MINUTES * 60_000);
  return ist.toISOString().slice(0, 10);
}

/** Puzzle number for a given IST date string (epoch date = #1). */
export function puzzleNumberForDate(dateStr: string): number {
  const days =
    (Date.parse(dateStr) - Date.parse(EPOCH_DATE)) / 86_400_000;
  return Math.round(days) + 1;
}

/** Milliseconds until the next midnight IST. */
export function msUntilNextPuzzle(now: Date = new Date()): number {
  const istNow = new Date(now.getTime() + IST_OFFSET_MINUTES * 60_000);
  const nextMidnightUTCms = Date.UTC(
    istNow.getUTCFullYear(),
    istNow.getUTCMonth(),
    istNow.getUTCDate() + 1
  );
  return nextMidnightUTCms - IST_OFFSET_MINUTES * 60_000 - now.getTime();
}
