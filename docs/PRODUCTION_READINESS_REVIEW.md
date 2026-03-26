# Production Readiness Review — Boat Bros Booking

This document summarizes a production readiness review so you can launch with confidence that bookings work flawlessly. It covers critical paths, configuration, security, and operational checks.

---

## Executive summary

**Verdict: Ready for production with a short checklist.**

The booking flow is well-architected with:

- **Dual completion path:** Stripe webhook **and** client `complete-after-payment` so bookings are created even if the webhook is delayed or misconfigured.
- **Idempotency:** Webhook events (lease + `stripeEvents`), hold conversion, final charge (idempotency key + lock), and duplicate payment handling (`pendingRefunds`).
- **Strong validation:** Create-hold validates slot, capacity, blocks, seasonal rules, discount limits inside transactions; convert-hold checks slot ownership and shared capacity.
- **Security:** Admin middleware, cron/seed secrets, signed release and manage tokens, Stripe signature verification, rate limiting (fail-open when Redis missing or down; set RATE_LIMIT_FAIL_CLOSED=1 to return 503 when Redis is unavailable).

**Before launch you must:** set all required env vars in production (especially Firebase key format, Stripe webhook URL/secret, Redis for rate limit), protect admin with `ADMIN_EMAIL`, and run through the pre-launch checklist below.

---

## 1. Booking flow — critical paths

### 1.1 Create hold → Pay → Booking created

| Step | Route / component | Notes |
|------|-------------------|--------|
| 1. Create hold | `POST /api/booking/create-hold` | Rate limited. Validates experience/boat, slot, rate, capacity, blocks, seasonal, discount (with maxRedemptions in tx). Shared ticketed: reserves capacity in departure inventory. Charter: holds slot in Firestore tx. 10-min hold expiry. |
| 2a. Payment (modal) | `POST /api/booking/create-payment-intent` → Stripe Payment Element → `confirmPayment` | Reuses existing PI when amount matches; idempotency key per hold+stage+amount. |
| 2b. Payment (redirect) | `POST /api/booking/create-checkout-session` → Stripe Checkout redirect | Idempotency key `cs-{holdId}`. On Stripe create failure, rollback: release slot + expire hold. |
| 3. Convert hold → booking | **Webhook** `payment_intent.succeeded` / `checkout.session.completed` **or** client `POST /api/booking/complete-after-payment` | Same `convertHoldToBooking()`. Idempotent: if hold already `converted`, returns `alreadyConverted`. Expired hold → throw (webhook flags refund in `pendingRefunds`). |
| 4. Confirmation | `convertHoldToBooking` sends Brevo confirmation + optional waiver invite + business copy | Email failure is logged; booking is still created. |
| 5. Success page | `/booking/success?session_id=...` or `?payment_intent_id=...` | `GET /api/booking/receipt` supports both; looks up by `stripe.checkoutSessionId` or `stripe.paymentIntentId` / `stripe.depositPaymentIntentId`. |

**Risks mitigated:**

- Webhook never runs → client `complete-after-payment` (after `confirmPayment`) creates the booking and sends email.
- Both run → first wins; second gets `alreadyConverted`.
- Duplicate charge for same hold → `pendingRefunds` entry; booking already has correct PI id.
- Hold expired after payment → webhook writes `pendingRefunds` for refund; returns 200 so Stripe doesn’t retry.

### 1.2 Cancel checkout (release hold)

- User leaves Checkout or cancels → redirect to `/booking/cancel?holdId=...&release_token=...`.
- Cancel page calls `POST /api/booking/release-hold` with `{ holdId, release_token }`.
- `release_token` is HMAC-signed (holdId + expiry); without valid token, release requires admin or `BLOCK_SECRET`/`SEED_SECRET`.
- Transaction: slot → open, hold → expired; for shared ticketed, release capacity.

**Production:** Ensure `RELEASE_TOKEN_SECRET` or `MANAGE_BOOKING_SECRET` is set so create-hold/checkout return `releaseToken` and the cancel link works.

### 1.3 50/50 deposit and final charge

