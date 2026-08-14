/**
 * Check that production-required env vars are set (names only; no values printed).
 * Run before deploy or in CI to catch missing config. Usage: node scripts/check-production-env.js
 *
 * Netlify production builds use: node scripts/check-production-env.js --ga-only
 * (validates NEXT_PUBLIC_GA_MEASUREMENT_ID only; full audit is still this script without --ga-only).
 *
 * Requires Node; uses fs/path; optional firebase-admin for legacy backfill gate when real credentials exist.
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
  "CONTACT_EMAIL",
  "STAFF_OPERATIONS_EMAIL",
  "APP_BASE_URL",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "MANAGE_BOOKING_SECRET",
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

/** Same set as BOOKING_STATUSES_SLOT_TAKEN in lib/booking/types.ts (slot-taking rows). */
const BOOKING_STATUSES_SLOT_TAKEN = [
  "paid",
  "final_due",
  "final_paid",
  "final_processing",
  "final_requires_action",
  "final_failed",
];

function hasValue(name) {
  const v = process.env[name];
  return v != null && String(v).trim() !== "";
}

function hasAny(...names) {
  return names.some(hasValue);
}

const fs = require("fs");
const path = require("path");
const { parseGoogleTagId } = require("../lib/ga-tag-id");

function fileExists(resolvedPath) {
  try {
    return fs.existsSync(resolvedPath);
  } catch {
    return false;
  }
}

/**
 * When DISABLE_LEGACY_BOOKING_FALLBACK=true, refuse deploy if any slot-taking booking lacks a valid startDateStr.
 * Skipped for emulator, placeholder credentials, or when CHECK_PRODUCTION_SKIP_FIRESTORE_START_DATE_STR=1.
 */
async function assertSlotTakenBookingsHaveStartDateStrWhenLegacyDisabled() {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.DISABLE_LEGACY_BOOKING_FALLBACK !== "true") return;
  if (process.env.CHECK_PRODUCTION_SKIP_FIRESTORE_START_DATE_STR === "1") return;
  if (process.env.FIRESTORE_EMULATOR_HOST?.trim()) return;
  const pk = process.env.FIREBASE_PRIVATE_KEY ?? "";
  if (!pk.trim() || pk === "placeholder" || pk.includes("placeholder") || pk.length < 80) return;

  let admin;
  try {
    admin = require("firebase-admin");
  } catch {
    console.warn("[check-production-env] firebase-admin not available; skip startDateStr Firestore check.");
    return;
  }

  if (!admin.apps.length) {
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH?.trim();
    if (serviceAccountPath) {
      const resolved = path.isAbsolute(serviceAccountPath) ? serviceAccountPath : path.join(process.cwd(), serviceAccountPath);
      const json = JSON.parse(fs.readFileSync(resolved, "utf8"));
      admin.initializeApp({ credential: admin.credential.cert(json) });
    } else {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: String(process.env.FIREBASE_PRIVATE_KEY).replace(/\\n/g, "\n"),
        }),
      });
    }
  }

  const db = admin.firestore();
  let lastDoc = null;
  const PAGE = 200;
  for (let page = 0; page < 100; page++) {
    let q = db
      .collection("bookings")
      .where("status", "in", BOOKING_STATUSES_SLOT_TAKEN)
      .orderBy("createdAt", "desc")
      .limit(PAGE);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      const d = doc.data();
      const s = typeof d.startDateStr === "string" ? d.startDateStr.trim() : "";
      if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        console.error(
          `[check-production-env] Booking ${doc.id} is missing valid startDateStr while DISABLE_LEGACY_BOOKING_FALLBACK=true. ` +
            `Run POST /api/admin/backfill-start-date-str until zero remaining (see docs/BOOKING_AVAILABILITY.md).`
        );
        process.exit(1);
      }
    }
    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE) break;
  }
}

/** GA tag rules aligned with lib/ga-measurement-id.ts (production must set a valid Google tag ID). */
function collectProductionGa4Missing() {
  const missing = [];
  const parsed = parseGoogleTagId(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID);
  if (parsed.kind === "unset") {
    missing.push(
      "GA4: set NEXT_PUBLIC_GA_MEASUREMENT_ID to your active Google tag ID (for GA4 typically G-...). " +
        "Production requires this variable explicitly; there is no built-in fallback measurement ID."
    );
  } else {
    if (parsed.kind !== "valid") {
      const state =
        parsed.kind === "empty"
          ? "empty"
          : parsed.kind === "disabled"
            ? "disabled (off/0)"
            : "malformed";
      missing.push(
        "GA4: set NEXT_PUBLIC_GA_MEASUREMENT_ID to a valid Google tag ID in production " +
          "(accepted families: G-, GT-, AW-, DC-). " +
          `Current value is ${state}.`
      );
    }
  }
  return missing;
}

