/**
 * Verify admin Edge session cookie (HMAC-signed payload).
 * Edge-safe: uses only Web Crypto API. Used by middleware so admin routes
 * can be protected without loading Firebase Admin in Edge.
 */

export const ADMIN_EDGE_COOKIE_NAME = "admin_edge";

/** Decode 64 hex chars to 32 bytes; returns null if invalid (caller still runs full HMAC compare). */
function hexToBytes32(signHex: string): Uint8Array | null {
  if (signHex.length !== 64 || !/^[0-9a-fA-F]+$/.test(signHex)) return null;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(signHex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function constantTimeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Verify the admin_edge cookie value. Returns true if the cookie is present,
 * not expired, and the HMAC signature matches.
 */
export async function verifyEdgeSessionCookie(cookieHeader: string | null, secret: string): Promise<boolean> {
  if (!cookieHeader || !secret) return false;
  const match = cookieHeader.match(new RegExp(`${ADMIN_EDGE_COOKIE_NAME}=([^;]+)`, "i"));
  const value = match?.[1]?.trim();
  if (!value) return false;
  const parts = value.split("|");
  if (parts.length !== 3) return false;
  const expirySec = parseInt(parts[0], 10);
  if (Number.isNaN(expirySec) || expirySec < Math.floor(Date.now() / 1000)) return false;
  const payload = parts[0] + "|" + parts[1];
  const signHex = parts[2];
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    const expected = new Uint8Array(sig);
    const decoded = hexToBytes32(signHex);
    const provided = decoded ?? new Uint8Array(32);
    const hexOk = decoded !== null;
    const bytesMatch = constantTimeEqualBytes(expected, provided);
    return hexOk && bytesMatch;
  } catch {
    return false;
  }
}
