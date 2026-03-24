/**
 * Signed receipt token for viewing booking details (ownership-bound).
 * HMAC-SHA256(bookingId + exp) with RECEIPT_TOKEN_SECRET only (see receipt-token-secret.ts).
 */

import { createHmac, timingSafeEqual } from "crypto";
import { getReceiptTokenSecretOnly } from "@/lib/booking/receipt-token-secret";

const ALG = "sha256";
const SEP = ".";
// Null byte: prohibited in email local parts (RFC 5321) and Firestore doc IDs; avoids | breaking HMAC parsing.
const INNER_SEP = "\x00";
const PREFIX = "r"; // receipt, distinct from manage token
const PREFIX_CLAIM = "c"; // claim (holdId) for post-checkout receipt exchange

/** Max age for ignore-expiry recovery path (stale bookmark + payment ref). */
export const RECEIPT_CLAIM_MAX_STALE_SECONDS = 30 * 24 * 60 * 60;

/** Default and signing TTL for receipt and claim tokens (bookmark recovery without ignore-expiry bypass). */
const DEFAULT_RECEIPT_TTL_SECONDS = 30 * 24 * 60 * 60;

function getSecret(): string | null {
  return getReceiptTokenSecretOnly();
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64url");
}

function b64urlDecode(str: string): Buffer {
  return Buffer.from(str, "base64url");
}

export interface ReceiptTokenPayload {
  bookingId: string;
  exp: number;
}

/**
 * Sign a receipt token for a booking. Default exp = 30 days (aligned with receipt-claim TTL).
 */
export function signReceiptToken(bookingId: string, exp?: number): string | null {
  const expSec = exp ?? Math.floor(Date.now() / 1000) + DEFAULT_RECEIPT_TTL_SECONDS;
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

/** Sign a receipt-claim token for a hold (used in success_url before booking exists). Default exp = 30 days. */
export function signReceiptClaimToken(holdId: string, exp?: number): string | null {
  const expSec = exp ?? Math.floor(Date.now() / 1000) + DEFAULT_RECEIPT_TTL_SECONDS;
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

/**
 * Same as verifyReceiptClaimToken but returns payload when signature is valid even if `exp` is in the past,
 * only if `exp` is within {@link RECEIPT_CLAIM_MAX_STALE_SECONDS} of now (rejects ancient tokens).
 */
export function verifyReceiptClaimTokenIgnoreExpiry(token: string): ReceiptClaimPayload | null {
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
    const now = Math.floor(Date.now() / 1000);
    if (exp < now - RECEIPT_CLAIM_MAX_STALE_SECONDS) return null;
    return { holdId, exp };
  } catch {
    return null;
  }
}