- Deposit: Payment Element charges 50%; booking created with `status: final_due`, `finalChargeAt` = trip − 48h.
- Cron: `POST /api/admin/cron/run-final-charges` with `Authorization: Bearer CRON_SECRET` creates PaymentIntent (idempotency key `final_charge_{bookingId}`), confirms off-session; webhook `payment_intent.succeeded` (metadata `payment_stage: "final"`) sets `final_paid`.
- Lock: `finalChargeLockAt` prevents duplicate attempts within 10 minutes; existing PI status `succeeded` → reconcile booking to `final_paid` without recharging.
- Final charge failure → status `final_requires_action` or `final_failed`, customer emailed (manage link if `MANAGE_BOOKING_SECRET` set).

---

## 2. Configuration and environment

### 2.1 Required for booking to work

| Variable | Purpose |
|----------|---------|
| Firebase | `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (or `FIREBASE_SERVICE_ACCOUNT_JSON_PATH` where file exists at runtime) |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Brevo | `BREVO_API_KEY`; sender email verified in Brevo |
| App | `APP_BASE_URL` (production URL, no trailing slash) |
| Publishable | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (payment step in UI) |

**Production note (Netlify etc.):** Do **not** use `FIREBASE_SERVICE_ACCOUNT_JSON_PATH` unless the file is present at runtime. Use `FIREBASE_PRIVATE_KEY` as a **single line** with literal `\n` for newlines (no surrounding quotes). The app normalizes and validates; truncated key throws a clear error.

### 2.2 Rate limiting (Redis required in production)

Redis is **required** for production launch. Without Redis, the rate limiter fails open (no rate limiting) and `GET /api/health` returns **503** (deployment is degraded). Before launch:

- Create an Upstash Redis instance and set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in the Netlify environment (or `RATE_LIMIT_REDIS_REST_URL` + `RATE_LIMIT_REDIS_REST_TOKEN`).
- After deploying, call `GET /api/health` on production; it must return HTTP 200 with `rateLimit: 'ok'`.

When Redis is configured but **unavailable**, default is fail-open. Set `RATE_LIMIT_FAIL_CLOSED=1` so that if Redis becomes unavailable after launch, checkout returns 503 with an `incidentCode` rather than silently dropping rate limits. See SECURITY.md for runbook.

### 2.3 Recommended for production

| Variable | Purpose |
|----------|---------|
| `ADMIN_EMAIL` | Restrict admin to one user; without it, admin routes are open (dev only). |
| `MANAGE_BOOKING_SECRET` | Signed manage-booking links (50/50 flow, pay remaining, update card). |
| `RELEASE_TOKEN_SECRET` or same as manage | Signed cancel link so users can release hold from cancel page. |
| `CRON_SECRET` | Protects cleanup-holds, run-final-charges, reminder crons. |
| `SEED_SECRET` | Protects seed endpoints when pointing at non-local DB. |
| `BLOCK_SECRET` | Calendar block/unblock APIs. |
| `HEALTH_INTERNAL_SECRET` | Optional; full health diagnostics with header `X-Internal-Health-Secret`. |
| `BREVO_SENDER_EMAIL` | Verified sender in Brevo (default `noreply@boatbrosatx.com`). |

### 2.4 Health check

- **Public:** `GET /api/health` → 200 when Firebase, Stripe, and (in production) rate limit are OK; 503 otherwise. Body is minimal unless privileged.
- **Privileged:** Same URL with `X-Internal-Health-Secret: <HEALTH_INTERNAL_SECRET>` or admin session → full diagnostics (firebaseDetail, rateLimitDetail, releaseTokenSigning, manageBookingSecret).

**Before launch:** Call `GET /api/health` on production; it must return 200. If 503, fix the reported check (e.g. Redis for rate limit, Firebase key format).

---

## 3. Security

- **Admin:** Middleware protects `/admin` and `/api/admin`; only `/admin/login` and `/api/admin/session` are public. When `ADMIN_EMAIL` is set, only that user (Firebase Auth session cookie) can access admin.
- **Stripe webhook:** Signature verified with `STRIPE_WEBHOOK_SECRET`; invalid signature → 400.
- **Cron:** cleanup-holds, run-final-charges, reminder crons require `Authorization: Bearer CRON_SECRET`.
- **Release hold:** Either valid signed `release_token` (holdId + expiry) or admin/BLOCK_SECRET/SEED_SECRET.
- **Manage booking:** Links signed with `MANAGE_BOOKING_SECRET`; token verified on manage APIs.
- **Rate limit:** Client key from `x-real-ip` or `x-nf-client-connection-ip` only (not spoofable headers). Production: Redis required; otherwise all requests treated as rate limited.
- **Netlify:** Security headers and CSP in `netlify.toml` (Stripe domains, frame-src, etc.). Netlify rate-limit redirects add a second layer for create-hold, create-checkout-session-direct, validate-discount, create-payment-intent.

---

## 4. Stripe webhook

- **Production:** In Stripe Dashboard add endpoint `https://YOUR_DOMAIN/api/stripe/webhook`. Events: `payment_intent.succeeded`, `checkout.session.completed`, `payment_intent.payment_failed`. Set the signing secret as `STRIPE_WEBHOOK_SECRET` in production env and redeploy.
- **Idempotency:** Each event id claimed in `stripeEvents` with a processing lease (5 min); completed events skipped; retries on 500 so Stripe can retry safely.
- **Outcomes:** Written to `stripeEvents` (completed / failed_retryable) for debugging; duplicate/expired cases marked completed with outcome text.

