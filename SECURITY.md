# Security and secrets

## Secrets in `.env.local`

**Do not commit or share `.env.local`.** It may contain Firebase private keys, Stripe secret keys, Brevo API keys, and other secrets.

### If `.env.local` was ever committed or shared

1. **Rotate all secrets immediately:**
   - **Firebase:** Generate a new service account key in [Firebase Console → Project settings → Service accounts](https://console.firebase.google.com/), then revoke the old key.
   - **Stripe:** Roll the secret key in [Stripe Dashboard → Developers → API keys](https://dashboard.stripe.com/apikeys).
   - **Brevo:** Delete and recreate the API key in Brevo → SMTP & API → API Keys.
   - **App secrets:** Regenerate `CRON_SECRET`, `SEED_SECRET`, `BLOCK_SECRET`, `RELEASE_HOLD_INTERNAL_SECRET`, `ADMIN_EDGE_SECRET`, `MANAGE_BOOKING_SECRET`, `RECEIPT_TOKEN_SECRET`, `BOOKING_CALENDAR_FEED_SECRET`, and `RELEASE_TOKEN_SECRET` and set the new values in Netlify.

2. **Confirm `.env.local` was never committed:**  
   Run: `git log --all -- .env.local`  
   (Empty output = never committed.)

3. **Store new secrets only in Netlify:**  
   Use [Netlify → Site → Environment variables](https://docs.netlify.com/configure-builds/environment-variables/). Do not put production secrets in any file that could be pushed to a remote.

### Rotating ADMIN_EDGE_SECRET

`ADMIN_EDGE_SECRET` signs the admin Edge session cookie. To rotate it:

1. Generate a new secret (e.g. `openssl rand -hex 32`) and set it as `ADMIN_EDGE_SECRET` in Netlify → Site → Environment variables.
2. Redeploy so all new admin logins receive cookies signed with the new secret.
3. Existing admin sessions (old cookies) will fail verification until users sign in again; no data migration is required.

### Rotating BLOCK_SECRET

`BLOCK_SECRET` authorizes automation for `/api/admin/blocks/*` routes.

1. Generate and set a new `BLOCK_SECRET` in your deployment environment.
2. Redeploy all environments that expose block endpoints.
3. Revoke old automation credentials and update any callers to the new bearer token.

Rotation requires redeploy because running functions read env vars at runtime boot.

### Pre-commit hook

A pre-commit hook blocks commits that add or modify `.env.local` or other secret-bearing files (e.g. `*service*account*.json`, `*.pem`, `*.key`). Install with:

```bash
npm run prepare
```

This installs [husky](https://typicode.github.io/husky/) and registers the hook. Every commit will run it. To bypass in an emergency (not recommended): `git commit --no-verify`.

---

## Firestore indexes and legacy booking fallback

Required composite indexes for the booking APIs are defined in `firestore.indexes.json`. If they are not deployed, Firestore may use a slow legacy scan that can timeout or miss data.

1. **Deploy indexes:** From the project root:
   ```bash
   firebase deploy --only firestore:indexes --project boat-bros-app
   ```
2. **Confirm in Firebase Console:** Firestore → Indexes. Every index from `firestore.indexes.json` should show status **Enabled** (not Building — building can take several minutes). CI runs `npm run verify-firestore-blocks-index` so the repo always defines the blocks triple-field composite; after deploy, verify **blocks** indexes are READY before accepting booking traffic.
3. **Disable legacy fallback only after `startDateStr` backfill:** Run `POST /api/admin/backfill-start-date-str` (bookings + holds) until no documents remain with `startDateStr == null` (verify with the probe logic in `lib/booking/booking-readiness-response.ts`). **Do not** set `DISABLE_LEGACY_BOOKING_FALLBACK=true` or `DISABLE_LEGACY_HOLDS_FALLBACK=true` in production until that count is zero: with both flags enabled, `startDateStrBackfillReadinessResponse` returns **503** on booking endpoints until the backfill probes pass, and `assertSlotAvailable` fails closed (503) when legacy scans are disabled. After backfill is confirmed, set both vars in Netlify → Site → Environment variables alongside production `check-env` requirements.
4. **`ENABLE_BLOCK_CHECK_FAIL_OPEN`:** Do **not** set this in production or staging. It is obsolete (ignored); block overlap checks always fail closed when the Firestore blocks query cannot complete. We cannot read Netlify env from the repo — operators must confirm this flag is unset in each environment.

---

## Rate limiting and Redis (RATE_LIMIT_FAIL_CLOSED)

**Production:** `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (or `RATE_LIMIT_REDIS_REST_*`) are **required**. Without them, `NODE_ENV=production` booking endpoints that use the shared rate limiter return **503** until Redis is configured.

Booking mutation endpoints (create-hold, create-payment-intent, create-checkout-session, create-checkout-session-direct, receipt, manage routes, etc.) use Redis when configured. When Redis is **unavailable** (error or timeout), the default policy for most endpoints is **fail-open**: requests are allowed so checkout is not a single point of failure. Set **`RATE_LIMIT_FAIL_CLOSED=1`** to reject with **503** when Redis is down (use only if you accept that Redis outages will block checkout).

**validate-discount:** On Redis errors in production, this endpoint **fails closed (503) by default** to reduce discount enumeration. Set **`RATE_LIMIT_VALIDATE_DISCOUNT_DEGRADED_FAIL_OPEN=1`** to allow the legacy fail-open behavior for that route only.

**Behavior summary:** Redis configured but down → fail-open for most routes unless `RATE_LIMIT_FAIL_CLOSED=1` → then 503 with generic message and `incidentCode`. Public error responses never expose Redis/Upstash or other infrastructure details; diagnostics are in server logs and privileged health only.

**Troubleshooting when customers see 503 (rate limit):**  
1. Check server logs for the `incidentCode` returned to the client (e.g. `INC-xxxx-xxxx`) to correlate with the same request.  
2. Use a **privileged** `GET /api/health` (header `X-Internal-Health-Secret: <HEALTH_INTERNAL_SECRET>` or admin session) to read `rateLimitDetail`.  
3. Restore Redis or temporarily unset `RATE_LIMIT_FAIL_CLOSED` so the default fail-open allows bookings while you fix connectivity; then re-enable fail-closed if desired.

**In-memory fallback (default in production):** When Redis is down and the route is not fail-closed, production uses a bounded in-memory limiter by default (`RATE_LIMIT_DEGRADED_USE_MEMORY=0` disables). Operational logs include `[rate-limit] DEGRADED_ALLOW` / `DEGRADED_LIMIT` for monitoring.

**Mutation endpoints:** Set `RATE_LIMIT_MUTATION_FAIL_CLOSED=1` so `create-hold` and `create-payment-intent` return 503 when Redis errors (in addition to optional global `RATE_LIMIT_FAIL_CLOSED`).

---

## Receipt vs manage secrets

`RECEIPT_TOKEN_SECRET` and `MANAGE_BOOKING_SECRET` must be **different** random values. A single leaked secret must not allow forging both receipt links and manage-booking links. Production health (`GET /api/health` with privilege) reports `receiptAndManageSecretsDistinct`.

**`RECEIPT_TOKEN_SECRET` is required in production** (enforced at server startup). Without it, receipt claim tokens and signed success links cannot be issued; customers would see degraded confirmation UIs only.

**`CONTACT_EMAIL` and `STAFF_OPERATIONS_EMAIL` are required in production** (enforced at server startup). `CONTACT_EMAIL` receives business copies and operational notices; `STAFF_OPERATIONS_EMAIL` receives staff booking and pipeline alerts.

---

## `BOOKING_CALENDAR_FEED_SECRET`

The bulk calendar feed URL embeds this token. Anyone with the URL can pull booking metadata for the requested range. **Rotate this secret in Netlify if the URL is leaked** (same urgency as other bearer-capable secrets).

---

## Manage booking URLs and `?token=`

Manage links include a signed token in the query string. That can surface in referrers, history, and logs. The manage page strips `token` from the URL after load, but that does not protect against capture before the client runs. Prefer short TTL (`MANAGE_BOOKING_LINK_TTL_DAYS`, default 3). A future one-time redirect exchange would avoid putting the long-lived secret in the query string entirely.

---

## Admin on staging and preview

Set **`ADMIN_EDGE_SECRET`** on every Netlify/Vercel deployment that serves `/admin` or `/api/admin/*`, including previews. Without it, hosted non-production deployments block admin routes (503) or return 401, matching production-like expectations.

---

## Cron replay protection

Scheduled callers must send **`X-Cron-Timestamp`** (Unix seconds) within ±5 minutes of server time, in addition to `Authorization: Bearer CRON_SECRET`. Captured bearer tokens cannot be replayed indefinitely.

---

## Legacy manage tokens (3-segment)

Old URLs embedded email in the signed payload. Verification logs a deprecation warning; after the sunset date, those tokens are rejected. Regenerate links using the current `signManageToken` (2-segment) format.
