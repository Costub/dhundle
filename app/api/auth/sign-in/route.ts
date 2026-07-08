import { NextRequest, NextResponse } from "next/server";
import {
  authNextCookieName,
  createPkcePair,
  pkceCookieName,
  safeAuthRedirect,
} from "@/lib/adminAuth";
import { getSupabaseConfig } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const nextPath = safeAuthRedirect(req.nextUrl.searchParams.get("next"), "/admin");
  const config = getSupabaseConfig();
  if (!config) {
    const failed = new URL(nextPath, req.url);
    failed.searchParams.set("error", "supabase-not-configured");
    return NextResponse.redirect(failed);
  }
  const provider = req.nextUrl.searchParams.get("provider") || "google";
  const { verifier, challenge } = createPkcePair();
  const redirectTo = new URL("/api/auth/callback", req.nextUrl.origin);
  const target = new URL(`${config.url}/auth/v1/authorize`);
  target.searchParams.set("provider", provider);
  target.searchParams.set("redirect_to", redirectTo.toString());
  target.searchParams.set("code_challenge", challenge);
  target.searchParams.set("code_challenge_method", "S256");

  const res = NextResponse.redirect(target);
  res.cookies.set(pkceCookieName, verifier, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });
  res.cookies.set(authNextCookieName, nextPath, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });
  return res;
}
