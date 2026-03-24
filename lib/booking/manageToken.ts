/**
 * Signed token for "Manage Booking" links (no login).
 * HMAC-SHA256(payload) with MANAGE_BOOKING_SECRET. Payload is bookingId + exp only (no PII in URL).
 */

import { createHmac, timingSafeEqual } from "crypto";

const ALG = "sha256";
const SEP = "."; // outer: payloadB64.sigB64
// Null byte: prohibited in email local parts (RFC 5321) and Firestore doc IDs; avoids | breaking HMAC parsing.
const INNER_SEP = "\x00";

/** After this instant (Unix seconds), legacy 3-segment tokens (bookingId + email + exp) are rejected. */
const LEGACY_MANAGE_TOKEN_VERIFICATION_DEADLINE_SEC = Math.floor(Date.parse("2026-06-21T00:00:00.000Z") / 1000);

function getSecret(): string | null {
  const secret = process.env.MANAGE_BOOKING_SECRET;
  if (!secret || secret === "") return null;
  return secret;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64url");
}

function b64urlDecode(str: string): Buffer {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + "=".repeat(pad), "base64");
}

function defaultLinkTtlSeconds(): number {
  const raw = process.env.MANAGE_BOOKING_LINK_TTL_DAYS?.trim();
  const days = raw ? parseInt(raw, 10) : 3;
  const d = Number.isFinite(days) && days > 0 && days <= 90 ? days : 3;
  return d * 24 * 60 * 60;
}

function computeExp(payload: { exp?: number; tripDateStr?: string }): number {
  if (payload.exp != null) {
    return payload.exp;
  }
  const maxFromNow = Math.floor(Date.now() / 1000) + defaultLinkTtlSeconds();
  if (payload.tripDateStr && /^\d{4}-\d{2}-\d{2}$/.test(payload.tripDateStr)) {
    const nowSec = Math.floor(Date.now() / 1000);
    const tripEndOfDay = new Date(payload.tripDateStr + "T23:59:59Z").getTime() / 1000;
    const tripPlusSevenDays = tripEndOfDay + 7 * 24 * 60 * 60;
    return Math.min(maxFromNow, Math.floor(tripPlusSevenDays));
  }
  return Math.floor(Date.now() / 1000) + defaultLinkTtlSeconds();
}

export interface ManageTokenPayload {
  bookingId: string;
  exp: number; // unix seconds
  /** @deprecated Legacy tokens only — verify email against request body for customer routes. */
  email?: string;
}

/**
 * Sign a manage-booking token. Payload is bookingId + exp only (opaque reference; no email in token).
 * Optional tripDateStr (YYYY-MM-DD): when provided, expiry is min(configured max TTL from now, trip date + 7 days).
 * Default max TTL from now: MANAGE_BOOKING_LINK_TTL_DAYS (default 3).
 */
export function signManageToken(payload: {
  bookingId: string;
  exp?: number;
  tripDateStr?: string;
}): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const exp = computeExp(payload);
  const data = `${payload.bookingId}${INNER_SEP}${exp}`;
  const sig = createHmac(ALG, secret).update(data).digest();
  const payloadB64 = b64urlEncode(Buffer.from(data, "utf8"));
  const sigB64 = b64urlEncode(sig);
  return `${payloadB64}${SEP}${sigB64}`;
}

/**
 * Admin / internal-only: token without customer binding. Same wire format as {@link signManageToken}.
 */
export function signAdminManageToken(payload: {
  bookingId: string;
  exp?: number;
  tripDateStr?: string;
}): string | null {
  return signManageToken(payload);
}

/**
 * Verify and decode a manage-booking token. Returns payload or null if invalid/expired.
 * Legacy 3-segment payloads (bookingId + email + exp) still verify until the sunset date; callers must not rely on email for auth.
 */
export function verifyManageToken(token: string): ManageTokenPayload | null {
  try {
    const secret = getSecret();
    if (!secret) return null;
    const parts = token.split(SEP);
    if (parts.length !== 2) return null;
    const [payloadB64, sigB64] = parts;
    const data = b64urlDecode(payloadB64).toString("utf8");
    const expectedSig = createHmac(ALG, secret).update(data).digest();
    const providedSig = b64urlDecode(sigB64);
    if (expectedSig.length !== providedSig.length || !timingSafeEqual(expectedSig, providedSig)) {
      return null;
    }
    const segments = data.split(INNER_SEP);
    const bookingId = segments[0];
    if (!bookingId) return null;
    if (segments.length === 2) {
      const exp = parseInt(segments[1], 10);
      if (Number.isNaN(exp)) return null;
      if (exp < Math.floor(Date.now() / 1000)) return null;
      return { bookingId, exp };
    }
    if (segments.length >= 3) {
      const nowSec = Math.floor(Date.now() / 1000);
      if (nowSec >= LEGACY_MANAGE_TOKEN_VERIFICATION_DEADLINE_SEC) {
        return null;
      }
      const email = segments[1] ? segments[1].toLowerCase() : undefined;
      const exp = parseInt(segments[2], 10);
      if (Number.isNaN(exp)) return null;
      if (exp < Math.floor(Date.now() / 1000)) return null;
      console.warn(
        "[manageToken] deprecated 3-segment manage token verified — replace with 2-segment signManageToken links",
        { bookingId: bookingId.slice(0, 8) }
      );
      return { bookingId, exp, ...(email && { email }) };
    }
    return null;
  } catch {
    return null;
  }
}
