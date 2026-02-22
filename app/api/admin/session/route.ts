import { NextRequest, NextResponse } from "next/server";
import { createAdminSessionCookie, getAllowedAdminEmails, getAdminSessionCookieName, verifyAdminSessionCookie } from "@/lib/admin-auth-firebase";
import { getFirebaseApp } from "@/lib/booking/firebase-admin";

const COOKIE_MAX_AGE = 5 * 24 * 60 * 60; // 5 days in seconds

/** GET: Check if admin is signed in (for navbar). Returns { signedIn: boolean }. */
export async function GET(request: NextRequest) {
  try {
    const cookie = request.headers.get("cookie");
    const signedIn = await verifyAdminSessionCookie(cookie);
    return NextResponse.json({ signedIn: signedIn === true });
  } catch {
    return NextResponse.json({ signedIn: false });
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
      hint = "Check Netlify function logs for [admin/session] 401 cause to see the exact error.";
    }
    return NextResponse.json({ error: "Invalid or expired token", hint }, { status: 401 });
  }
}
