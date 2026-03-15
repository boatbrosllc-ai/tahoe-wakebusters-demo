# Security and secrets

## Secrets in `.env.local`

**Do not commit or share `.env.local`.** It may contain Firebase private keys, Stripe secret keys, Brevo API keys, and other secrets.

### If `.env.local` was ever committed or shared

1. **Rotate all secrets immediately:**
   - **Firebase:** Generate a new service account key in [Firebase Console → Project settings → Service accounts](https://console.firebase.google.com/), then revoke the old key.
   - **Stripe:** Roll the secret key in [Stripe Dashboard → Developers → API keys](https://dashboard.stripe.com/apikeys).
   - **Brevo:** Delete and recreate the API key in Brevo → SMTP & API → API Keys.
   - **App secrets:** Regenerate `CRON_SECRET`, `SEED_SECRET`, `ADMIN_EDGE_SECRET`, and `MANAGE_BOOKING_SECRET` and set the new values in Netlify.

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
2. **Confirm in Firebase Console:** Firestore → Indexes. Every index from `firestore.indexes.json` should show status **Enabled** (not Building — building can take several minutes).
3. **Disable legacy fallback in production:** Set `DISABLE_LEGACY_BOOKING_FALLBACK=true` and `DISABLE_LEGACY_HOLDS_FALLBACK=true` in Netlify → Site → Environment variables **from day one** (required; `npm run check-env` fails in production if unset). This enables fast indexed queries and disables O(n) legacy Firestore scans. If you have existing bookings/holds without `startDateStr`, run the startDateStr backfill (e.g. `/api/admin/backfill-booking-boat-ids` dry-run) and then set these vars before or immediately after first deployment.

---

## Rate limiting and Redis (RATE_LIMIT_FAIL_CLOSED)

Booking mutation endpoints (create-hold, create-payment-intent, create-checkout-session, create-checkout-session-direct, validate-discount) are rate-limited using a shared Redis store when configured. When Redis is **unavailable** (error or timeout), the default policy is **fail-open**: requests are allowed so checkout is not a single point of failure. Set **`RATE_LIMIT_FAIL_CLOSED=1`** to reject requests with **503** when Redis is down so traffic does not bypass limits (use only if you accept that Redis outages will block checkout).

**Behavior summary:** Missing Redis in production → fail-open (no 503). Redis configured but down → fail-open unless `RATE_LIMIT_FAIL_CLOSED=1` → then 503 with generic message and `incidentCode`. Public error responses never expose Redis/Upstash or other infrastructure details; diagnostics are in server logs and privileged health only.

**Troubleshooting when customers see 503 (rate limit):**  
1. Check server logs for the `incidentCode` returned to the client (e.g. `INC-xxxx-xxxx`) to correlate with the same request.  
2. Use a **privileged** `GET /api/health` (header `X-Internal-Health-Secret: <HEALTH_INTERNAL_SECRET>` or admin session) to read `rateLimitDetail`.  
3. Restore Redis or temporarily unset `RATE_LIMIT_FAIL_CLOSED` so the default fail-open allows bookings while you fix connectivity; then re-enable fail-closed if desired.

**Optional in-memory fallback:** Set `RATE_LIMIT_DEGRADED_USE_MEMORY=1` so that when Redis is down (and not fail-closed), a stricter in-memory limit is used instead of full fail-open. Operational logs include `[rate-limit] DEGRADED_ALLOW` / `DEGRADED_LIMIT` for monitoring.
