import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionCookieName } from "@/lib/admin-auth-firebase";
import { ADMIN_EDGE_COOKIE_NAME } from "@/lib/admin-edge-session-verify";
import { getFirebaseApp } from "@/lib/booking/firebase-admin";

export async function POST(request: NextRequest) {
  const name = getAdminSessionCookieName();
  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    // Match cookie at start of string or after "; " to avoid matching e.g. "xadmin_session=..."
    const match = cookieHeader.match(/(?:^|;\s*)admin_session=([^;]+)/);
    const sessionCookie = match?.[1]?.trim();
    if (sessionCookie) {
      try {
        const app = getFirebaseApp();
        const decoded = await app.auth().verifySessionCookie(sessionCookie, false);
        if (decoded?.uid) {
          await app.auth().revokeRefreshTokens(decoded.uid);
        }
      } catch {
        // Logout always succeeds: clear cookie even if Firebase is unreachable
      }
    }
  }
  const res = NextResponse.redirect(new URL("/admin/login", request.url), 302);
  res.cookies.set(name, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  res.cookies.set(ADMIN_EDGE_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return res;
}
