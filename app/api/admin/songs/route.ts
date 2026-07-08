import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/adminAuth";
import { deactivateSong, upsertSong } from "@/lib/adminStore";
import type { Song } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Create or update a catalog song. JSON body matching the Song shape. */
export async function POST(req: NextRequest) {
  try {
    await assertAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required" }, { status: 401 });
  }

  let body: Partial<Song>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const singers = Array.isArray(body.singers) ? body.singers.map(String) : [];
  const song: Song = {
    id: String(body.id ?? "").trim(),
    title: String(body.title ?? "").trim(),
    movie: String(body.movie ?? "").trim(),
    year: Number(body.year),
    singers,
    actors: Array.isArray(body.actors) ? body.actors.map(String) : undefined,
    musicDirector: String(body.musicDirector ?? singers[0] ?? "Unknown").trim(),
    aliases: Array.isArray(body.aliases) ? body.aliases.map(String) : undefined,
  };

  try {
    await upsertSong(song);
    return NextResponse.json({ ok: true, id: song.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save song";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** Deactivate (Supabase) or remove (local) a song: DELETE ?id=<slug>. */
export async function DELETE(req: NextRequest) {
  try {
    await assertAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    await deactivateSong(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not remove song";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
