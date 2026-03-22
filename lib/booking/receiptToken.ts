/**
 * Signed receipt token for viewing booking details (ownership-bound).
 * HMAC-SHA256(bookingId + exp) with RECEIPT_TOKEN_SECRET (falls back to MANAGE_BOOKING_SECRET for migration).
 */

import { createHmac, timingSafeEqual } from "crypto";

const ALG = "sha256";
const SEP = ".";
// Null byte: prohibited in email local parts (RFC 5321) and Firestore doc IDs; avoids | breaking HMAC parsing.
const INNER_SEP = "\x00";
const PREFIX = "r"; // receipt, distinct from manage token
const PREFIX_CLAIM = "c"; // claim (holdId) for post-checkout receipt exchange

function getSecret(): string | null {
  const dedicated = process.env.RECEIPT_TOKEN_SECRET?.trim();
  if (dedicated) return dedicated;
  const legacy = process.env.MANAGE_BOOKING_SECRET?.trim();
  if (!legacy) return null;
  return legacy;
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
 * Sign a receipt token for a booking. Default exp = 7 days (use shorter exp for success-page-only flows).
 */
export function signReceiptToken(bookingId: string, exp?: number): string | null {
  const expSec = exp ?? Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  const secret = getSecret();
  if (!secret) return null;
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
    if (!secret) return null;
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

export interface ReceiptClaimPayload {
  holdId: string;
  exp: number;
}

/** Sign a receipt-claim token for a hold (used in success_url before booking exists). Default exp = 2 hours. */
export function signReceiptClaimToken(holdId: string, exp?: number): string | null {
  const expSec = exp ?? Math.floor(Date.now() / 1000) + 2 * 60 * 60;
  const secret = getSecret();
  if (!secret) return null;
  const data = `${PREFIX_CLAIM}${INNER_SEP}${holdId}${INNER_SEP}${expSec}`;
  const sig = createHmac(ALG, secret).update(data).digest();
  const payloadB64 = b64urlEncode(Buffer.from(data, "utf8"));
  const sigB64 = b64urlEncode(sig);
  return `${payloadB64}${SEP}${sigB64}`;
}

/** Verify and decode a receipt-claim token. Returns payload or null if invalid/expired. */
export function verifyReceiptClaimToken(token: string): ReceiptClaimPayload | null {
  try {
    const secret = getSecret();
    if (!secret) return null;
    const parts = token.split(SEP);
    if (parts.length !== 2) return null;
    const [payloadB64, sigB64] = parts;
    const data = b64urlDecode(payloadB64).toString("utf8");
    if (!data.startsWith(PREFIX_CLAIM + INNER_SEP)) return null;
    const expectedSig = createHmac(ALG, secret).update(data).digest();
    const providedSig = b64urlDecode(sigB64);
    if (expectedSig.length !== providedSig.length || !timingSafeEqual(expectedSig, providedSig)) {
      return null;
    }
    const segments = data.split(INNER_SEP);
    const holdId = segments[1];
    const exp = parseInt(segments[2], 10);
    if (!holdId || Number.isNaN(exp)) return null;
    if (exp < Math.floor(Date.now() / 1000)) return null;
    return { holdId, exp };
  } catch {
    return null;
  }
}
