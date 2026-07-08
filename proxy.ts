import { NextRequest, NextResponse } from "next/server";

// Supabase access tokens live ~1 hour; the refresh token lives 30 days. This
// proxy silently exchanges a refresh token for a fresh access token when the
// access cookie has expired, so signed-in players aren't bounced back to the
// sign-in gate (and /api/result doesn't 401) on their next visit.
//
// Cookie names must stay in sync with lib/adminAuth.ts (the proxy bundle is
// separate from the app, so it keeps its own copies instead of importing).
const ACCESS_COOKIE = "dhundle-sb-access";
const REFRESH_COOKIE = "dhundle-sb-refresh";

function supabaseConfig(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || url.includes("<") || key.includes("<")) return null;
  try {
    new URL(url);
  } catch {
    return null;
  }
  return { url: url.replace(/\/$/, ""), key };
}

export default async function proxy(req: NextRequest) {
  // Fast path: access token still valid, or nothing to refresh with.
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  if (req.cookies.get(ACCESS_COOKIE)?.value || !refreshToken) {
    return NextResponse.next();
  }
  const config = supabaseConfig();
  if (!config) return NextResponse.next();

  try {
    const tokenRes = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: config.key, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    });
    if (!tokenRes.ok) {
      // Revoked/expired refresh token — drop it so we stop retrying.
      const res = NextResponse.next();
      res.cookies.delete(REFRESH_COOKIE);
      return res;
    }
    const data = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    // Forward the fresh token to THIS request's server code (RSC/route
    // handlers read cookies from the request headers).
    const requestHeaders = new Headers(req.headers);
    const existing = requestHeaders.get("cookie");
    requestHeaders.set(
      "cookie",
      `${existing ? `${existing}; ` : ""}${ACCESS_COOKIE}=${data.access_token}`
    );
    const res = NextResponse.next({ request: { headers: requestHeaders } });

    const cookieOpts = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
    };
    res.cookies.set(ACCESS_COOKIE, data.access_token, {
      ...cookieOpts,
      maxAge: data.expires_in ?? 3600,
    });
    if (data.refresh_token) {
      res.cookies.set(REFRESH_COOKIE, data.refresh_token, {
        ...cookieOpts,
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    return res;
  } catch {
    // Network hiccup — behave as signed-out rather than failing the request.
    return NextResponse.next();
  }
}

export const config = {
  // Skip static assets and stem audio; everything else gets the cheap cookie check.
  matcher: ["/((?!_next/|stems/|favicon\\.ico).*)"],
};
