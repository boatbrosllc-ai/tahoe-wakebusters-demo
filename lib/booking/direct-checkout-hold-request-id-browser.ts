"use client";

import { directCheckoutFingerprintPayload } from "@/lib/booking/hold-request-idempotency";

async function sha256HexUtf8(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Stable holdRequestId per browser session + selection: stored in sessionStorage so refresh resumes the same id.
 * Must match server-side `computeDirectCheckoutHoldRequestFingerprint` for the same inputs.
 */
export async function getOrCreateDirectCheckoutHoldRequestId(input: {
  experienceId: string;
  slotId: string;
  boatId?: string;
  partySize: number;
  petsCount: number;
  discountCode?: string;
  customerEmail?: string;
}): Promise<string> {
  const fp = await sha256HexUtf8(JSON.stringify(directCheckoutFingerprintPayload(input)));
  const storageKey = `bb_direct_hreq_${fp}`;
  if (typeof sessionStorage !== "undefined") {
    const existing = sessionStorage.getItem(storageKey)?.trim();
    if (existing && existing.length >= 8 && existing.length <= 128) return existing;
    const id = `d${fp}`;
    sessionStorage.setItem(storageKey, id);
    return id;
  }
  return `d${fp}`;
}