async function main() {
  const gaOnly = process.argv.includes("--ga-only");
  if (gaOnly) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[check-production-env] --ga-only: NODE_ENV is not production; skipping.");
      return;
    }
    const gaMissing = collectProductionGa4Missing();
    if (gaMissing.length > 0) {
      console.error("[check-production-env] Netlify production pre-build failed (GA4):");
      gaMissing.forEach((m) => console.error("  -", m));
      process.exit(1);
    }
    console.log("[check-production-env] GA-only check passed.");
    return;
  }

  const missing = [];
  const requiredAliases = {
    STRIPE_SECRET_KEY: ["STRIPE_SECRET_KEY", "STRIPE_CONNECT_SECRET_KEY"],
    APP_BASE_URL: ["APP_BASE_URL", "NEXT_PUBLIC_APP_URL"],
    ADMIN_EMAIL: ["ADMIN_EMAIL", "PLATFORM_ADMIN_EMAIL"],
    CONTACT_EMAIL: ["CONTACT_EMAIL", "BREVO_SENDER_EMAIL", "SENDGRID_FROM_EMAIL"],
  };
  for (const name of required) {
    const names = requiredAliases[name] || [name];
    if (!hasAny(...names)) missing.push(names.join(" or "));
  }
  if (hasValue("APP_BASE_URL")) {
    const u = String(process.env.APP_BASE_URL).trim();
    if (!u.startsWith("https://") && !u.startsWith("http://")) {
      missing.push("APP_BASE_URL must be an absolute URL (https://... or http:// for local dev) so waiver and email links work");
    }
  }
  // Firebase: path mode (preferred) OR credential-variable mode — same contract as lib/booking/env.ts
  const hasFirebasePath = hasValue(firebasePathVar);
  const hasFirebaseCreds =
    (hasValue("FIREBASE_PROJECT_ID") || hasValue("FIREBASE_ADMIN_PROJECT_ID")) &&
    (hasValue("FIREBASE_CLIENT_EMAIL") || hasValue("FIREBASE_ADMIN_CLIENT_EMAIL")) &&
    (hasValue("FIREBASE_PRIVATE_KEY") || hasValue("FIREBASE_ADMIN_PRIVATE_KEY") || hasValue("FIREBASE_PRIVATE_KEY_PATH"));
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
    if (disableBooking) {
      console.warn(
        "[check-production-env] With DISABLE_LEGACY_BOOKING_FALLBACK=true, ensure all bookings have startDateStr backfilled " +
          "(no documents with startDateStr==null). GET /api/health (privileged) and server logs flag gaps; see docs/BOOKING_AVAILABILITY.md."
      );
    } else {
      const parsedLim = parseInt(process.env.LEGACY_BOOKING_SCAN_LIMIT ?? "2000", 10);
      const cap =
        Number.isFinite(parsedLim) && parsedLim >= 500 ? Math.min(parsedLim, 50_000) : 2000;
      const warnAt = Math.floor(cap * 0.8);
      console.warn(
        `[check-production-env] Legacy booking fallback is on — run app/api/admin/backfill-start-date-str until complete ` +
          `before any experience variant approaches ${warnAt} paid bookings in the legacy scan (80% of LEGACY_BOOKING_SCAN_LIMIT=${cap}).`
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
      missing.push(
        "ENABLE_BLOCK_CHECK_FAIL_OPEN must be absent or false in production (obsolete flag; block queries now fail closed on index errors).",
      );
    }
    if (process.env.BLOCK_CHECK_FAIL_OPEN === "true") {
      missing.push(
        "BLOCK_CHECK_FAIL_OPEN must be absent or false in production (it disables block enforcement when the blocks index query fails).",
      );
    }
    missing.push(...collectProductionGa4Missing());
  }
  if (missing.length > 0) {
    console.error("Missing or empty env (required for production):");
    missing.forEach((m) => console.error("  -", m));
    process.exit(1);
  }

  await assertSlotTakenBookingsHaveStartDateStrWhenLegacyDisabled();

  console.log("Production env check passed (required vars present).");
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[check-production-env]", err);
    process.exit(1);
  });
}

module.exports = {
  collectProductionGa4Missing,
};
