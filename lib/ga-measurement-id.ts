/**
 * GA4 web stream measurement ID (public, visible in every page view).
 * Production: `NEXT_PUBLIC_GA_MEASUREMENT_ID` must be set to a valid `G-XXXXXXXXXX` ID (no implicit default).
 * Local development: when unset, a dev default stream ID is used so Realtime/DebugView can be verified without env.
 * Set NEXT_PUBLIC_GA_MEASUREMENT_ID to empty or "off" / "0" to disable gtag (e.g. local without polluting GA).
 *
 * Next.js inlines NEXT_PUBLIC_* at build time.
 */
const DEV_FALLBACK_GA4_MEASUREMENT_ID = "G-1QM1E4C1BB";
const GA4_MEASUREMENT_ID_REGEX = /^G-[A-Za-z0-9]{10}$/;

/** Strip accidental outer single/double quotes (e.g. from host env UI pasting `"G-…"`). */
function stripSurroundingQuotes(s: string): string {
  let t = s.trim();
  for (let i = 0; i < 3; i++) {
    const len = t.length;
    if (len < 2) break;
    const a = t[0];
    const b = t[len - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) {
      t = t.slice(1, -1).trim();
    } else {
      break;
    }
  }
  return t;
}

function normalizeMeasurementId(raw: string): string | null {
  const trimmed = stripSurroundingQuotes(raw);
  if (trimmed === "") return null;
  if (trimmed.toLowerCase() === "off" || trimmed === "0") return null;

  if (!GA4_MEASUREMENT_ID_REGEX.test(trimmed)) {
    return null;
  }

  return trimmed.toUpperCase();
}

export function getGaMeasurementId(): string | null {
  const raw = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const isProduction = process.env.NODE_ENV === "production";

  if (raw !== undefined) {
    const trimmed = raw.trim();

    if (trimmed === "") {
      console.error("[ga-measurement-id] NEXT_PUBLIC_GA_MEASUREMENT_ID is set but empty; GA will be disabled.");
      return null;
    }

    if (trimmed.toLowerCase() === "off" || trimmed === "0") {
      if (isProduction) {
        console.error(
          "[ga-measurement-id] NEXT_PUBLIC_GA_MEASUREMENT_ID disables GA via off/0; this is not allowed in production builds."
        );
      } else {
        console.warn(
          "[ga-measurement-id] NEXT_PUBLIC_GA_MEASUREMENT_ID disables GA via off/0. Use only for local or non-production."
        );
      }
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

  if (isProduction) {
    console.error(
      "[ga-measurement-id] NEXT_PUBLIC_GA_MEASUREMENT_ID is unset in production; GA is disabled. Set it to your active GA4 stream ID."
    );
    return null;
  }

  return DEV_FALLBACK_GA4_MEASUREMENT_ID;
}

/** `NEXT_PUBLIC_GA_DEBUG=1` (or `true` / `yes`) → gtag `debug_mode` for GA4 Admin → DebugView. */
export function isGaClientDebugEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_GA_DEBUG?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}
