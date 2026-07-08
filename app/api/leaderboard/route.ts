import { NextRequest, NextResponse } from "next/server";
import { currentSupabaseUserFromRequest } from "@/lib/adminAuth";
import { EPOCH_DATE, todayIST } from "@/lib/day";
import { getAllTimeLeaderboard, getDailyLeaderboard } from "@/lib/leaderboard";
import { normalizeDeviceId, rateLimit } from "@/lib/serverGuard";
import { isSupabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Public leaderboard read. `?scope=daily|alltime`, optional `?date=` (daily,
 * defaults to today), optional `?me=<deviceId>` to flag the caller's own row —
 * device ids go in but only opaque hashes come out.
 */
export async function GET(req: NextRequest) {
  const scope = req.nextUrl.searchParams.get("scope") ?? "daily";
  const user = await currentSupabaseUserFromRequest(req);
  const fallbackMe = normalizeDeviceId(req.nextUrl.searchParams.get("me"));
  if (!user && isSupabaseConfigured()) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "local";
  const limited = rateLimit("leaderboard", ip, 30);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  if (scope === "alltime") {
    return NextResponse.json({
      scope,
      entries: await getAllTimeLeaderboard(user?.id ?? fallbackMe ?? ""),
    });
  }

  const today = todayIST();
  const date = req.nextUrl.searchParams.get("date") ?? today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today || date < EPOCH_DATE) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  return NextResponse.json({
    scope: "daily",
    date,
    entries: await getDailyLeaderboard(date, user?.id ?? fallbackMe ?? ""),
  });
}
