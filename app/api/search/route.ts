import { NextRequest, NextResponse } from "next/server";
import { searchTracks } from "@/lib/musicSearch";
import { rateLimit } from "@/lib/serverGuard";

export const dynamic = "force-dynamic";

/**
 * Guess-box song search, proxied server-side so provider credentials never
 * reach the client. Returns public track metadata only — nothing about the
 * answer is involved here.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2 || q.length > 80) {
    return NextResponse.json({ results: [] });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "local";
  const limited = rateLimit("search", ip, 40);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Too many searches" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  return NextResponse.json({ results: await searchTracks(q) });
}
