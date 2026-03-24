/**
 * Sampling warnings when legacy fallback is used in production, so Firestore read cost remains visible in monitoring.
 * Log every N invocations (e.g. every 100 requests) rather than once, so the issue stays visible across serverless cold starts.
 */

import { writeOperationalAlert } from "@/lib/booking/operational-alerts";

const LEGACY_BOOKING_WARN_EVERY = 100;
const LEGACY_HOLDS_WARN_EVERY = 100;

let legacyBookingHitCount = 0;
let legacyHoldsHitCount = 0;

export function warnIfLegacyBookingFallbackEnabled(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.DISABLE_LEGACY_BOOKING_FALLBACK === "true") return;
  legacyBookingHitCount++;
  if (legacyBookingHitCount % LEGACY_BOOKING_WARN_EVERY !== 1) return;
  console.warn(
    "[legacy-fallback] Legacy booking scan is enabled (DISABLE_LEGACY_BOOKING_FALLBACK not true). " +
      "Set DISABLE_LEGACY_BOOKING_FALLBACK=true in Netlify after startDateStr backfill to avoid unbounded collection scans.",
    { legacyBookingFallbackHitCount: legacyBookingHitCount }
  );
}

export function warnIfLegacyHoldsFallbackEnabled(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.DISABLE_LEGACY_HOLDS_FALLBACK === "true") return;
  legacyHoldsHitCount++;
  if (legacyHoldsHitCount % LEGACY_HOLDS_WARN_EVERY !== 1) return;
  console.warn(
    "[legacy-fallback] Legacy holds scan is enabled (DISABLE_LEGACY_HOLDS_FALLBACK not true). " +
      "Set DISABLE_LEGACY_HOLDS_FALLBACK=true in Netlify after startDateStr backfill on holds to avoid unbounded collection scans.",
    { legacyHoldsFallbackHitCount: legacyHoldsHitCount }
  );
}

/**
 * Startup guard: legacy booking overlap prefetch can run outside the hold transaction until
 * `DISABLE_LEGACY_BOOKING_FALLBACK=true` (after `startDateStr` backfill). Logs CRITICAL and records an alert if misconfigured.
 */
export async function assertDisableLegacyBookingFallbackInProductionStartup(): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.DISABLE_LEGACY_BOOKING_FALLBACK === "true") return;
  console.error(
    "[CRITICAL] DISABLE_LEGACY_BOOKING_FALLBACK is not set to true in production. " +
      "Legacy booking overlap prefetch runs outside the Firestore transaction with a documented race window until backfill completes and this flag is enabled."
  );
  await writeOperationalAlert({
    type: "disable_legacy_booking_fallback_not_set",
    source: "instrumentation",
    nodeEnv: process.env.NODE_ENV,
  });
}
