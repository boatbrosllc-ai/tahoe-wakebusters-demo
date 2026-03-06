/**
 * Signed token for "Manage Booking" links (no login).
 * HMAC-SHA256(bookingId + exp) with MANAGE_BOOKING_SECRET.
 */

import { createHmac, timingSafeEqual } from "crypto";

const ALG = "sha256";
const SEP = "."; // outer: payloadB64.sigB64
const INNER_SEP = "|"; // inner data delimiter (must not appear in email or Firestore doc IDs)

function getSecret(): string {
  const secret = process.env.MANAGE_BOOKING_SECRET;
  if (!secret || secret === "") {
    throw new Error("MANAGE_BOOKING_SECRET is not set; manage booking links are disabled.");
  }
  return secret;
}

/**
 * Encode payload as base64url (no padding).
 */
function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64url");
}

function b64urlDecode(str: string): Buffer {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + "=".repeat(pad), "base64");
}

export interface ManageTokenPayload {
  bookingId: string;
  email?: string; // normalized (lowercase); when present, must match booking.customer.email
  exp: number; // unix seconds
}

/**
 * Sign a manage-booking token. Include customerEmail to bind the link to that customer.
 * Default exp = 30 days from now.
 */
export function signManageToken(payload: { bookingId: string; customerEmail?: string; exp?: number }): string {
  const exp = payload.exp ?? Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  const email = payload.customerEmail?.trim().toLowerCase() ?? "";
  const secret = getSecret();
  const data = `${payload.bookingId}${INNER_SEP}${email}${INNER_SEP}${exp}`;
  const sig = createHmac(ALG, secret).update(data).digest();
  const payloadB64 = b64urlEncode(Buffer.from(data, "utf8"));
  const sigB64 = b64urlEncode(sig);
  return `${payloadB64}${SEP}${sigB64}`;
}

/**
 * Verify and decode a manage-booking token. Returns payload or null if invalid/expired.
 * Caller must also verify payload.email matches booking.customer.email when payload.email is set.
 */
export function verifyManageToken(token: string): ManageTokenPayload | null {
  try {
    const secret = getSecret();
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
    if (exp < Math.floor(Date.now() / 1000)) return null; // expired
    const email = segments.length >= 3 && segments[1] ? segments[1] : undefined;
    return { bookingId, exp, ...(email && { email }) };
  } catch {
    return null;
  }
}
