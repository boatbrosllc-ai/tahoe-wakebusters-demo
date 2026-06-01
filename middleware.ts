import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAdminPublicPath } from "@/lib/admin-public-paths";
import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/admin-auth-constants";

function isAdminProtectedPath(pathname: string): boolean {
  return (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) && !isAdminPublicPath(pathname);
}

/** Cron endpoints under /api/admin/cron/* allow Bearer CRON_SECRET so Netlify Scheduled Functions can invoke them without a session. */
function isAdminCronPath(pathname: string): boolean {
  return pathname.startsWith("/api/admin/cron/");
}

/** Block automation endpoints can use Bearer BLOCK_SECRET without admin cookie. */
function isBlockSecretPath(pathname: string): boolean {
  return pathname === "/api/admin/blocks/block-slot" || pathname === "/api/admin/blocks/block-date";
}

async function isCronAuthorized(request: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const expected = `Bearer ${secret}`;
  const auth = request.headers.get("authorization") ?? "";
  const enc = new TextEncoder();
  const a = enc.encode(expected);
  const b = enc.encode(auth);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function isBlockSecretAuthorized(request: NextRequest): Promise<boolean> {
  const secret = process.env.BLOCK_SECRET?.trim();
  if (!secret) return false;
  const expected = `Bearer ${secret}`;
  const auth = request.headers.get("authorization") ?? "";
  const enc = new TextEncoder();
  const a = enc.encode(expected);
  const b = enc.encode(auth);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function extractCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1]?.trim() ?? null;
}

async function verifyAdminCookieSignature(request: NextRequest): Promise<boolean> {
  const secret = process.env.ADMIN_COOKIE_SECRET?.trim();
  if (!secret) return false;
  const cookieHeader = request.headers.get("cookie");
  const sessionValue = extractCookie(cookieHeader, ADMIN_SESSION_COOKIE_NAME);
  const signature = extractCookie(cookieHeader, "admin_session_sig");
  if (!sessionValue || !signature || !/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(sessionValue)));
  const provided = new Uint8Array(32);
  for (let i = 0; i < 32; i++) provided[i] = parseInt(signature.slice(i * 2, i * 2 + 2), 16);
  if (sigBytes.length !== provided.length) return false;
  let diff = 0;
  for (let i = 0; i < sigBytes.length; i++) diff |= sigBytes[i] ^ provided[i];
  return diff === 0;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const requestHeaders = new Headers(request.headers);
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  requestHeaders.set("x-nonce", nonce);
  /** Lets server components read the request path without a client hook (avoids nonce hydration issues in JSON-LD). */
  requestHeaders.set("x-pathname", pathname);

  if (isAdminPublicPath(pathname)) {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("Content-Security-Policy", csp);
    return res;
  }

  if (isAdminProtectedPath(pathname)) {
    if (isAdminCronPath(pathname)) {
      if (await isCronAuthorized(request)) {
        const res = NextResponse.next({ request: { headers: requestHeaders } });
        res.headers.set("Content-Security-Policy", csp);
        return res;
      }
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (isBlockSecretPath(pathname) && (await isBlockSecretAuthorized(request))) {
      const res = NextResponse.next({ request: { headers: requestHeaders } });
      res.headers.set("Content-Security-Policy", csp);
      return res;
    }
    // Optional defense-in-depth: when ADMIN_COOKIE_SECRET is set, require HMAC(admin_session)
    // in admin_session_sig. When unset, admin APIs rely on Firebase session verification only
    // (see requireAdminSession). Requiring the HMAC unconditionally broke production when the secret was not configured.
    if (pathname.startsWith("/api/admin/") && process.env.ADMIN_COOKIE_SECRET?.trim()) {
      const ok = await verifyAdminCookieSignature(request);
      if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

/** Build Content-Security-Policy with nonce for inline scripts. Host allowlist covers Stripe/GA/Firebase; 'self' covers Next.js chunks. */
function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV !== "production";
  // script-src: nonce only for inline scripts (no 'unsafe-inline' in production). Third-party scripts are allowlisted.
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "https://js.stripe.com",
    "https://*.stripe.com",
    "https://checkout.stripe.com",
    "https://*.js.stripe.com",
    "https://*.googletagmanager.com",
    "https://www.googletagmanager.com",
    "https://*.googletag.com",
    "https://*.google-analytics.com",
    "https://www.google.com",
    "https://apis.google.com",
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
    "https://apis.google.com",
    "https://api.stripe.com",
    "https://*.stripe.com",
    "https://*.stripe.network",
    "https://checkout.stripe.com",
    // Google Pay / Payment Handler manifest fetch (browser → www.google.com/pay, pay.google.com)
    "https://www.google.com",
    "https://*.google.com",
    "https://pay.google.com",
    // GA4 / Tag Manager (regional collect, analytics.google.com, etc.)
    "https://*.google-analytics.com",
    "https://*.analytics.google.com",
    "https://*.googletagmanager.com",
    "https://www.googletagmanager.com",
    "https://*.googletag.com",
    // GA / Ads measurement may hit doubleclick when signals are enabled
    "https://*.doubleclick.net",
    "https://stats.g.doubleclick.net",
    "https://www.recaptcha.net",
  ].join(" ");
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // Web Workers created from blob URLs (e.g. Stripe Elements / Payment Element) fall back to
    // script-src when worker-src is omitted; script-src must not include blob:, so set explicitly.
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "frame-src 'self' https://js.stripe.com https://*.stripe.com https://checkout.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://www.google.com https://*.google.com https://www.recaptcha.net https://www.googletagmanager.com",
    `connect-src ${connectSrc}`,
    "img-src 'self' data: blob: https: https://*.google-analytics.com https://*.googletagmanager.com",
    "object-src 'none'",
    "base-uri 'self'",
  ].join("; ");
}

export const config = {
  // Skip metadata routes: no CSP needed; avoids any edge interaction with XML/plain responses.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt).*)"],
};
