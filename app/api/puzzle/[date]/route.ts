import { NextRequest, NextResponse } from "next/server";
import { EPOCH_DATE, todayIST } from "@/lib/day";
import { getPuzzleForDate, toPublicPuzzle } from "@/lib/puzzles";

export const dynamic = "force-dynamic";

/**
 * Puzzle for a past date (the archive). Future dates are rejected outright so
 * the schedule can never leak; the answer still only comes from /api/guess.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ date: string }> }
) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  const today = todayIST();
  if (date > today || date < EPOCH_DATE) {
    return NextResponse.json({ error: "No puzzle for that date" }, { status: 404 });
  }
  try {
    const puzzle = await getPuzzleForDate(date);
    return NextResponse.json(toPublicPuzzle(puzzle, date));
  } catch {
    return NextResponse.json({ error: "No puzzle for that date" }, { status: 404 });
  }
}
