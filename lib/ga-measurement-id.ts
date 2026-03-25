/**
 * GA4 web stream measurement ID (public, visible in every page view).
 * Use NEXT_PUBLIC_GA_MEASUREMENT_ID to override (e.g. staging or a new stream).
 * Set NEXT_PUBLIC_GA_MEASUREMENT_ID to empty or "off" to disable gtag (e.g. local without polluting GA).
 *
 * Next.js inlines NEXT_PUBLIC_* at build time. Default is always used when unset so production
 * never ships without a measurement ID; dev loads the same default so Realtime/DebugView can be verified locally.
 */
const DEFAULT_GA4_MEASUREMENT_ID = "G-1QM1E4C1BB";
const GA4_MEASUREMENT_ID_REGEX = /^G-[A-Za-z0-9]{10}$/;

function normalizeMeasurementId(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (trimmed.toLowerCase() === "off" || trimmed === "0") return null;

  if (!GA4_MEASUREMENT_ID_REGEX.test(trimmed)) {
    return null;
  }

  return trimmed.toUpperCase();
}

export function getGaMeasurementId(): string | null {
  const raw = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  if (raw !== undefined) {
    const trimmed = raw.trim();

    if (trimmed === "") {
      console.error("[ga-measurement-id] NEXT_PUBLIC_GA_MEASUREMENT_ID is set but empty; GA will be disabled.");
      return null;
    }

    if (trimmed.toLowerCase() === "off" || trimmed === "0") {
      console.warn(
        "[ga-measurement-id] NEXT_PUBLIC_GA_MEASUREMENT_ID disables GA via off/0. This should only be used for local dev."
      );
      return null;
    }

    const normalized = normalizeMeasurementId(trimmed);
    if (!normalized) {
      console.error(
        `[ga-measurement-id] NEXT_PUBLIC_GA_MEASUREMENT_ID is malformed ("${trimmed}"). Expected format: G-XXXXXXXXXX; GA will be disabled.`
      );
      return null;
    }

    return normalized;
  }
  return DEFAULT_GA4_MEASUREMENT_ID;
}
