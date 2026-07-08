import { NextRequest, NextResponse } from "next/server";
import { getSongById } from "@/lib/catalog";
import { hintForLabel, isHintLabel } from "@/lib/hints";
import { getPuzzleById } from "@/lib/puzzles";
import { normalizeDeviceId, rateLimit, requestIdentity } from "@/lib/serverGuard";

export const dynamic = "force-dynamic";

interface HintRequestBody {
  puzzleId: string;
  deviceId: string;
  /** One of HINT_LABELS, e.g. "Year" */
  label: string;
}

/**
 * Reveal a single metadata hint on demand. The client tracks how many hints
 * were used; the answer itself is still only ever returned by /api/guess
 * once the game is decided.
 */
export async function POST(req: NextRequest) {
  let body: HintRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { puzzleId, label } = body;
  const deviceId = normalizeDeviceId(body.deviceId);
  if (typeof puzzleId !== "string" || !deviceId || !isHintLabel(label)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const limited = rateLimit("hint", requestIdentity(req, deviceId), 20);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Too many hints. Try again shortly." },
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

  return NextResponse.json(hintForLabel(label, answer));
}
