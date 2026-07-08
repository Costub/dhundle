import { NextRequest, NextResponse } from "next/server";
import {
  adminCookieName,
  authAccessCookieName,
  authRefreshCookieName,
  safeAuthRedirect,
} from "@/lib/adminAuth";

export async function POST(req: NextRequest) {
  let requestedNext = req.nextUrl.searchParams.get("next");
  try {
    const form = await req.formData();
    requestedNext = String(form.get("next") || requestedNext || "");
  } catch {
    // Non-form sign-out requests can still use the query string.
  }
  const res = NextResponse.redirect(new URL(safeAuthRedirect(requestedNext, "/admin"), req.url));
  res.cookies.delete(adminCookieName);
  res.cookies.delete(authAccessCookieName);
  res.cookies.delete(authRefreshCookieName);
  return res;
}
