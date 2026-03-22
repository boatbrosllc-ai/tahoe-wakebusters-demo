/**
 * Constant-time string comparison for secrets (Bearer tokens, shared URL secrets, etc.).
 * Do not use for passwords against user-chosen strings without additional protections.
 */

import { timingSafeEqual } from "crypto";

export function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
