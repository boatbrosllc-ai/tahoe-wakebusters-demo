/**
 * Admin auth via Firebase Auth session cookie.
 * Client signs in with Firebase (email/password), sends ID token to /api/admin/session;
 * server creates a session cookie and verifies it on protected routes.
 *
 * Super Admin is the first address in ADMIN_EMAIL (or PLATFORM_ADMIN_EMAIL).
 * Operators and captains are invited via Firestore `adminTeam` — they are not granted
 * access merely by appearing in ADMIN_EMAIL.
 */

import "server-only";
import { cache } from "react";
import { extractAdminSessionCookieValue } from "./admin-cookie-parse";
import { ADMIN_AUTH_VERIFICATION_UNAVAILABLE, ADMIN_SESSION_COOKIE_NAME } from "@/lib/admin-auth-constants";
import { getFirebaseApp } from "@/lib/booking/firebase-admin";
import { safeHasFirebaseConfig, getFirebaseConfigStatus } from "@/lib/booking/env";
import {
  getSuperAdminDisplayName,
  canAccessAdminPath,
  isSuperAdminEmail,
  normalizeAdminEmail,
  type AdminPrincipal,
} from "@/lib/admin/roles";
import { getActiveTeamMember } from "@/lib/admin/team-store";

export { ADMIN_AUTH_VERIFICATION_UNAVAILABLE };

const COOKIE_NAME = ADMIN_SESSION_COOKIE_NAME;
const SESSION_EXPIRES_MS = 5 * 24 * 60 * 60 * 1000;

export const FIREBASE_SETUP_HINT =
  "Set FIREBASE_SERVICE_ACCOUNT_JSON_PATH to your service account JSON path (Firebase Console → Project settings → Service accounts → Generate new private key), or set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY. Restart the dev server.";

/** ADMIN_EMAIL must be set so admin is considered configured. Only the first email is Super Admin; teammates use Team invites. */
export function getAllowedAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAIL?.trim() || process.env.PLATFORM_ADMIN_EMAIL?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

async function resolveAdminPrincipalUncached(email: string): Promise<AdminPrincipal | null> {
  const normalized = normalizeAdminEmail(email);
  if (!normalized) return null;
  if (isSuperAdminEmail(normalized)) {
    return { email: normalized, role: "super_admin", displayName: getSuperAdminDisplayName() };
  }
  try {
    const member = await getActiveTeamMember(normalized);
    if (!member) return null;
    return { email: normalized, role: member.role, displayName: member.name };
  } catch (err) {
    console.warn("[admin auth] team lookup failed", err);
    return null;
  }
}

export const resolveAdminPrincipal = cache(resolveAdminPrincipalUncached);

export async function emailMaySignInToAdmin(email: string | null | undefined): Promise<boolean> {
  return (await resolveAdminPrincipal(normalizeAdminEmail(email))) != null;
}

async function readRequestPathAndMethod(): Promise<{ pathname: string; method: string }> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    return {
      pathname: (h.get("x-pathname") ?? "").trim(),
      method: (h.get("x-method") ?? "GET").trim() || "GET",
    };
  } catch {
    return { pathname: "", method: "GET" };
  }
}

export async function createAdminSessionCookie(idToken: string): Promise<string> {
  const app = getFirebaseApp();
  return app.auth().createSessionCookie(idToken, { expiresIn: SESSION_EXPIRES_MS });
}

export { extractAdminSessionCookieValue } from "./admin-cookie-parse";

const INVALID_SESSION_FIREBASE_CODES = new Set([
  "auth/invalid-session-cookie",
  "auth/session-cookie-expired",
  "auth/session-cookie-revoked",
  "auth/argument-error",
  "auth/user-disabled",
  "auth/user-not-found",
]);

const OPERATIONAL_FIREBASE_AUTH_CODES = new Set([
  "auth/internal-error",
  "auth/network-request-failed",
  "unavailable",
  "deadline-exceeded",
]);

function firebaseAuthErrorCode(err: unknown): string {
  if (!err || typeof err !== "object") return "";
  const o = err as { code?: string; errorInfo?: { code?: string } };
  return (o.code ?? o.errorInfo?.code ?? "").trim();
}

