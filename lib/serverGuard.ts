import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

const TOKEN_VERSION = "v1";
const TOKEN_TTL_MS = 30 * 60 * 60 * 1000;
const BUCKET_TTL_MS = 60_000;

interface PlayTokenPayload {
  puzzleId: string;
  deviceId: string;
  attempts: number;
  issuedAt: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const rateBuckets = new Map<string, Bucket>();
const attemptBuckets = new Map<string, Bucket>();

function secret(): string {
  return process.env.DHUNDLE_TOKEN_SECRET || "dhundle-dev-token-secret";
}

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function cleanExpired(map: Map<string, Bucket>, now: number): void {
  if (map.size < 2000) return;
  for (const [key, bucket] of map) {
    if (bucket.resetAt <= now) map.delete(key);
  }
}

export function normalizeDeviceId(deviceId: unknown): string | null {
  if (typeof deviceId !== "string") return null;
  const trimmed = deviceId.trim();
  return /^[a-zA-Z0-9_-]{16,80}$/.test(trimmed) ? trimmed : null;
}

export function requestIdentity(req: NextRequest, deviceId: string): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = req.headers.get("x-real-ip")?.trim();
  const ip = forwarded || realIp || "local";
  return `${ip}:${deviceId}`;
}

export function rateLimit(
  scope: string,
  identity: string,
  limit: number
): { allowed: true } | { allowed: false; retryAfter: number } {
  const now = Date.now();
  cleanExpired(rateBuckets, now);
  const key = `${scope}:${identity}`;
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + BUCKET_TTL_MS });
    return { allowed: true };
  }
  bucket.count += 1;
  if (bucket.count <= limit) return { allowed: true };
  return { allowed: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
}

export function createPlayToken(payload: PlayTokenPayload): string {
  const body = toBase64Url(JSON.stringify(payload));
  return `${TOKEN_VERSION}.${body}.${sign(`${TOKEN_VERSION}.${body}`)}`;
}

export function readPlayToken(
  token: unknown,
  puzzleId: string,
  deviceId: string
): PlayTokenPayload | null {
  if (typeof token !== "string") return null;
  const [version, body, signature] = token.split(".");
  if (version !== TOKEN_VERSION || !body || !signature) return null;
  if (!safeEqual(signature, sign(`${version}.${body}`))) return null;
  try {
    const payload = JSON.parse(fromBase64Url(body)) as PlayTokenPayload;
    if (payload.puzzleId !== puzzleId || payload.deviceId !== deviceId) return null;
    if (!Number.isInteger(payload.attempts) || payload.attempts < 0) return null;
    if (Date.now() - payload.issuedAt > TOKEN_TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

export function consumeAttempt(
  puzzleId: string,
  deviceId: string,
  token: unknown,
  maxAttempts: number
): { attempt: number; playToken: string } {
  const now = Date.now();
  cleanExpired(attemptBuckets, now);
  const key = `${puzzleId}:${deviceId}`;
  const tokenAttempts = readPlayToken(token, puzzleId, deviceId)?.attempts ?? 0;
  const bucket = attemptBuckets.get(key);
  const knownAttempts = bucket && bucket.resetAt > now ? bucket.count : 0;
  const attempt = Math.min(Math.max(tokenAttempts, knownAttempts) + 1, maxAttempts);
  attemptBuckets.set(key, { count: attempt, resetAt: now + TOKEN_TTL_MS });
  return {
    attempt,
    playToken: createPlayToken({ puzzleId, deviceId, attempts: attempt, issuedAt: now }),
  };
}
