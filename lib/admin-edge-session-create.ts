/**
 * Create admin Edge session cookie value (Node only).
 * Used by POST /api/admin/session after Firebase session is created.
 */

import { createHmac } from "crypto";
import { ADMIN_EDGE_SECRET_MIN_UTF8_BYTES } from "@/lib/admin-edge-secret";

export function createEdgeSessionCookie(email: string, secret: string, maxAgeSec: number): string {
  if (Buffer.byteLength(secret, "utf8") < ADMIN_EDGE_SECRET_MIN_UTF8_BYTES) {
    throw new Error("ADMIN_EDGE_SECRET must be at least 32 UTF-8 bytes");
  }
  const expirySec = Math.floor(Date.now() / 1000) + maxAgeSec;
  const payload = `${expirySec}|${email}`;
  const sign = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}|${sign}`;
}