export function isFirebaseAuthOperationalVerificationFailure(err: unknown): boolean {
  const code = firebaseAuthErrorCode(err);
  if (code && OPERATIONAL_FIREBASE_AUTH_CODES.has(code)) return true;
  if (code && INVALID_SESSION_FIREBASE_CODES.has(code)) return false;
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (/econnreset|etimedout|socket hang up|fetch failed|network|unavailable|503|502|504|deadline/i.test(lower)) {
    return true;
  }
  return false;
}

export type AdminSessionVerifyOutcome = "valid" | "invalid" | "unavailable";

export async function getAdminSessionVerifyOutcome(cookieHeader: string | null): Promise<AdminSessionVerifyOutcome> {
  const allowed = getAllowedAdminEmails();
  if (allowed.length === 0) return "invalid";
  const sessionCookie = extractAdminSessionCookieValue(cookieHeader);
  if (!sessionCookie) return "invalid";
  if (!safeHasFirebaseConfig()) return "invalid";
  try {
    const app = getFirebaseApp();
    const decoded = await app.auth().verifySessionCookie(sessionCookie, true);
    const email = decoded.email?.trim().toLowerCase();
    if (!email || !(await emailMaySignInToAdmin(email))) return "invalid";
    return "valid";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (process.env.NODE_ENV === "development") {
      console.warn("[admin auth] Session verify error:", firebaseAuthErrorCode(err) || msg);
    }
    if (isFirebaseAuthOperationalVerificationFailure(err)) return "unavailable";
    return "invalid";
  }
}

export async function verifyAdminSessionCookie(cookieHeader: string | null): Promise<boolean> {
  return (await getAdminSessionVerifyOutcome(cookieHeader)) === "valid";
}

export async function getAdminEmailFromSessionCookie(cookieHeader: string | null): Promise<string | null> {
  try {
    const sessionCookie = extractAdminSessionCookieValue(cookieHeader);
    if (!sessionCookie || !safeHasFirebaseConfig()) return null;
    const app = getFirebaseApp();
    const decoded = await app.auth().verifySessionCookie(sessionCookie, true);
    const email = decoded.email?.trim().toLowerCase();
    return email || null;
  } catch {
    return null;
  }
}

export async function getAdminPrincipalFromSessionCookie(cookieHeader: string | null): Promise<AdminPrincipal | null> {
  const email = await getAdminEmailFromSessionCookie(cookieHeader);
  if (!email) return null;
  return resolveAdminPrincipal(email);
}

export function getAdminSessionCookieName(): string {
  return COOKIE_NAME;
}

export async function requireAdminSession(cookieHeader: string | null): Promise<Response | null> {
  if (getAllowedAdminEmails().length === 0) {
    return new Response(JSON.stringify({ error: "Admin not configured (set ADMIN_EMAIL)" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!safeHasFirebaseConfig()) {
    let firebaseStatus: ReturnType<typeof getFirebaseConfigStatus> | undefined;
    try {
      firebaseStatus = getFirebaseConfigStatus();
    } catch {
      // ignore
    }
    return new Response(
      JSON.stringify({
        error: "Firebase/Firestore not configured for server.",
        hint: FIREBASE_SETUP_HINT,
        ...(firebaseStatus && { firebaseStatus }),
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
  const outcome = await getAdminSessionVerifyOutcome(cookieHeader);
  if (outcome === "valid") {
    const principal = await getAdminPrincipalFromSessionCookie(cookieHeader);
    if (!principal) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    const { pathname, method } = await readRequestPathAndMethod();
    if (pathname && !canAccessAdminPath(principal.role, pathname, method)) {
      return new Response(
        JSON.stringify({
          error: "Forbidden",
          hint: "Your role cannot access this area.",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
    return null;
  }
  if (outcome === "unavailable") {
    return new Response(
      JSON.stringify({
        error: "Session verification temporarily unavailable",
        code: ADMIN_AUTH_VERIFICATION_UNAVAILABLE,
        hint: "Try again in a moment. If this continues, check Firebase or Google Cloud status.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
  const hasCookie = !!extractAdminSessionCookieValue(cookieHeader);
  const hint = hasCookie
    ? "Session expired or invalid. Sign in again at /admin/login. In dev, check the server console for [admin auth]."
    : "No session cookie. Sign in at /admin/login.";
  return new Response(JSON.stringify({ error: "Unauthorized", hint }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
