import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionCookieName } from "@/lib/admin-auth-firebase";

export async function POST(request: NextRequest) {
  const name = getAdminSessionCookieName();
  const res = NextResponse.redirect(new URL("/admin/login", request.url), 302);
  res.cookies.set(name, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return res;
}