---

## 5. Email (Brevo)

- Confirmation and business copy sent from `convertHoldToBooking` (webhook or complete-after-payment). Failures are logged; booking is still created.
- Final charge failed email sent from webhook and run-final-charges. Manage link included when `MANAGE_BOOKING_SECRET` is set.
- If bookings appear in Admin but customers don’t get email: check Brevo API key, sender verification, and server logs (e.g. `[brevo]`, `convert-hold`).

---

## 6. Deployment (Netlify)

- **Next.js:** `@netlify/plugin-nextjs` and publish `.next` so API routes and server logic run correctly.
- **Function timeout:** `netlify.toml` sets 26s for `___netlify-handler` so slots API (second month) can complete. Cron functions 60s.
- **Env:** All booking and admin vars must be set in Netlify (or equivalent) for the runtime context; redeploy after changes. Do not rely on `.env.local` in production.

---

## 7. Cron jobs

| Job | Netlify function / route | Schedule (example) | Purpose |
|-----|---------------------------|--------------------|---------|
| Cleanup holds | `netlify/functions/cleanup-holds.mts` → `POST /api/admin/cron/cleanup-holds` | e.g. every 30 min | Expire active holds past `expiresAt`, release slots and shared capacity. |
| Run final charges | `POST /api/admin/cron/run-final-charges` | Every 30 min | Charge remaining balance for `final_due` bookings at/after `finalChargeAt`. |
| Final payment reminder | `POST /api/admin/cron/final-payment-reminder-cron` | e.g. hourly | Email 48h before trip with “Pay now” link. |
| Booking reminder | `POST /api/admin/cron/reminder-cron` | As desired | Trip reminder emails. |
| Waiver reminder | `POST /api/admin/cron/waiver-reminder` | As desired | Waiver signing reminders. |
| Reconcile rollback-pending holds | `netlify/functions/reconcile-rollback-pending-holds.mts` → `POST /api/admin/cron/reconcile-rollback-pending-holds` | Every 10 min | Reconcile holds stuck in `rollbackPending` by checking Stripe PaymentIntent and auto-releasing slots when no succeeded charge exists. |

All require `Authorization: Bearer CRON_SECRET`. Netlify scheduled functions call the app with this header.

---

## 8. Pre-launch checklist

