/**
 * Admin session: signed cookie (admin_session).
 * Uses ADMIN_SESSION_SECRET or CRON_SECRET. No secret = no auth in dev.
 */

import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "admin_session";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getSecret(): string {
  const s = process.env.ADMIN_SESSION_SECRET ?? process.env.CRON_SECRET;
  return s ?? "dev-session-secret-change-in-production";
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function createSession(): { name: string; value: string; maxAge: number } {
  const payload = JSON.stringify({ v: 1, t: Date.now() });
  const signature = sign(payload);
  const value = Buffer.from(payload, "utf8").toString("base64url") + "." + signature;
  return { name: COOKIE_NAME, value, maxAge: MAX_AGE_MS / 1000 };
}

export function verifySession(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`, "i"));
  const raw = match?.[1]?.trim();
  if (!raw) return false;
  const [payloadB64, sig] = raw.split(".");
  if (!payloadB64 || !sig) return false;
  try {
    const payload = Buffer.from(payloadB64, "base64url").toString("utf8");
    const expected = sign(payload);
    if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(sig, "utf8")))
      return false;
    const data = JSON.parse(payload) as { v?: number; t?: number };
    if (data.v !== 1 || typeof data.t !== "number") return false;
    if (Date.now() - data.t > MAX_AGE_MS) return false;
    return true;
  } catch {
    return false;
  }
}

export function clearSession(): { name: string; value: string; maxAge: number } {
  return { name: COOKIE_NAME, value: "", maxAge: 0 };
}

export function getCookieName(): string {
  return COOKIE_NAME;
}

/** For API routes: when ADMIN_PASSWORD is set, require valid session. Returns null if allowed, or a Response to return (401/503). */
export function requireAdminSession(cookieHeader: string | null): Response | null {
  if (!process.env.ADMIN_PASSWORD) return null;
  if (verifySession(cookieHeader)) return null;
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
