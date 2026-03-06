/**
 * Signed receipt token for viewing booking details (ownership-bound).
 * HMAC-SHA256(bookingId + exp) with MANAGE_BOOKING_SECRET.
 * Used so receipt API only returns full customer details when the caller
 * proves ownership via session_id, payment_intent_id, or a valid receipt token.
 */

import { createHmac, timingSafeEqual } from "crypto";

const ALG = "sha256";
const SEP = ".";
const INNER_SEP = "|";
const PREFIX = "r"; // receipt, distinct from manage token

function getSecret(): string {
  const secret = process.env.MANAGE_BOOKING_SECRET;
  if (!secret || secret === "") {
    throw new Error("MANAGE_BOOKING_SECRET is not set; receipt tokens are disabled.");
  }
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

export interface ReceiptTokenPayload {
  bookingId: string;
  exp: number;
}

/**
 * Sign a receipt token for a booking. Default exp = 24 hours.
 */
export function signReceiptToken(bookingId: string, exp?: number): string {
  const expSec = exp ?? Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  const secret = getSecret();
  const data = `${PREFIX}${INNER_SEP}${bookingId}${INNER_SEP}${expSec}`;
  const sig = createHmac(ALG, secret).update(data).digest();
  const payloadB64 = b64urlEncode(Buffer.from(data, "utf8"));
  const sigB64 = b64urlEncode(sig);
  return `${payloadB64}${SEP}${sigB64}`;
}

/**
 * Verify and decode a receipt token. Returns payload or null if invalid/expired.
 */
export function verifyReceiptToken(token: string): ReceiptTokenPayload | null {
  try {
    const secret = getSecret();
    const parts = token.split(SEP);
    if (parts.length !== 2) return null;
    const [payloadB64, sigB64] = parts;
    const data = b64urlDecode(payloadB64).toString("utf8");
    if (!data.startsWith(PREFIX + INNER_SEP)) return null;
    const expectedSig = createHmac(ALG, secret).update(data).digest();
    const providedSig = b64urlDecode(sigB64);
    if (expectedSig.length !== providedSig.length || !timingSafeEqual(expectedSig, providedSig)) {
      return null;
    }
    const segments = data.split(INNER_SEP);
    const bookingId = segments[1];
    const exp = parseInt(segments[2], 10);
    if (!bookingId || Number.isNaN(exp)) return null;
    if (exp < Math.floor(Date.now() / 1000)) return null;
    return { bookingId, exp };
  } catch {
    return null;
  }
}
