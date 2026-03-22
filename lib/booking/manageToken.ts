/**
 * Signed token for "Manage Booking" links (no login).
 * HMAC-SHA256(bookingId + email + exp) with MANAGE_BOOKING_SECRET.
 */

import { createHmac, timingSafeEqual } from "crypto";

const ALG = "sha256";
const SEP = "."; // outer: payloadB64.sigB64
// Null byte: prohibited in email local parts (RFC 5321) and Firestore doc IDs; avoids | breaking HMAC parsing.
const INNER_SEP = "\x00";

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

function computeExp(payload: { exp?: number; tripDateStr?: string }): number {
  if (payload.exp != null) {
    return payload.exp;
  }
  if (payload.tripDateStr && /^\d{4}-\d{2}-\d{2}$/.test(payload.tripDateStr)) {
    const nowSec = Math.floor(Date.now() / 1000);
    const thirtyDaysFromNow = nowSec + 30 * 24 * 60 * 60;
    const tripEndOfDay = new Date(payload.tripDateStr + "T23:59:59Z").getTime() / 1000;
    const tripPlusSevenDays = tripEndOfDay + 7 * 24 * 60 * 60;
    return Math.min(thirtyDaysFromNow, Math.floor(tripPlusSevenDays));
  }
  return Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
}

export interface ManageTokenPayload {
  bookingId: string;
  email?: string; // normalized (lowercase); required for customer-facing links
  exp: number; // unix seconds
}

/**
 * Sign a customer-bound manage-booking token. customerEmail is required and is normalized (lowercase).
 * Optional tripDateStr (YYYY-MM-DD): when provided, expiry is min(30 days from now, trip date + 7 days).
 */
export function signManageToken(payload: {
  bookingId: string;
  customerEmail: string;
  exp?: number;
  tripDateStr?: string;
}): string | null {
  const emailRaw = payload.customerEmail?.trim();
  if (!emailRaw) {
    console.error(
      "[manageToken] signManageToken requires a non-empty customerEmail (use signAdminManageToken only from trusted internal callers with no customer binding)"
    );
    return null;
  }
  const email = emailRaw.toLowerCase();
  const secret = getSecret();
  if (!secret) return null;
  const exp = computeExp(payload);
  const data = `${payload.bookingId}${INNER_SEP}${email}${INNER_SEP}${exp}`;
  const sig = createHmac(ALG, secret).update(data).digest();
  const payloadB64 = b64urlEncode(Buffer.from(data, "utf8"));
  const sigB64 = b64urlEncode(sig);
  return `${payloadB64}${SEP}${sigB64}`;
}

/**
 * Admin / internal-only: token without customer email binding. Do not expose to end users;
 * `/api/booking/manage/*` rejects tokens with no email. Use only when a trusted server path
 * needs a signed booking handle without customer identity in the payload.
 */
export function signAdminManageToken(payload: {
  bookingId: string;
  exp?: number;
  tripDateStr?: string;
}): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const exp = computeExp(payload);
  const data = `${payload.bookingId}${INNER_SEP}${""}${INNER_SEP}${exp}`;
  const sig = createHmac(ALG, secret).update(data).digest();
  const payloadB64 = b64urlEncode(Buffer.from(data, "utf8"));
  const sigB64 = b64urlEncode(sig);
  return `${payloadB64}${SEP}${sigB64}`;
}

/**
 * Verify and decode a manage-booking token. Returns payload or null if invalid/expired.
 * Callers must reject when payload.email is missing (customer routes) and verify email matches booking when present.
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
    const expStr = segments.length >= 3 ? segments[2] : segments[1];
    const exp = parseInt(expStr, 10);
    if (!bookingId || Number.isNaN(exp)) return null;
    if (exp < Math.floor(Date.now() / 1000)) return null;
    const email = segments.length >= 3 && segments[1] ? segments[1] : undefined;
    return { bookingId, exp, ...(email && { email }) };
  } catch {
    return null;
  }
}
