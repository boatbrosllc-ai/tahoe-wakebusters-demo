/**
 * Next.js server startup hook. Validates production booking env before serving traffic.
 *
 * See https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NODE_ENV !== "production") return;

  const { setBookingReadyForProductionStartup, setLegacyFallbackSafeForProductionStartup } = await import(
    "@/lib/booking/booking-runtime-state"
  );
  const {
    assertProductionReleaseTokenSecret,
    assertProductionReceiptTokenSecret,
    assertProductionContactAndStaffEmails,
  } = await import("@/lib/booking/env");

  try {
    assertProductionReleaseTokenSecret();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(
      "[instrumentation] CRITICAL: RELEASE_TOKEN_SECRET validation failed — booking routes will return 503 until configured.",
      msg
    );
    setBookingReadyForProductionStartup(false);
  }

  try {
    assertProductionReceiptTokenSecret();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(
      "[instrumentation] CRITICAL: RECEIPT_TOKEN_SECRET validation failed — booking routes will return 503 until configured.",
      msg
    );
    setBookingReadyForProductionStartup(false);
  }

  assertProductionContactAndStaffEmails();

  const { isRateLimitReadyForProduction } = await import("@/lib/booking/rate-limit");
  if (!isRateLimitReadyForProduction()) {
    console.error(
      "[instrumentation] CRITICAL: Redis is not configured for rate limiting (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN or RATE_LIMIT_*). Post-payment routes use in-memory fallback; configure Redis for production. See SECURITY.md."
    );
  }

  const { assertFirebaseAdminReachableForProduction } = await import("@/lib/booking/firebase-admin");
  try {
    await assertFirebaseAdminReachableForProduction();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `[instrumentation] Hold path: Firebase Admin / Firestore is not reachable at startup (${msg}). Fix credentials and network access before serving traffic.`
    );
  }

  // Guard: when legacy booking fallback is disabled, fail closed until all bookings have startDateStr.
  // Otherwise we risk missing overlap conflicts from legacy rows (double-booking).
  if (process.env.DISABLE_LEGACY_BOOKING_FALLBACK === "true") {
    try {
      const { getDb } = await import("@/lib/booking/firebase-admin");
      const db = getDb();
      const legacyProbe = await db.collection("bookings").where("startDateStr", "==", null).limit(1).get();
      if (!legacyProbe.empty) {
        console.error(
          "[instrumentation] CRITICAL: DISABLE_LEGACY_BOOKING_FALLBACK=true but bookings backfill is incomplete (found startDateStr == null). " +
            "Booking routes will return 503 until backfill completes."
        );
        setBookingReadyForProductionStartup(false);
      }
    } catch (probeErr) {
      console.warn(
        "[instrumentation] Legacy startDateStr backfill probe failed; leaving bookingReady unchanged.",
        probeErr instanceof Error ? probeErr.message : probeErr
      );
    }
  }

  // Best-effort validation: warn when blocks reference an unknown experience id/slug.
  // (Blocks are written under both canonical id + slug variants; older data may not.)
  try {
    const { getDb } = await import("@/lib/booking/firebase-admin");
    const db = getDb();
    const blocksSnap = await db.collection("blocks").limit(500).get();
    const expIds = Array.from(
      new Set(
        blocksSnap.docs
          .map((d) => (d.data() as { experienceId?: unknown }).experienceId)
          .filter((v): v is string => typeof v === "string" && v.trim() !== "")
          .map((s) => s.trim())
      )
    );
    for (const expId of expIds) {
      const docSnap = await db.collection("experiences").doc(expId).get();
      if (docSnap.exists) continue;
      const slugSnap = await db.collection("experiences").where("slug", "==", expId).limit(1).get();
      if (!slugSnap.empty) continue;
      console.warn(
        "[instrumentation] WARNING: block references unknown experienceId (no matching experiences doc id or slug).",
        { experienceId: expId }
      );
    }
  } catch (blockValidateErr) {
    console.warn(
      "[instrumentation] Blocks experienceId validation skipped (probe failed).",
      blockValidateErr instanceof Error ? blockValidateErr.message : blockValidateErr
    );
  }

  const legacyBooking = process.env.DISABLE_LEGACY_BOOKING_FALLBACK === "true";
  const legacyHolds = process.env.DISABLE_LEGACY_HOLDS_FALLBACK === "true";
  let legacySafe = legacyBooking && legacyHolds;
  if (!legacySafe) {
    try {
      const { getDb } = await import("@/lib/booking/firebase-admin");
      const db = getDb();
      const [bookingsProbe, holdsProbe] = await Promise.all([
        db.collection("bookings").limit(1).get(),
        db.collection("holds").limit(1).get(),
      ]);
      if (bookingsProbe.empty && holdsProbe.empty) {
        legacySafe = true;
        console.warn(
          "[instrumentation] Greenfield Firestore (no bookings or holds): legacy fallback treated as safe until data exists. Set DISABLE_LEGACY_BOOKING_FALLBACK=true and DISABLE_LEGACY_HOLDS_FALLBACK=true before first production bookings — see .env.example."
        );
      }
    } catch (probeErr) {
      console.warn(
        "[instrumentation] Greenfield legacy probe failed; using env-based legacy fallback flags only.",
        probeErr instanceof Error ? probeErr.message : probeErr
      );
    }
  }
  setLegacyFallbackSafeForProductionStartup(legacySafe);
  if (!legacySafe) {
    console.warn(
      "[instrumentation] DISABLE_LEGACY_BOOKING_FALLBACK and DISABLE_LEGACY_HOLDS_FALLBACK should both be true after startDateStr backfill. GET /api/admin/backfill-status must report zero remaining before enabling. See docs/BOOKING_FLOW_OVERVIEW.md.",
      { disableLegacyBookingFallback: legacyBooking, disableLegacyHoldsFallback: legacyHolds }
    );
  }

  if (process.env.ENABLE_BLOCK_CHECK_FAIL_OPEN === "true") {
    throw new Error(
      "[instrumentation] ENABLE_BLOCK_CHECK_FAIL_OPEN=true is not allowed in production (NODE_ENV=production). " +
        "This flag is obsolete: block queries that cannot complete now always fail closed (503). Deploy firestore.indexes.json and unset this flag."
    );
  }

  const { assertDisableLegacyBookingFallbackInProductionStartup } = await import("@/lib/booking/legacy-fallback-warn");
  await assertDisableLegacyBookingFallbackInProductionStartup();
}
