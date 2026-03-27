"use client";

import { analytics } from "@/lib/analytics";
import { BOOKING_MODAL_SESSION_ANALYTICS_COMPLETED_KEY } from "@/lib/booking/booking-modal-session-keys";

function canonicalDedupeKey(bookingId?: string | null, receiptToken?: string | null): string | null {
  const bid = typeof bookingId === "string" ? bookingId.trim() : "";
  if (bid) return `b:${bid}`;
  const rt = typeof receiptToken === "string" ? receiptToken.trim() : "";
  if (rt) return `r:${rt}`;
  return null;
}

function readDedupeKeys(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(BOOKING_MODAL_SESSION_ANALYTICS_COMPLETED_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    return Array.isArray(p) ? p.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Fires `booking_completed` once per confirmed booking in this browser session (deduped by booking id or receipt token).
 */
export function trackBookingCompletedOnce(input: { bookingId?: string | null; receiptToken?: string | null }): void {
  if (typeof window === "undefined") return;
  const dedupe = canonicalDedupeKey(input.bookingId, input.receiptToken);
  try {
    if (dedupe) {
      const keys = readDedupeKeys();
      if (keys.includes(dedupe)) return;
      sessionStorage.setItem(BOOKING_MODAL_SESSION_ANALYTICS_COMPLETED_KEY, JSON.stringify([...keys, dedupe]));
    }
  } catch {
    /* ignore session errors */
  }
  analytics.bookingCompleted({
    bookingId: input.bookingId?.trim() || undefined,
    receiptToken: input.receiptToken?.trim() || undefined,
  });
}
