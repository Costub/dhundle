import { NextRequest, NextResponse } from "next/server";
import {
  adminCookieName,
  createAdminCookieValue,
  verifyAdminSecret,
} from "@/lib/adminAuth";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  if (!verifyAdminSecret(form.get("secret"))) {
    return NextResponse.redirect(new URL("/admin?error=invalid-secret", req.url));
  }
  const res = NextResponse.redirect(new URL("/admin", req.url));
  res.cookies.set(adminCookieName, createAdminCookieValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return res;
}
