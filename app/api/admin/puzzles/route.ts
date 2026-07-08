import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/adminAuth";
import type { AdminPuzzleInput } from "@/lib/adminPuzzles";
import {
  deletePuzzle,
  scheduleOrReplacePuzzle,
  scheduleOrReplacePuzzleFromExisting,
} from "@/lib/adminStore";

export const dynamic = "force-dynamic";

/**
 * Schedule (or replace) a puzzle. JSON body:
 * { songId, date, officialLink?, stems: [{ position, instrument, storagePath }] }
 * Works against Supabase when configured, local data/puzzles.json otherwise.
 */
export async function POST(req: NextRequest) {
  try {
    await assertAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required" }, { status: 401 });
  }

  let body: Partial<AdminPuzzleInput> & { copyFromPuzzleId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    if (body.copyFromPuzzleId) {
      await scheduleOrReplacePuzzleFromExisting({
        sourcePuzzleId: String(body.copyFromPuzzleId),
        date: String(body.date ?? ""),
        officialLink: body.officialLink ? String(body.officialLink) : undefined,
      });
    } else {
      await scheduleOrReplacePuzzle({
        songId: String(body.songId ?? ""),
        date: String(body.date ?? ""),
        officialLink: body.officialLink ? String(body.officialLink) : undefined,
        stems: Array.isArray(body.stems)
          ? body.stems.map((s) => ({
              position: Number(s.position),
              instrument: String(s.instrument ?? ""),
              storagePath: String(s.storagePath ?? ""),
            }))
          : [],
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not schedule puzzle";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** Remove a scheduled puzzle: DELETE ?id=<puzzle id or date>. Stem files are kept. */
export async function DELETE(req: NextRequest) {
  try {
    await assertAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    await deletePuzzle(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete puzzle";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
