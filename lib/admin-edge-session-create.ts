/**
 * Create admin Edge session cookie value (Node only).
 * Used by POST /api/admin/session after Firebase session is created.
 */

import { createHmac } from "crypto";

export function createEdgeSessionCookie(email: string, secret: string, maxAgeSec: number): string {
  const expirySec = Math.floor(Date.now() / 1000) + maxAgeSec;
  const payload = `${expirySec}|${email}`;
  const sign = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}|${sign}`;
}