- [ ] **Env in production:** Firebase (project id, client email, private key single-line with `\n`), Stripe (secret + webhook secret), Brevo (API key, verified sender), `APP_BASE_URL`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
- [ ] **Rate limit (required for launch):** Create an Upstash Redis instance; set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in Netlify. After deploy, `GET /api/health` must return 200 with `rateLimit: 'ok'` (503 otherwise). Optionally set `RATE_LIMIT_FAIL_CLOSED=1` so checkout returns 503 when Redis is down instead of failing open.
- [ ] **Stripe webhook:** Endpoint URL = `https://YOUR_DOMAIN/api/stripe/webhook`; events `payment_intent.succeeded`, `checkout.session.completed`, `payment_intent.payment_failed`; `STRIPE_WEBHOOK_SECRET` set and redeployed.
- [ ] **Admin:** `ADMIN_EMAIL` set; Firebase Auth enabled; admin user created; `NEXT_PUBLIC_FIREBASE_*` and (if used) `FIREBASE_PRIVATE_KEY` for server verification. `FIREBASE_PROJECT_ID` and `NEXT_PUBLIC_FIREBASE_PROJECT_ID` identical. `ADMIN_EDGE_SECRET` set in Netlify (required for admin edge guard; without it the guard is silently disabled — verify before first deploy).
- [ ] **Health:** `GET /api/health` returns 200. If privileged health used, `HEALTH_INTERNAL_SECRET` set.
- [ ] **Cron:** `CRON_SECRET` set; Netlify (or other) scheduled functions call cleanup-holds, run-final-charges, final-payment-reminder, reconcile-rollback-pending-holds, and process-pending-refunds with Bearer token.
- [ ] **50/50 and manage:** `MANAGE_BOOKING_SECRET` set for manage links and final charge emails. Optional: `RELEASE_TOKEN_SECRET` for cancel-page release link.
- [ ] **Firestore index:** Composite index on `bookings`: `status` + `finalChargeAt` if using run-final-charges (create via link in error if needed).
- [ ] **Legacy fallback:** Set `DISABLE_LEGACY_BOOKING_FALLBACK=true` and `DISABLE_LEGACY_HOLDS_FALLBACK=true` in Netlify from day one (required-in-production; `npm run check-env` fails if missing). This disables O(n) legacy Firestore scans; ensure Firestore indexes are deployed and, if migrating existing data, run startDateStr backfill before or immediately after first deployment.
- [ ] **Smoke test:** Create hold → pay (test card) → confirm booking appears in Admin, confirmation email received, success page shows receipt. Cancel flow: create hold → cancel → slot released. If using 50/50: deposit → booking `final_due` → after finalChargeAt run cron (or wait) → webhook sets `final_paid`.

**Post-setup (after first deployment):** After Firestore setup is confirmed working, unset `SEED_SECRET` in the Netlify environment so the seed endpoints return 401 with no secret. The seed routes also return 404 in production unless `ALLOW_SEED_IN_PRODUCTION=true` is set (defense in depth).

---

## 9. Edge cases and failure modes

| Scenario | Handling |
|----------|----------|
| Webhook down or wrong URL | Client `complete-after-payment` creates booking and sends email. |
| Same event processed twice | `stripeEvents` lease + status; second run sees completed and returns 200. |
| Hold expired after payment | Webhook flags `pendingRefunds`; returns 200; no double booking. |
| Duplicate payment for same hold | `pendingRefunds` + idempotent convert (alreadyConverted). |
| Final charge already succeeded (e.g. webhook missed) | run-final-charges sees PI status succeeded → reconciles to `final_paid` without charging again. |
| Discount maxRedemptions exceeded during convert | Booking still created; discount not incremented; optional refund flow via `pendingRefunds`. |
| Brevo send fails | Logged; booking and slot state unchanged; operator can resend from Admin or tooling. |
| Redis down in production | Rate limiter fails open by default (requests allowed). Set `RATE_LIMIT_FAIL_CLOSED=1` to return 503 when Redis is down. Optional `RATE_LIMIT_DEGRADED_USE_MEMORY=1` for stricter in-memory fallback. |
| Slots API timeout | Netlify 26s timeout; if second month still times out, contact Netlify for higher limit. |

---

## 10. Summary

- **Bookings:** Create-hold, payment (Payment Element or Checkout), and convert (webhook + complete-after-payment) are idempotent and resilient. Cancel and release-hold use signed tokens. Final charge uses idempotency key and lock.
- **Config:** All required env vars must be set in production; Firebase key as single line with `\n`; Redis recommended for rate limit (fail-open when missing or down unless `RATE_LIMIT_FAIL_CLOSED=1`).
- **Security:** Admin, webhook, cron, and token-based endpoints are protected. Rate limit fails open when Redis is missing or down (set `RATE_LIMIT_FAIL_CLOSED=1` to return 503 when Redis unavailable).
- **Operations:** Health endpoint, cron secrets, Stripe webhook URL/secret, and a quick smoke test complete the picture.

Once the pre-launch checklist is done and health returns 200, the system is ready for production launch.
