import { NextResponse } from "next/server";
import { todayIST } from "@/lib/day";
import { getPuzzleForDate, toPublicPuzzle } from "@/lib/puzzles";

export const dynamic = "force-dynamic";

export async function GET() {
  const date = todayIST();
  try {
    const puzzle = await getPuzzleForDate(date);
    // Only the public shape leaves the server — never the songId.
    return NextResponse.json(toPublicPuzzle(puzzle, date));
  } catch {
    return NextResponse.json(
      { error: "No puzzle scheduled for today. Check back soon!" },
      { status: 404 }
    );
  }
}
