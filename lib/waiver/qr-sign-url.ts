/**
 * Canonical public URLs for stable waiver QR codes (server-safe).
 */

import "server-only";
import { getAppBaseUrl } from "@/lib/waiver/firestore";

export function buildWaiverQrSignUrl(qrLinkId: string, opts?: { kiosk?: boolean }): string {
  const base = getAppBaseUrl();
  const u = new URL(`${base}/waiver/sign`);
  u.searchParams.set("qr", qrLinkId.trim());
  if (opts?.kiosk) u.searchParams.set("mode", "kiosk");
  return u.toString();
}
