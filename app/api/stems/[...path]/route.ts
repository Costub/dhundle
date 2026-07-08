import { NextResponse } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function cleanPath(segments: string[]): string | null {
  if (
    segments.length === 0 ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return null;
  }
  return segments.map(encodeURIComponent).join("/");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const config = getSupabaseConfig();
  if (!config) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 404 });
  }

  const { path } = await params;
  const storagePath = cleanPath(path);
  if (!storagePath) {
    return NextResponse.json({ error: "Invalid stem path" }, { status: 400 });
  }

  const res = await fetch(`${config.url}/storage/v1/object/stems/${storagePath}`, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
    },
    cache: "no-store",
  });

  if (!res.ok || !res.body) {
    const message = await res.text().catch(() => "");
    return NextResponse.json(
      { error: message || `Could not load stem (${res.status})` },
      { status: res.status }
    );
  }

  const headers = new Headers();
  headers.set("Content-Type", res.headers.get("Content-Type") || "audio/ogg");
  headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  const length = res.headers.get("Content-Length");
  if (length) headers.set("Content-Length", length);

  return new Response(res.body, { status: 200, headers });
}
