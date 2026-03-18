/**
 * Check that production-required env vars are set (names only; no values printed).
 * Run before deploy or in CI to catch missing config. Usage: node scripts/check-production-env.js
 * Requires Node; no dependencies.
 *
 * Firebase: follows same contract as lib/booking/env.ts (hasFirebaseConfig).
 * - Path mode: FIREBASE_SERVICE_ACCOUNT_JSON_PATH set (file must exist); FIREBASE_PROJECT_ID and
 *   FIREBASE_CLIENT_EMAIL are NOT required in path mode.
 * - Credential-variable mode: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and one of
 *   FIREBASE_PRIVATE_KEY or FIREBASE_PRIVATE_KEY_PATH are required.
 */

const required = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "BREVO_API_KEY",
  "APP_BASE_URL",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "MANAGE_BOOKING_SECRET",
];

// Firebase: either service account path (path mode) OR project + client_email + private key (variable mode)
const firebasePathVar = "FIREBASE_SERVICE_ACCOUNT_JSON_PATH";
const firebaseCredentialVars = [
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  // One of:
  "FIREBASE_PRIVATE_KEY",
  "FIREBASE_PRIVATE_KEY_PATH",
];

const productionOnly = [
  "RATE_LIMIT_REDIS_REST_URL",
  "RATE_LIMIT_REDIS_REST_TOKEN",
];

function hasValue(name) {
  const v = process.env[name];
  return v != null && String(v).trim() !== "";
}

function main() {
  const missing = [];
  for (const name of required) {
    if (!hasValue(name)) missing.push(name);
  }
  // Firebase: path mode (preferred) OR credential-variable mode — same contract as lib/booking/env.ts
  const hasFirebasePath = hasValue(firebasePathVar);
  const hasFirebaseCreds =
    hasValue("FIREBASE_PROJECT_ID") &&
    hasValue("FIREBASE_CLIENT_EMAIL") &&
    (hasValue("FIREBASE_PRIVATE_KEY") || hasValue("FIREBASE_PRIVATE_KEY_PATH"));
  if (!hasFirebasePath && !hasFirebaseCreds) {
    missing.push(
      `Firebase: set ${firebasePathVar} (path mode) OR all of ${firebaseCredentialVars.join(", ")} (variable mode)`
    );
  }
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction) {
    const disableBooking = process.env.DISABLE_LEGACY_BOOKING_FALLBACK === "true";
    const disableHolds = process.env.DISABLE_LEGACY_HOLDS_FALLBACK === "true";
    if (!disableBooking || !disableHolds) {
      missing.push(
        "In production set DISABLE_LEGACY_BOOKING_FALLBACK=true and DISABLE_LEGACY_HOLDS_FALLBACK=true (required from day one; see SECURITY.md)."
      );
    }
    const hasRedis =
      hasValue("RATE_LIMIT_REDIS_REST_URL") && hasValue("RATE_LIMIT_REDIS_REST_TOKEN");
    const hasUpstash =
      hasValue("UPSTASH_REDIS_REST_URL") && hasValue("UPSTASH_REDIS_REST_TOKEN");
    if (!hasRedis && !hasUpstash) {
      missing.push(`In production set: ${productionOnly.join(" and ")} (or UPSTASH_* equivalents)`);
    }
    if (!hasValue("ADMIN_EDGE_SECRET")) {
      missing.push("ADMIN_EDGE_SECRET (required in production for admin Edge session cookie)");
    }
  }
  if (missing.length > 0) {
    console.error("Missing or empty env (required for production):");
    missing.forEach((m) => console.error("  -", m));
    process.exit(1);
  }
  console.log("Production env check passed (required vars present).");
}

main();
