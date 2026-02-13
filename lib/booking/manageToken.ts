/**
 * Signed token for "Manage Booking" links (no login).
 * HMAC-SHA256(bookingId + exp) with MANAGE_BOOKING_SECRET.
 */

import { createHmac, timingSafeEqual } from "crypto";

const ALG = "sha256";
const SEP = ".";

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
  exp: number; // unix seconds
}

/**
 * Sign a manage-booking token. Default exp = 30 days from now.
 */
export function signManageToken(payload: { bookingId: string; exp?: number }): string {
  const exp = payload.exp ?? Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  const secret = getSecret();
  const data = `${payload.bookingId}${SEP}${exp}`;
  const sig = createHmac(ALG, secret).update(data).digest();
  const payloadB64 = b64urlEncode(Buffer.from(data, "utf8"));
  const sigB64 = b64urlEncode(sig);
  return `${payloadB64}${SEP}${sigB64}`;
}

/**
 * Verify and decode a manage-booking token. Returns payload or null if invalid/expired.
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
    const [bookingId, expStr] = data.split(SEP);
    const exp = parseInt(expStr, 10);
    if (!bookingId || Number.isNaN(exp)) return null;
    if (exp < Math.floor(Date.now() / 1000)) return null; // expired
    return { bookingId, exp };
  } catch {
    return null;
  }
}
