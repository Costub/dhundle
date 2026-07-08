import { NextRequest, NextResponse } from "next/server";
import {
  authAccessCookieName,
  authNextCookieName,
  authRefreshCookieName,
  pkceCookieName,
  safeAuthRedirect,
} from "@/lib/adminAuth";
import { getSupabaseConfig } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const config = getSupabaseConfig();
  const code = req.nextUrl.searchParams.get("code");
  const verifier = req.cookies.get(pkceCookieName)?.value;
  const nextPath = safeAuthRedirect(req.cookies.get(authNextCookieName)?.value, "/admin");
  if (!config || !code || !verifier) {
    const failed = new URL(nextPath, req.url);
    failed.searchParams.set("error", "auth-callback");
    return NextResponse.redirect(failed);
  }

  const tokenRes = await fetch(`${config.url}/auth/v1/token?grant_type=pkce`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
    cache: "no-store",
  });
  if (!tokenRes.ok) {
    const failed = new URL(nextPath, req.url);
    failed.searchParams.set("error", "auth-token");
    return NextResponse.redirect(failed);
  }
  const data = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  const res = NextResponse.redirect(new URL(nextPath, req.url));
  res.cookies.delete(pkceCookieName);
  res.cookies.delete(authNextCookieName);
  res.cookies.set(authAccessCookieName, data.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: data.expires_in ?? 3600,
  });
  if (data.refresh_token) {
    res.cookies.set(authRefreshCookieName, data.refresh_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return res;
}
