import { NextRequest, NextResponse } from "next/server";
import { currentSupabaseUserFromRequest } from "@/lib/adminAuth";
import { HINT_LABELS } from "@/lib/hints";
import { getPuzzleById } from "@/lib/puzzles";
import { recordFinishedGame } from "@/lib/results";
import { normalizeDeviceId, rateLimit, requestIdentity } from "@/lib/serverGuard";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { GameStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

interface ResultRequestBody {
  puzzleId: string;
  deviceId: string;
  status: Exclude<GameStatus, "playing">;
  attempts: number;
  hintsUsed: number;
  /** Optional leaderboard display name; re-posting a result may update it. */
  displayName?: string;
}

function sanitizeDisplayName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);
  return cleaned || undefined;
}

function isFinishedStatus(status: unknown): status is Exclude<GameStatus, "playing"> {
  return status === "won" || status === "lost";
}

export async function POST(req: NextRequest) {
  let body: ResultRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const deviceId = normalizeDeviceId(body.deviceId);
  if (
    typeof body.puzzleId !== "string" ||
    !deviceId ||
    !isFinishedStatus(body.status) ||
    !Number.isInteger(body.attempts) ||
    body.attempts < 1 ||
    !Number.isInteger(body.hintsUsed) ||
    body.hintsUsed < 0 ||
    body.hintsUsed > HINT_LABELS.length
  ) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const limited = rateLimit("result", requestIdentity(req, deviceId), 12);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Too many result writes. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  const puzzle = await getPuzzleById(body.puzzleId);
  if (!puzzle) {
    return NextResponse.json({ error: "Unknown puzzle" }, { status: 404 });
  }
  const maxAttempts = Math.max(1, Math.min(6, puzzle.stems.length));
  if (body.attempts > maxAttempts) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const user = await currentSupabaseUserFromRequest(req);
  if (!user && isSupabaseConfigured()) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  await recordFinishedGame({
    puzzleId: body.puzzleId,
    deviceId,
    userId: user?.id,
    status: body.status,
    attempts: body.attempts,
    hintsUsed: body.hintsUsed,
    finishedAt: new Date().toISOString(),
    displayName: sanitizeDisplayName(body.displayName),
  });

  return NextResponse.json({ ok: true });
}
