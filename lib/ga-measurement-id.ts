/**
 * GA4 web stream measurement ID (public, visible in every page view).
 * Use NEXT_PUBLIC_GA_MEASUREMENT_ID to override (e.g. staging or a new stream).
 *
 * Next.js inlines NEXT_PUBLIC_* at build time. Hosts often omit new vars until
 * a later deploy, which previously produced a build with no gtag at all. The
 * default matches netlify.toml / .env.example for boatbrosatx.com production.
 */
const DEFAULT_PRODUCTION_GA4_MEASUREMENT_ID = "G-1QM1E4C1BB";

export function getGaMeasurementId(): string | null {
  const fromEnv = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV !== "production") return null;
  return DEFAULT_PRODUCTION_GA4_MEASUREMENT_ID;
}
