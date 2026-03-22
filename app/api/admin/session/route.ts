import { NextRequest, NextResponse } from "next/server";
import { ADMIN_AUTH_VERIFICATION_UNAVAILABLE } from "@/lib/admin-auth-constants";
import {
  createAdminSessionCookie,
  getAllowedAdminEmails,
  getAdminSessionCookieName,
  getAdminSessionVerifyOutcome,
} from "@/lib/admin-auth-firebase";
import { createEdgeSessionCookie } from "@/lib/admin-edge-session-create";
import { ADMIN_EDGE_COOKIE_NAME } from "@/lib/admin-edge-session-verify";
import { ADMIN_EDGE_SECRET_CONFIG_CODE, isAdminEdgeSecretValid } from "@/lib/admin-edge-secret";
import { getFirebaseApp } from "@/lib/booking/firebase-admin";

const COOKIE_MAX_AGE = 5 * 24 * 60 * 60; // 5 days in seconds

/** GET: Check if admin is signed in (for navbar). Returns { signedIn: boolean }. Optional ?config=1 returns safe config status for login page. */
function buildSessionConfigPayload(): { adminEmailSet: boolean; firebaseConfigured: boolean; projectIdsMatch: boolean } {
  const allowed = getAllowedAdminEmails();
  const serverProjectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  let firebaseConfigured = false;
  try {
    getFirebaseApp();
    firebaseConfigured = true;
  } catch {
    // not configured or invalid
  }
  return {
    adminEmailSet: allowed.length > 0,
    firebaseConfigured,
    projectIdsMatch: !serverProjectId || !clientProjectId || serverProjectId === clientProjectId,
  };
}

export async function GET(request: NextRequest) {
  const wantConfig = request.nextUrl.searchParams.get("config") === "1";
  try {
    const cookie = request.headers.get("cookie");
    const outcome = await getAdminSessionVerifyOutcome(cookie);
    if (outcome === "unavailable") {
      const payload: {
        signedIn: false;
        verificationUnavailable: true;
        code: string;
        hint: string;
        config?: { adminEmailSet: boolean; firebaseConfigured: boolean; projectIdsMatch: boolean };
      } = {
        signedIn: false,
        verificationUnavailable: true,
        code: ADMIN_AUTH_VERIFICATION_UNAVAILABLE,
        hint: "Session check is temporarily unavailable. Try again shortly.",
      };
      if (wantConfig) {
        try {
          payload.config = buildSessionConfigPayload();
        } catch {
          // keep config undefined
        }
      }
      return NextResponse.json(payload, { status: 503 });
    }
    const payload: {
      signedIn: boolean;
      config?: { adminEmailSet: boolean; firebaseConfigured: boolean; projectIdsMatch: boolean };
    } = {
      signedIn: outcome === "valid",
    };
    if (wantConfig) {
      payload.config = buildSessionConfigPayload();
    }
    return NextResponse.json(payload);
  } catch {
    const payload: { signedIn: boolean; config?: { adminEmailSet: boolean; firebaseConfigured: boolean; projectIdsMatch: boolean } } = {
      signedIn: false,
    };
    if (wantConfig) {
      try {
        payload.config = buildSessionConfigPayload();
      } catch {
        // keep config undefined
      }
    }
    return NextResponse.json(payload);
  }
}

