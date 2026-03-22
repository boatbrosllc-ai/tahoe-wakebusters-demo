/**
 * Check that production-required env vars are set (names only; no values printed).
 * Run before deploy or in CI to catch missing config. Usage: node scripts/check-production-env.js
 * Requires Node; uses fs/path only (no npm deps).
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
  "RECEIPT_TOKEN_SECRET",
  "RELEASE_TOKEN_SECRET",
  "ADMIN_EMAIL",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
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

function hasValue(name) {
  const v = process.env[name];
  return v != null && String(v).trim() !== "";
}

const fs = require("fs");
const path = require("path");

function fileExists(resolvedPath) {
  try {
    return fs.existsSync(resolvedPath);
  } catch {
    return false;
  }
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
  if (hasFirebasePath) {
    const raw = String(process.env[firebasePathVar]).trim();
    const resolved = path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
    if (!fileExists(resolved)) {
      missing.push(`Firebase: ${firebasePathVar} must point to an existing file (resolved: ${resolved})`);
    }
  }
  if (hasValue("FIREBASE_PRIVATE_KEY_PATH")) {
    const raw = String(process.env.FIREBASE_PRIVATE_KEY_PATH).trim();
    const resolved = path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
    if (!fileExists(resolved)) {
      missing.push(`FIREBASE_PRIVATE_KEY_PATH must point to an existing file (resolved: ${resolved})`);
    }
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
      missing.push(`In production set rate limiting: RATE_LIMIT_REDIS_REST_URL and RATE_LIMIT_REDIS_REST_TOKEN, or UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN`);
    }
    if ((hasRedis || hasUpstash) && !hasValue("RATE_LIMIT_FAIL_CLOSED")) {
      missing.push(
        "In production with Redis configured, set RATE_LIMIT_FAIL_CLOSED=1 so booking endpoints return 503 when Redis is unavailable (matches runtime fail-closed policy for create-hold and related routes)."
      );
    }
    if (process.env.ENABLE_BLOCK_CHECK_FAIL_OPEN === "true") {
      console.warn(
        "WARNING: ENABLE_BLOCK_CHECK_FAIL_OPEN=true — block overlap checks may be skipped when the blocks index is missing. Deploy Firestore indexes and unset this flag; never leave enabled in production.",
      );
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
