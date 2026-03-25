/**
 * GA4 web stream measurement ID (public, visible in every page view).
 * Use NEXT_PUBLIC_GA_MEASUREMENT_ID to override (e.g. staging or a new stream).
 * Set NEXT_PUBLIC_GA_MEASUREMENT_ID to empty or "off" to disable gtag (e.g. local without polluting GA).
 *
 * Next.js inlines NEXT_PUBLIC_* at build time. Default is always used when unset so production
 * never ships without a measurement ID; dev loads the same default so Realtime/DebugView can be verified locally.
 */
const DEFAULT_GA4_MEASUREMENT_ID = "G-1QM1E4C1BB";

export function getGaMeasurementId(): string | null {
  const raw = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  if (raw !== undefined) {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.toLowerCase() === "off" || trimmed === "0") return null;
    return trimmed;
  }
  return DEFAULT_GA4_MEASUREMENT_ID;
}