export async function POST(request: NextRequest) {
  const allowed = getAllowedAdminEmails();
  if (allowed.length === 0) {
    return NextResponse.json({ error: "Admin not configured (set ADMIN_EMAIL)" }, { status: 503 });
  }

  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const idToken = typeof body.token === "string" ? body.token.trim() : "";
  if (!idToken) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  try {
    const app = getFirebaseApp();
    const serverProjectId = process.env.FIREBASE_PROJECT_ID?.trim();
    const clientProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
    if (serverProjectId && clientProjectId && serverProjectId !== clientProjectId) {
      console.log("[admin/session] project mismatch:", { serverProjectId, clientProjectId });
      return NextResponse.json(
        {
          error: "Invalid or expired token",
          code: "FIREBASE_PROJECT_MISMATCH",
          hint: "In Netlify, set FIREBASE_PROJECT_ID and NEXT_PUBLIC_FIREBASE_PROJECT_ID to the same Firebase project ID.",
        },
        { status: 401 }
      );
    }
    const decoded = await app.auth().verifyIdToken(idToken);
    const email = decoded.email?.trim().toLowerCase();
    if (!email || !allowed.includes(email)) {
      return NextResponse.json({ error: "Not authorized for admin" }, { status: 403 });
    }

    const isProduction = process.env.NODE_ENV === "production";
    if (isProduction && !isAdminEdgeSecretValid(process.env.ADMIN_EDGE_SECRET)) {
      return NextResponse.json(
        {
          error: "Server configuration error: ADMIN_EDGE_SECRET is missing or too short for production.",
          code: ADMIN_EDGE_SECRET_CONFIG_CODE,
          hint: "Set ADMIN_EDGE_SECRET to a random string of at least 32 UTF-8 bytes in your host (e.g. Netlify). It must match runtime env so middleware and session agree.",
        },
        { status: 503 }
      );
    }

    const sessionCookie = await createAdminSessionCookie(idToken);
    const name = getAdminSessionCookieName();
    const res = NextResponse.json({ ok: true, redirect: "/admin" }, { status: 200 });
    res.cookies.set(name, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });

    if (isProduction) {
      const edgeSecret = process.env.ADMIN_EDGE_SECRET!.trim();
      const edgeValue = createEdgeSessionCookie(email, edgeSecret, COOKIE_MAX_AGE);
      res.cookies.set(ADMIN_EDGE_COOKIE_NAME, edgeValue, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: COOKIE_MAX_AGE,
        path: "/",
      });
    } else {
      const edgeSecret = process.env.ADMIN_EDGE_SECRET?.trim();
      if (edgeSecret && isAdminEdgeSecretValid(edgeSecret)) {
        try {
          const edgeValue = createEdgeSessionCookie(email, edgeSecret, COOKIE_MAX_AGE);
          res.cookies.set(ADMIN_EDGE_COOKIE_NAME, edgeValue, {
            httpOnly: true,
            secure: false,
            sameSite: "lax",
            maxAge: COOKIE_MAX_AGE,
            path: "/",
          });
        } catch (e) {
          console.error("[admin/session] ADMIN_EDGE_SECRET invalid:", e);
          return NextResponse.json(
            {
              error: "Server configuration error: ADMIN_EDGE_SECRET must be at least 32 UTF-8 bytes.",
              code: ADMIN_EDGE_SECRET_CONFIG_CODE,
              hint: "Use a secret of at least 32 UTF-8 bytes, or omit ADMIN_EDGE_SECRET in local dev.",
            },
            { status: 503 }
          );
        }
      }
    }
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const lower = message.toLowerCase();
    let hint: string | undefined;
    if (lower.includes("secretorprivatekey") || lower.includes("asymmetric key") || lower.includes("rs256") || lower.includes("private key")) {
      hint = "FIREBASE_PRIVATE_KEY format: In Netlify paste the full PEM as one line. Replace every newline with the two characters backslash and n (\\n). Remove any surrounding quotes from the value.";
    } else if (lower.includes("config missing") || lower.includes("firebase_")) {
      hint = "Firebase server config: in Netlify set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY (full key on one line with \\n for newlines).";
    } else if (lower.includes("aud") || lower.includes("audience") || lower.includes("project")) {
      hint = "Project mismatch: set FIREBASE_PROJECT_ID and NEXT_PUBLIC_FIREBASE_PROJECT_ID to the same value (e.g. boat-bros-app) in Netlify and redeploy.";
    } else if (lower.includes("expired") || lower.includes("invalid")) {
      hint = "Token rejected. Ensure FIREBASE_PROJECT_ID and NEXT_PUBLIC_FIREBASE_PROJECT_ID match in Netlify, then redeploy and try again.";
    } else {
      hint = "Check your deployment logs (e.g. Netlify Functions) for [admin/session] to see the exact error.";
    }
    console.error("[admin/session] 401:", message, "\nHint:", hint);
    const body: { error: string; hint?: string; detail?: string } = { error: "Invalid or expired token", hint };
    if (process.env.NODE_ENV === "development") body.detail = message;
    return NextResponse.json(body, { status: 401 });
  }
}
