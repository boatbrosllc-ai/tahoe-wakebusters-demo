import { NextRequest, NextResponse } from "next/server";
import { createAdminSessionCookie, getAdminSessionCookieName, verifyAdminSessionCookie } from "@/lib/admin-auth-firebase";
import { getFirebaseApp } from "@/lib/booking/firebase-admin";

const COOKIE_MAX_AGE = 5 * 24 * 60 * 60; // 5 days in seconds

/** GET: Check if admin is signed in (for navbar). Returns { signedIn: boolean }. */
export async function GET(request: NextRequest) {
  const cookie = request.headers.get("cookie");
  const signedIn = await verifyAdminSessionCookie(cookie);
  return NextResponse.json({ signedIn });
}

export async function POST(request: NextRequest) {
  const adminEmail = process.env.ADMIN_EMAIL?.trim();
  if (!adminEmail) {
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
    const decoded = await app.auth().verifyIdToken(idToken);
    if (decoded.email !== adminEmail) {
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
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }
}
