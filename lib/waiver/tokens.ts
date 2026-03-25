/**
 * Waiver signing tokens: generate unguessable token and validate expiry.
 * Token is used as Firestore document ID in waiverSigningTokens collection.
 */

import { randomBytes } from "crypto";

const TOKEN_BYTES = 32;

function defaultExpiryDays(): number {
  const raw = typeof process !== "undefined" ? process.env.WAIVER_TOKEN_EXPIRY_DAYS?.trim() : undefined;
  if (raw) {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 7 && n <= 365) return n;
  }
  /** Long enough for far-out trips + slow signers; override with WAIVER_TOKEN_EXPIRY_DAYS. */
  return 120;
}

/**
 * Generate a cryptographically secure token (hex string).
 * Use as document id for waiverSigningTokens/{tokenId}.
 */
export function generateSigningToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

/** Same as signing token; used as doc id for waiverGroupTokens. */
export function generateGroupToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

/**
 * Check if a token expiry timestamp is still valid (not yet expired).
 * Pass expiresAt as Date or Firestore-like { seconds } or ISO string.
 */
export function isTokenExpired(expiresAt: Date | { seconds: number } | string): boolean {
  let date: Date;
  if (expiresAt instanceof Date) {
    date = expiresAt;
  } else if (typeof expiresAt === "string") {
    date = new Date(expiresAt);
  } else if (typeof (expiresAt as { seconds?: number }).seconds === "number") {
    date = new Date((expiresAt as { seconds: number }).seconds * 1000);
  } else {
    return true;
  }
  return isNaN(date.getTime()) || date.getTime() <= Date.now();
}

/**
 * Default expiry for new signing tokens (days from now).
 */
export function getDefaultTokenExpiryDays(): number {
  return defaultExpiryDays();
}

/**
 * Create expiresAt Date for new token.
 */
export function createTokenExpiresAt(daysFromNow?: number): Date {
  const days = daysFromNow ?? defaultExpiryDays();
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}
