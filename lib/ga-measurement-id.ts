/**
 * GA4 web stream measurement ID (public, visible in every page view).
 * Production: `NEXT_PUBLIC_GA_MEASUREMENT_ID` must be set to a valid Google tag identifier (no implicit default).
 * Local development: when unset, GA is skipped (no hardcoded measurement ID).
 * Set NEXT_PUBLIC_GA_MEASUREMENT_ID to empty or "off" / "0" to disable gtag (e.g. local without polluting GA).
 *
 * Next.js inlines NEXT_PUBLIC_* at build time.
 */
import { parseGoogleTagId } from "@/lib/ga-tag-id";

export function getGaMeasurementId(): string | null {
  const raw = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const isProduction = process.env.NODE_ENV === "production";

  if (raw !== undefined) {
    const parsed = parseGoogleTagId(raw);
    if (parsed.kind === "empty") {
      console.error("[ga-measurement-id] NEXT_PUBLIC_GA_MEASUREMENT_ID is set but empty; GA will be disabled.");
      return null;
    }

    if (parsed.kind === "disabled") {
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

    if (parsed.kind !== "valid") {
      console.error(
        `[ga-measurement-id] NEXT_PUBLIC_GA_MEASUREMENT_ID is malformed ("${parsed.raw}"). Expected a Google tag ID (G-/GT-/AW-/DC- + alphanumerics); GA will be disabled.`
      );
      return null;
    }

    return parsed.normalized;
  }

  if (isProduction) {
    console.error(
      "[ga-measurement-id] NEXT_PUBLIC_GA_MEASUREMENT_ID is unset in production; GA is disabled. Set it to your active Google tag ID."
    );
    return null;
  }

  return null;
}

/** `NEXT_PUBLIC_GA_DEBUG=1` (or `true` / `yes`) → gtag `debug_mode` for GA4 Admin → DebugView. */
export function isGaClientDebugEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_GA_DEBUG?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}
