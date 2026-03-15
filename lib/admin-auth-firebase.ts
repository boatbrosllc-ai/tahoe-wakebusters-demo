/**
 * Admin auth via Firebase Auth session cookie.
 * Client signs in with Firebase (email/password), sends ID token to /api/admin/session;
 * server creates a session cookie and verifies it on protected routes.
 * Allowed emails are read exclusively from ADMIN_EMAIL (comma-separated).
 */

import "server-only";
import { extractAdminSessionCookieValue } from "./admin-cookie-parse";
import { getFirebaseApp } from "@/lib/booking/firebase-admin"; // same app used for Firestore
import { safeHasFirebaseConfig, getFirebaseConfigStatus } from "@/lib/booking/env";

const COOKIE_NAME = "admin_session";
const SESSION_EXPIRES_MS = 5 * 24 * 60 * 60 * 1000; // 5 days (Firebase max 2 weeks)

/** Shown when Firebase/Firestore server config is missing or invalid (503/500). */
export const FIREBASE_SETUP_HINT =
  "Set FIREBASE_SERVICE_ACCOUNT_JSON_PATH to your service account JSON path (Firebase Console → Project settings → Service accounts → Generate new private key), or set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY. Restart the dev server.";

/** All emails that are allowed to access admin, read exclusively from ADMIN_EMAIL (comma-separated). Exported for session route. */
export function getAllowedAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAIL?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Create a Firebase session cookie from an ID token. Returns cookie value or throws. */
export async function createAdminSessionCookie(idToken: string): Promise<string> {
  const app = getFirebaseApp();
  return app.auth().createSessionCookie(idToken, { expiresIn: SESSION_EXPIRES_MS });
}

/** Extract the admin_session cookie value from a Cookie header.
 * Uses a regex that requires the name at start or after "; " so "xadmin_session=..." is not matched.
 * Exported for unit tests. */
export { extractAdminSessionCookieValue } from "./admin-cookie-parse";

/** Verify the admin session cookie and that the user is an allowed admin email. Returns true if valid. */
export async function verifyAdminSessionCookie(cookieHeader: string | null): Promise<boolean> {
  const allowed = getAllowedAdminEmails();
  if (allowed.length === 0) return false;
  const sessionCookie = extractAdminSessionCookieValue(cookieHeader);
  if (!sessionCookie) return false;
  try {
    const app = getFirebaseApp();
    const decoded = await app.auth().verifySessionCookie(sessionCookie, true);
    const email = decoded.email?.trim().toLowerCase();
    return !!email && allowed.includes(email);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (process.env.NODE_ENV === "development") {
      console.warn("[admin auth] Session cookie invalid:", msg);
    }
    return false;
  }
}

export function getAdminSessionCookieName(): string {
  return COOKIE_NAME;
}

/** For API routes: require valid Firebase admin session. Returns null if allowed, or a Response (401/503). */
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
  const valid = await verifyAdminSessionCookie(cookieHeader);
  if (valid) return null;
  const hasCookie = !!extractAdminSessionCookieValue(cookieHeader);
  const hint = hasCookie
    ? "Session expired or invalid. Sign in again at /admin/login. In dev, check the server console for [admin auth]."
    : "No session cookie. Sign in at /admin/login with the email set in ADMIN_EMAIL.";
  return new Response(
    JSON.stringify({ error: "Unauthorized", hint }),
    { status: 401, headers: { "Content-Type": "application/json" } }
  );
}
