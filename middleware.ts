import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAdminPublicPath } from "@/lib/admin-public-paths";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const requestHeaders = new Headers(request.headers);
  const csp = buildCsp();
  requestHeaders.set("Content-Security-Policy", csp);

  if (isAdminPublicPath(pathname)) {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("Content-Security-Policy", csp);
    return res;
  }

  // Admin pages and API: auth is enforced in Node (dashboard layout + API requireAdminSession).
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

/** Build Content-Security-Policy. No nonce/strict-dynamic so 'unsafe-inline' works (Next.js inline scripts and third-party run). */
function buildCsp(): string {
  const isDev = process.env.NODE_ENV !== "production";
  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    "https://js.stripe.com",
    "https://*.stripe.com",
    "https://checkout.stripe.com",
    "https://*.js.stripe.com",
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com",
    "https://www.gstatic.com",
    "https://*.gstatic.com",
    "https://*.firebaseapp.com",
    "https://*.googleapis.com",
    ...(isDev ? ["'unsafe-eval'"] : []),
  ].join(" ");
  // Firebase Auth (admin login) must be in connect-src or sign-in is blocked
  const connectSrc = [
    "'self'",
    "https://identitytoolkit.googleapis.com",
    "https://securetoken.googleapis.com",
    "https://*.googleapis.com",
    "https://api.stripe.com",
    "https://*.stripe.com",
    "https://*.stripe.network",
    "https://checkout.stripe.com",
    "https://www.google-analytics.com",
    "https://www.googletagmanager.com",
  ].join(" ");
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "frame-src 'self' https://js.stripe.com https://*.stripe.com https://checkout.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://www.google.com https://*.google.com",
    `connect-src ${connectSrc}`,
    "img-src 'self' data: blob: https:",
    "object-src 'none'",
    "base-uri 'self'",
  ].join("; ");
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
