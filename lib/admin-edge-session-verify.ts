/**
 * Verify admin Edge session cookie (HMAC-signed payload).
 * Edge-safe: uses only Web Crypto API. Used by middleware so admin routes
 * can be protected without loading Firebase Admin in Edge.
 */

export const ADMIN_EDGE_COOKIE_NAME = "admin_edge";

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
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
    return bufferToHex(sig) === signHex;
  } catch {
    return false;
  }
}
