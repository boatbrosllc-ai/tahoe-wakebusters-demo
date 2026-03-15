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

  if (isAdminPublicPath(pathname)) {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    setCspHeader(res, nonce);
    return res;
  }

  // Admin pages and API: auth is enforced in Node (dashboard layout + API requireAdminSession).
  // We do not check auth here because Edge middleware cannot read ADMIN_EDGE_SECRET from .env.

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  setCspHeader(res, nonce);
  return res;
}

/** Set Content-Security-Policy with script nonce so inline/trusted scripts are allowed (Next.js hydration + Stripe).
 * This is the single canonical definition of CSP for the app. Do not add Content-Security-Policy in next.config.js or netlify.toml. */
function setCspHeader(response: NextResponse, nonce: string): void {
  const isDev = process.env.NODE_ENV !== "production";
  const scriptSrc = [
    "'self'",
    "https://js.stripe.com",
    "https://*.stripe.com",
    "https://checkout.stripe.com",
    "https://*.js.stripe.com",
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com",
    ...(isDev ? ["'unsafe-eval'", "'unsafe-inline'"] : ["'strict-dynamic'", `'nonce-${nonce}'`]),
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
  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "frame-src 'self' https://js.stripe.com https://*.stripe.com https://checkout.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://www.google.com https://*.google.com",
    `connect-src ${connectSrc}`,
    "img-src 'self' data: blob: https:",
    "object-src 'none'",
    "base-uri 'self'",
  ].join("; ");
  response.headers.set("Content-Security-Policy", csp);
}

export const config = {
  // Run on all routes that may serve HTML so CSP nonce is set for every page (root layout Script).
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
