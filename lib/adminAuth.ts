import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "./supabase";

const ADMIN_COOKIE = "dhundle-admin";
const AUTH_ACCESS_COOKIE = "dhundle-sb-access";
const AUTH_REFRESH_COOKIE = "dhundle-sb-refresh";
const PKCE_COOKIE = "dhundle-pkce";
const AUTH_NEXT_COOKIE = "dhundle-auth-next";

export interface SupabaseUser {
  id: string;
  email?: string;
}

function adminSecret(): string | null {
  return process.env.ADMIN_SECRET || null;
}

function sign(value: string): string {
  return createHmac("sha256", adminSecret() || "dhundle-dev-admin-secret")
    .update(value)
    .digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function createAdminCookieValue(): string {
  const value = randomBytes(18).toString("base64url");
  return `${value}.${sign(value)}`;
}

export function isValidAdminCookie(value?: string): boolean {
  if (!value || !adminSecret()) return false;
  const [body, signature] = value.split(".");
  return Boolean(body && signature && safeEqual(signature, sign(body)));
}

export function verifyAdminSecret(secret: unknown): boolean {
  const expected = adminSecret();
  return typeof secret === "string" && expected !== null && safeEqual(secret, expected);
}

export function safeAuthRedirect(value: string | null | undefined, fallback = "/"): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\") ||
    trimmed.startsWith("/api/auth/callback")
  ) {
    return fallback;
  }
  return trimmed.slice(0, 240);
}

export function signInPath(nextPath: string, provider = "google"): string {
  const params = new URLSearchParams({
    provider,
    next: safeAuthRedirect(nextPath),
  });
  return `/api/auth/sign-in?${params.toString()}`;
}

function normalizeSupabaseUser(value: unknown): SupabaseUser | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { id?: unknown; email?: unknown };
  if (typeof record.id !== "string" || !record.id) return null;
  return {
    id: record.id,
    email: typeof record.email === "string" ? record.email : undefined,
  };
}

async function fetchSupabaseUser(accessToken: string | undefined): Promise<SupabaseUser | null> {
  const config = getSupabaseConfig();
  if (!config || !accessToken) return null;
  const res = await fetch(`${config.url}/auth/v1/user`, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return normalizeSupabaseUser(await res.json());
}

export async function currentSupabaseUser(): Promise<SupabaseUser | null> {
  const accessToken = (await cookies()).get(AUTH_ACCESS_COOKIE)?.value;
  return fetchSupabaseUser(accessToken);
}

export async function currentSupabaseUserFromRequest(req: NextRequest): Promise<SupabaseUser | null> {
  return fetchSupabaseUser(req.cookies.get(AUTH_ACCESS_COOKIE)?.value);
}

export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  if (isValidAdminCookie(store.get(ADMIN_COOKIE)?.value)) return true;
  const user = await currentSupabaseUser();
  const email = user?.email?.toLowerCase();
  return Boolean(email && adminEmails().has(email));
}

export async function assertAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new Error("Admin access required");
}

export function isAdminRequest(req: NextRequest): boolean {
  return isValidAdminCookie(req.cookies.get(ADMIN_COOKIE)?.value);
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export const adminCookieName = ADMIN_COOKIE;
export const authAccessCookieName = AUTH_ACCESS_COOKIE;
export const authRefreshCookieName = AUTH_REFRESH_COOKIE;
export const pkceCookieName = PKCE_COOKIE;
export const authNextCookieName = AUTH_NEXT_COOKIE;
