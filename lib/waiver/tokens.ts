/**
 * Waiver signing tokens: generate unguessable token and validate expiry.
 * Token is used as Firestore document ID in waiverSigningTokens collection.
 */

import { randomBytes } from "crypto";

const TOKEN_BYTES = 32;
const DEFAULT_EXPIRY_DAYS = 30;

/**
 * Generate a cryptographically secure token (hex string).
 * Use as document id for waiverSigningTokens/{tokenId}.
 */
export function generateSigningToken(): string {
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
  return DEFAULT_EXPIRY_DAYS;
}

/**
 * Create expiresAt Date for new token.
 */
export function createTokenExpiresAt(daysFromNow: number = DEFAULT_EXPIRY_DAYS): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d;
}
