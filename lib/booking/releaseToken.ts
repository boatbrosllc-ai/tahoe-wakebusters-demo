/**
 * Signed release token for releasing a hold. Bound to holdId and expiry so
 * only the holder can release (token is returned from create-hold / direct checkout).
 * Uses RELEASE_TOKEN_SECRET when set; when unset, signing returns empty and
 * verification returns null (tokenized release disabled, hold creation still works).
 */

import { createHmac, timingSafeEqual } from "crypto";

const ALG = "sha256";
const SEP = ".";
// Null byte: prohibited in email/local parts and Firestore doc IDs; avoids | breaking token parsing.
const INNER_SEP = "\x00";
const PREFIX = "rel"; // release

/** Release tokens use RELEASE_TOKEN_SECRET only (no fallback — key isolation). */
function getReleaseSecret(): string | null {
  const v = process.env.RELEASE_TOKEN_SECRET?.trim();
  return v && v !== "" ? v : null;
}

/** True when release token signing/verification is available (booking-start paths can return tokenized cancel links). */
export function hasReleaseTokenSecret(): boolean {
  return getReleaseSecret() !== null;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64url");
}

function b64urlDecode(str: string): Buffer {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + "=".repeat(pad), "base64");
}

export interface ReleaseTokenPayload {
  holdId: string;
  exp: number;
}

/**
 * Sign a release token for a hold. Exp should match hold expiry or a short window.
 * Returns "" when RELEASE_TOKEN_SECRET is not set.
 */
export function signReleaseToken(holdId: string, exp: number): string {
  const secret = getReleaseSecret();
  if (!secret) return "";
  const data = `${PREFIX}${INNER_SEP}${holdId}${INNER_SEP}${exp}`;
  const sig = createHmac(ALG, secret).update(data).digest();
  const payloadB64 = b64urlEncode(Buffer.from(data, "utf8"));
  const sigB64 = b64urlEncode(sig);
  return `${payloadB64}${SEP}${sigB64}`;
}

/**
 * Verify and decode a release token. Returns payload or null if invalid/expired or secret unset.
 */
function verifyReleaseTokenInner(
  token: string,
  options: { enforceExpiry: boolean }
): ReleaseTokenPayload | null {
  const secret = getReleaseSecret();
  if (!secret) return null;
  try {
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
    const holdId = segments[1];
    const exp = parseInt(segments[2], 10);
    if (!holdId || Number.isNaN(exp)) return null;
    if (options.enforceExpiry && exp < Math.floor(Date.now() / 1000)) return null;
    return { holdId, exp };
  } catch {
    return null;
  }
}

export function verifyReleaseToken(token: string): ReleaseTokenPayload | null {
  return verifyReleaseTokenInner(token, { enforceExpiry: true });
}

/**
 * Same as verifyReleaseToken but does not reject when the token's embedded `exp` is in the past.
 * Used by release-hold when the hold was extended after create-hold (token was signed with the
 * pre-extension expiry). Callers must still confirm the hold is active in Firestore.
 */
export function verifyReleaseTokenIgnoreExpiry(token: string): ReleaseTokenPayload | null {
  return verifyReleaseTokenInner(token, { enforceExpiry: false });
}

if (process.env.NODE_ENV !== "production") {
  const v = process.env.RELEASE_TOKEN_SECRET;
  if (v == null || String(v).trim() === "") {
    console.warn(
      "[booking] RELEASE_TOKEN_SECRET is not set. Holds will not release on Back or cancel; slots stay locked for up to the hold TTL (~10 minutes). Set it in .env.local for local development."
    );
  }
}
