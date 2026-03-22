/**

 * Next.js server startup hook. Validates production booking env before serving traffic.

 * See https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

 */



export async function register() {

  if (process.env.NODE_ENV !== "production") return;

  const { assertProductionBookingEnv } = await import("@/lib/booking/env");

  assertProductionBookingEnv();

  const { isRateLimitReadyForProduction } = await import("@/lib/booking/rate-limit");
  if (!isRateLimitReadyForProduction()) {
    throw new Error(
      "[instrumentation] Hold path: production requires Redis for rate limiting. Set RATE_LIMIT_REDIS_REST_URL and RATE_LIMIT_REDIS_REST_TOKEN (or UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN). See SECURITY.md and scripts/check-production-env.js."
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

  if (process.env.ENABLE_BLOCK_CHECK_FAIL_OPEN === "true") {
    console.warn(
      "[instrumentation] WARNING: ENABLE_BLOCK_CHECK_FAIL_OPEN=true — block overlap checks may be skipped when the blocks index is missing. This is unsafe for production; deploy Firestore indexes and unset this flag.",
    );
  }

}


