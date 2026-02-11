/**
 * Admin auth via Firebase Auth session cookie.
 * Client signs in with Firebase (email/password), sends ID token to /api/admin/session;
 * server creates a session cookie and verifies it on protected routes.
 * Only the email in ADMIN_EMAIL is allowed to access admin.
 */

import "server-only";
import { getFirebaseApp } from "@/lib/booking/firebase-admin"; // same app used for Firestore
import { safeHasFirebaseConfig } from "@/lib/booking/env";

const COOKIE_NAME = "admin_session";
const SESSION_EXPIRES_MS = 5 * 24 * 60 * 60 * 1000; // 5 days (Firebase max 2 weeks)

/** Shown when Firebase/Firestore server config is missing or invalid (503/500). */
export const FIREBASE_SETUP_HINT =
  "Set FIREBASE_SERVICE_ACCOUNT_JSON_PATH to your service account JSON path (Firebase Console → Project settings → Service accounts → Generate new private key), or set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY. Restart the dev server.";

function getAdminEmail(): string | null {
  const email = process.env.ADMIN_EMAIL?.trim();
  return email || null;
}

/** Create a Firebase session cookie from an ID token. Returns cookie value or throws. */
export async function createAdminSessionCookie(idToken: string): Promise<string> {
  const app = getFirebaseApp();
  return app.auth().createSessionCookie(idToken, { expiresIn: SESSION_EXPIRES_MS });
}

/** Verify the admin session cookie and that the user is the allowed admin email. Returns true if valid. */
export async function verifyAdminSessionCookie(cookieHeader: string | null): Promise<boolean> {
  const adminEmail = getAdminEmail();
  if (!adminEmail) return false;
  if (!cookieHeader) return false;
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`, "i"));
  const sessionCookie = match?.[1]?.trim();
  if (!sessionCookie) return false;
  try {
    const app = getFirebaseApp();
    const decoded = await app.auth().verifySessionCookie(sessionCookie, true);
    const email = decoded.email?.trim().toLowerCase();
    const allowed = adminEmail.trim().toLowerCase();
    return !!email && email === allowed;
  } catch {
    return false;
  }
}

export function getAdminSessionCookieName(): string {
  return COOKIE_NAME;
}

/** For API routes: require valid Firebase admin session. Returns null if allowed, or a Response (401/503). */
export async function requireAdminSession(cookieHeader: string | null): Promise<Response | null> {
  if (!getAdminEmail()) {
    return new Response(JSON.stringify({ error: "Admin not configured (set ADMIN_EMAIL)" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!safeHasFirebaseConfig()) {
    return new Response(
      JSON.stringify({
        error: "Firebase/Firestore not configured for server.",
        hint: FIREBASE_SETUP_HINT,
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
  const valid = await verifyAdminSessionCookie(cookieHeader);
  if (valid) return null;
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
