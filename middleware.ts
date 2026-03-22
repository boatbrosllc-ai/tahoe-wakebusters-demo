import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAdminPublicPath } from "@/lib/admin-public-paths";
import { verifyEdgeSessionCookie } from "@/lib/admin-edge-session-verify";
import { ADMIN_EDGE_SECRET_CONFIG_CODE, isAdminEdgeSecretValid } from "@/lib/admin-edge-secret";

function isAdminProtectedPath(pathname: string): boolean {
  return (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) && !isAdminPublicPath(pathname);
}

/** Cron endpoints under /api/admin/cron/* allow Bearer CRON_SECRET so Netlify Scheduled Functions can invoke them without a session. */
function isAdminCronPath(pathname: string): boolean {
  return pathname.startsWith("/api/admin/cron/");
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

  const edgeSecretRaw = process.env.ADMIN_EDGE_SECRET;
  const isProduction = process.env.NODE_ENV === "production";
  if (isAdminProtectedPath(pathname)) {
    if (isAdminCronPath(pathname) && (await isCronAuthorized(request))) {
      const res = NextResponse.next({ request: { headers: requestHeaders } });
      res.headers.set("Content-Security-Policy", csp);
      return res;
    }
    if (isProduction && !isAdminEdgeSecretValid(edgeSecretRaw)) {
      console.error(
        "[middleware] ADMIN_EDGE_SECRET missing or too short in production — set a secret of at least 32 UTF-8 bytes (same value as server env).",
        { code: ADMIN_EDGE_SECRET_CONFIG_CODE }
      );
      const body = {
        error: "Service misconfigured. Admin access is not available.",
        code: ADMIN_EDGE_SECRET_CONFIG_CODE,
        hint: "Set ADMIN_EDGE_SECRET in your host (e.g. Netlify) to a random string of at least 32 UTF-8 bytes. It must match across build and runtime.",
      };
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(body, { status: 503 });
      }
      return NextResponse.json(body, { status: 503 });
    }
    const edgeSecret = edgeSecretRaw?.trim();
    if (edgeSecret) {
      const cookieHeader = request.headers.get("cookie");
      const valid = await verifyEdgeSessionCookie(cookieHeader, edgeSecret);
      if (!valid) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        return NextResponse.redirect(new URL("/admin/login", request.url), 302);
      }
    }
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

/** Build Content-Security-Policy with nonce for script-src to avoid 'unsafe-inline'. Third-party domains kept for Stripe/GA/Firebase. */
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
    // Google Pay / Payment Handler manifest fetch (browser → www.google.com/pay, pay.google.com)
    "https://www.google.com",
    "https://pay.google.com",
    "https://www.google-analytics.com",
    "https://www.googletagmanager.com",
  ].join(" ");
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // Web Workers created from blob URLs (e.g. Stripe Elements / Payment Element) fall back to
    // script-src when worker-src is omitted; script-src must not include blob:, so set explicitly.
    "worker-src 'self' blob:",
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
