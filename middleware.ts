import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAdminPublicPath } from "@/lib/admin-public-paths";

/** Generate a CSP nonce using Web Crypto (Edge-compatible). */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Generate a nonce per request for CSP (production). Pass via request header so layout can set it on Script.
  const nonce = generateNonce();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  // Set CSP on the request so Next.js can extract the nonce and apply it to all script tags (inline and chunks).
  const csp = buildCsp(nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  if (isAdminPublicPath(pathname)) {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("Content-Security-Policy", csp);
    return res;
  }

  // Admin pages and API: auth is enforced in Node (dashboard layout + API requireAdminSession).
  // We do not check auth here because Edge middleware cannot read ADMIN_EDGE_SECRET from .env.

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

/** Build Content-Security-Policy string. Used on both request (so Next.js can extract nonce) and response (for the browser). */
function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV !== "production";
  const scriptSrc = [
    "'self'",
    "https://js.stripe.com",
    "https://*.stripe.com",
    "https://checkout.stripe.com",
    "https://*.js.stripe.com",
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com",
    "https://www.gstatic.com",
    "https://*.firebaseapp.com",
    // In production: nonce + strict-dynamic; allow 'unsafe-inline' so Next.js inline scripts run (Next.js may not apply nonce to all emitted scripts).
    ...(isDev ? ["'unsafe-eval'", "'unsafe-inline'"] : ["'strict-dynamic'", `'nonce-${nonce}'`, "'unsafe-inline'"]),
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
  // Run on all routes that may serve HTML so CSP nonce is set for every page (root layout Script).
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
