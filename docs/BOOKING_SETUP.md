# BoatBros Custom Booking Engine — Setup

This document covers local development and deployment for the custom booking flow (Firebase + Stripe + Brevo). The system **starts completely empty** (no experiences in Firestore). Follow the steps below to set everything up.

## Cold start (full process)

1. **Environment** — Copy `.env.example` to `.env.local` and fill in the variables below (Firebase, Stripe, Brevo, `APP_BASE_URL`).
2. **Firebase** — Create a Firebase project, enable Firestore (Blaze plan enables it; you still need a **service account** for the server). Create a service account and set `FIREBASE_SERVICE_ACCOUNT_JSON_PATH` (or the individual Firebase env vars). Admin and booking APIs use the server-side Firebase Admin SDK; without this, admin pages and booking will return 503 with a setup hint. For **boat photo uploads** in admin, enable **Firebase Storage** in the Console (Build → Storage → Get started); uploads go to the default bucket and are stored under `boats/`.
3. **Stripe** — Create a Stripe account and add `STRIPE_SECRET_KEY`. **You must also create a Stripe webhook** (see [Stripe webhook](#stripe-webhook-required-for-bookings-and-confirmation-email) below); without it, payments succeed in Stripe but **no booking is created** and **no confirmation email is sent**.
4. **Brevo** — Create a Brevo account and set `BREVO_API_KEY` (for booking confirmation emails).
5. **App URL** — Set `APP_BASE_URL` (e.g. `http://localhost:3000` for local dev).
6. **Run the app** — `npm run dev`, then open **[/admin](http://localhost:3000/admin)** in the browser.
7. **Admin sign-in (optional)** — If you set `ADMIN_EMAIL` in `.env.local`, you must sign in at **[/admin/login](http://localhost:3000/admin/login)** with that email and its Firebase Auth password. Enable Firebase Authentication (Email/Password) in the Firebase Console, create a user with that email, then set `NEXT_PUBLIC_FIREBASE_*` and `ADMIN_EMAIL`. If you leave `ADMIN_EMAIL` unset, admin routes stay open (dev only).
8. **Run setup or create listings** — On the admin page, click **Run setup** to seed Firestore with 4 experiences, rates, and add-ons (idempotent). Or use **Manage experiences** → **Create experience** to add listings one by one. After that, the booking calendar and modal work on experience pages (e.g. `/experiences/pontoon-party`).

That’s the full process. Details for each step are below.

## Environment variables

Create a `.env.local` (or set in your host) with:

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREBASE_SERVICE_ACCOUNT_JSON_PATH` | Yes* | Path to service account JSON (e.g. `./boat-bros-service-account.json`); preferred over key in env |
| `FIREBASE_PROJECT_ID` | Yes* | Firebase project ID (if not using JSON path) |
| `FIREBASE_CLIENT_EMAIL` | Yes* | Service account client email (if not using JSON path) |
| `FIREBASE_PRIVATE_KEY` | Yes* | Service account private key; escape newlines as `\n` (or use JSON path) |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key (e.g. `sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | Yes | Webhook signing secret (e.g. `whsec_...` from `stripe listen`) |
| `BREVO_API_KEY` | Yes | Brevo API key for transactional email |
| `BREVO_TEMPLATE_ID_BOOKING_CONFIRMATION` or `BREVO_BOOKING_TEMPLATE_ID` | No | Brevo template ID for confirmation email (optional; falls back to HTML) |
| `BREVO_LIST_ID_MARKETING` or `BREVO_MARKETING_LIST_ID` | No | Brevo list ID for marketing opt-in (optional) |
| `BREVO_SENDER_EMAIL` | No | Sender email for transactional emails (default: `noreply@boatbrosatx.com`). **Must be verified in Brevo** (Senders & IP → Senders). |
| `BREVO_SENDER_NAME` | No | Sender display name (default: `Boat Bros ATX`) |
| `APP_BASE_URL` | Yes | Base URL of the app (e.g. `http://localhost:3000` or `https://boatbrosatx.com`) |
| `CRON_SECRET` | No | Secret for cleanup-holds and seed (Bearer token) |
| `SEED_SECRET` | No | Same as CRON_SECRET for seeding |
| `RATE_LIMIT_REDIS_REST_URL` | Recommended (production) | Redis REST URL for rate limiting (e.g. Upstash). Without it in production we fail open (no rate limiting). See [Rate limiting](#rate-limiting). |
| `RATE_LIMIT_REDIS_REST_TOKEN` | Recommended (production) | Redis REST token. Or use `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`. |
| `ADMIN_EMAIL` | No | Email of the only user allowed to access admin (e.g. `boatbrosll@gmail.com`). If unset, admin routes stay open (dev only). |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Yes** | Firebase Web API key (from Firebase Console → Project settings → Your apps → Web app). Required for admin login when `ADMIN_EMAIL` is set. |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Yes** | Auth domain (e.g. `your-project.firebaseapp.com`). |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Yes** | Firebase project ID (same as Firestore). |

**Required when using admin sign-in (when `ADMIN_EMAIL` is set).

See `.env.example` for a template.

## Stripe webhook (required for bookings and confirmation email)

When a customer pays, Stripe sends a **webhook** to your app. The webhook creates the booking in Firestore and sends the confirmation email (Brevo). **If the webhook is not set up or Stripe cannot reach it**, the charge appears in Stripe but no booking appears in Admin and the customer does not get an email.

### Production: create the webhook in Stripe Dashboard

1. **Stripe Dashboard** → **Developers** → **Webhooks** → **Add endpoint**.
2. **Endpoint URL:** `https://YOUR_DOMAIN.com/api/stripe/webhook` (use your real domain, e.g. `https://boatbrosatx.com/api/stripe/webhook`). No trailing slash.
3. **Events to send:** Click **Select events** and enable:
   - **payment_intent.succeeded** (required — this creates the booking and sends the email)
   - **checkout.session.completed** (optional — used if you use Stripe Checkout redirect flow)
4. **Add endpoint**. On the new endpoint page, open **Signing secret** → **Reveal** and copy the value (starts with `whsec_`).
5. Set that value in your production environment as **`STRIPE_WEBHOOK_SECRET`** (e.g. in Netlify/Vercel env vars). Redeploy so the new secret is applied.

### Local development

Stripe cannot call `localhost`. Use the Stripe CLI to forward events:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Use the **webhook signing secret** printed by the CLI (`whsec_...`) in `.env.local` as `STRIPE_WEBHOOK_SECRET`. Complete a test payment on the same app so the hold exists in the same Firestore the webhook uses.

### Troubleshooting

If you paid but see no booking and no email: check [STRIPE_WEBHOOK_DEBUG.md](./STRIPE_WEBHOOK_DEBUG.md). In Admin → Bookings, open **Webhook events** to see recent Stripe events and any errors (e.g. "Hold not found", "Missing holdId").

## Why am I not getting confirmation emails?

The confirmation email is sent by Brevo **after** the booking is created (by the Stripe webhook or by the client calling `POST /api/booking/complete-after-payment`). If the booking appears in Admin but the customer never gets an email, the send is failing and the error is logged on the server.

**Check the following:**

1. **Server logs** — Look for `[brevo] sendBookingConfirmationEmail` or `[convert-hold-to-booking] Brevo send failed` or `[stripe-webhook] Brevo send failed`. The log now includes Brevo’s response (status code and body), e.g.:
   - **401** — Invalid API key. Confirm `BREVO_API_KEY` is correct (SMTP & API → API Keys in Brevo). No extra spaces; use the full key.
   - **400 "Sender not allowed" / "Invalid sender"** — The “From” email is not verified in Brevo. Go to **Senders & IP** → **Senders**, add the sender email (e.g. `noreply@boatbrosatx.com` or the value of `BREVO_SENDER_EMAIL`), and complete verification. Then redeploy or restart the app.
   - **400 other** — Check the response body (e.g. template ID not found, missing params).

2. **Sender email** — The app sends from `BREVO_SENDER_EMAIL` if set, otherwise `noreply@boatbrosatx.com`. That address (or its domain) must be **verified** in Brevo (Senders & IP → Senders). If you use a different domain, set `BREVO_SENDER_EMAIL` to a verified sender.

3. **API key scope** — In Brevo, the API key must have **Send transactional emails** (and optionally **Contacts** if you use the marketing list). Create a new key with the right permissions if needed.

4. **Booking created but email path not run** — If the booking is created via the Stripe webhook, the email is sent right after. If the webhook never runs (e.g. wrong URL or secret), the client may call `complete-after-payment` instead; that path also sends the email. Ensure at least one of these runs (check Webhook events in Admin → Bookings for errors).

## Production checklist (works locally but not in production)

If booking works locally but fails in production, check:

1. **Environment variables** — In your host (Vercel, Netlify, etc.), set the same vars as in `.env.local`: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (full key on one line with `\n` for newlines), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_BASE_URL`, `BREVO_API_KEY`. Redeploy after changing env.
2. **Firebase Private Key** — Production cannot read `.env.local`. The key must be in the host’s env as a single line; multi-line values are often truncated. Use literal `\n` for newlines (e.g. `-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n`).
3. **Stripe Webhook** — In Stripe Dashboard → Webhooks, the endpoint URL must be `https://YOUR_PRODUCTION_DOMAIN/api/stripe/webhook`. Use the same `STRIPE_WEBHOOK_SECRET` from that endpoint in your production env.
4. **APP_BASE_URL** — Must be your production URL (e.g. `https://boatbrosatx.com`), no trailing slash. Used for success/cancel redirects and emails.
5. **Experience slug in Firestore** — Each experience document should have a correct `slug` field (`pontoon`, `watersports`, `sunset`, `holiday`). If `slug` is missing or wrong, boat filtering can show the wrong boats (e.g. pontoon for watersports). Re-run setup or edit the experience in Admin to fix.

When config is missing, the booking UI now shows the API error and hint (e.g. “Booking is not configured. Set FIREBASE_* in your deployment.”). Check the message and the host’s env/logs.

### Calendar not working in production — actual failure points

When the calendar doesn’t work at all in production (no dates, or “Unable to load availability”), the cause is one of these. Check in order:

1. **Slots API returns 503 (Firebase not configured)**  
   - **Symptom:** Calendar shows an error; the message may include “Booking is not configured” and a `firebaseDetail.summary` (e.g. “FIREBASE_PRIVATE_KEY is truncated…”).  
   - **Check:** Open the booking modal and read the error text. Or call `GET https://YOUR_PRODUCTION_DOMAIN/api/booking/slots?experienceId=YOUR_EXP_ID&startDate=2025-01-01&endDate=2025-01-31` and inspect the JSON (503 body includes `firebaseDetail`). Or open `https://YOUR_PRODUCTION_DOMAIN/api/health` — if it returns 503, the body has `firebaseDetail` with the exact reason.  
   - **Fix:** Set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` in Netlify (or your host). Use a **single line** for the key with literal `\n` for newlines; no surrounding quotes. Do **not** set `FIREBASE_SERVICE_ACCOUNT_JSON_PATH` on Netlify (the file is not in the deploy). Redeploy after changing env.

2. **Slots API returns 500 (unhandled error)**  
   - **Symptom:** Request fails with 500; calendar shows a generic error.  
   - **Check:** Netlify → Deploys → latest → Functions / Logs; look for errors from `/api/booking/slots`. In the browser, DevTools → Network: open the slots request and check status and response body.  
   - **Fix:** Usually Firebase config (e.g. invalid or truncated key). Fix env as in (1) and redeploy.

3. **Slots API times out (e.g. Netlify 10s)**  
   - **Symptom:** First month may load; next month never loads or takes forever. Or both hang and then show a failure.  
   - **Check:** In Network tab, the request to `/api/booking/slots` stays pending and then fails (e.g. 504 or “net::ERR_EMPTY_RESPONSE”). In Netlify function logs, the handler may log a timeout.  
   - **Fix:** In Netlify → Site configuration → Build & deploy → Functions, set the function timeout to **26 seconds** if available. Otherwise [contact Netlify Support](https://www.netlify.com/support) to increase the limit to 26s for your site.

4. **Wrong or missing env at runtime**  
   - **Check:** In Netlify, env vars must be set for the **same context** that runs the Next.js server (e.g. “All” or “Build” so they exist at runtime). Ensure no typos (`FIREBASE_PRIVATE_KEY` not `FIREBASE_PRIVATE_KEY_PATH` unless you use a file).  
   - **Fix:** Correct the variables, then trigger a new deploy (env is read at deploy/build, not from the repo).

### Available dates / calendar not loading in production (summary)

If the calendar shows no dates or "Unable to load availability" in production but works locally, the **slots API** (`/api/booking/slots`) is almost always failing because **Firebase is not configured** (or the private key is truncated) in the production environment.

1. **Check the error in the UI** — Open the booking modal on the production site. The message now includes the server’s `firebaseDetail.summary` when present (e.g. “FIREBASE_PRIVATE_KEY is truncated…”).
2. **Check the health endpoint** — Open `https://YOUR_PRODUCTION_DOMAIN/api/health`. If it returns **503**, the JSON body includes `firebaseDetail` with the exact reason.
3. **Fix Firebase in production** — See [Calendar not working in production — actual failure points](#calendar-not-working-in-production--actual-failure-points) above. Redeploy after changing env.

## Netlify: get booking working in production

To get the full booking flow (including **more than one month** loading in the calendar) working on Netlify:

1. **Use the Next.js runtime (required)** — The repo's `netlify.toml` includes `[[plugins]]` with `package = "@netlify/plugin-nextjs"`; `package.json` has the plugin in devDependencies. This runs the real Next.js server so SSR, API routes, and image optimization work. Without it, pages/APIs can return 503.  
   In Netlify → Site configuration → Build & deploy → Build:
   - **Build command:** `npm run build` (or `next build`).
   - **Publish directory:** leave as set by the Netlify Next.js plugin (usually `.next` is handled automatically).  
   If you use **Netlify’s “Detect next.js”** or **@netlify/plugin-nextjs**, API routes under `/api/*` (including `/api/booking/slots`, `/api/booking/create-hold`, etc.) run as serverless functions. Without the Next runtime, those routes won’t exist in production.

2. **Function timeout (26 seconds)**  
   The slots API can exceed Netlify's default 10s; the second calendar month may then 504. The repo's `netlify.toml` sets `[functions."___netlify-handler"] timeout = 26`. If your Netlify UI has **Build & deploy → Functions** and a "Function timeout" (or "Default function timeout") option, set it to **26**. If that option is not available on your plan or UI, the `netlify.toml` value may still be applied by the build; if the second month still times out, contact [Netlify Support](https://www.netlify.com/support) and ask to increase the function timeout to 26 seconds for your site.

3. **Set environment variables** (Site settings → Environment variables → Add variable / Import from .env):
   - **Firebase (required for slots, holds, checkout):**  
     `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (single line, newlines as `\n` — see [Firebase Private Key](#production-deployment-netlify--vercel--etc) below).  
     Do **not** set `FIREBASE_SERVICE_ACCOUNT_JSON_PATH` in Netlify.
   - **Stripe:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
   - **Brevo:** `BREVO_API_KEY`.
   - **App URL:** `APP_BASE_URL` = your production URL (e.g. `https://yoursite.com`), no trailing slash.
   - **Public (if using Stripe or Firebase on the client):** `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, and if using admin login: `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `ADMIN_EMAIL`.  
   Set scope to **All** or **Build** so they’re available at build and runtime. Then **Trigger deploy** (or push a commit) so the new vars are applied.

4. **Stripe webhook**  
   In Stripe Dashboard → Webhooks, add endpoint URL:  
   `https://YOUR_NETLIFY_DOMAIN/api/stripe/webhook`  
   Events: `checkout.session.completed`, `payment_intent.succeeded`.  
   Copy the signing secret into Netlify as `STRIPE_WEBHOOK_SECRET` and redeploy.

5. **Deploy the latest code**  
   Ensure the repo has the fixes for production (UTC date parsing in the slots API, shared month range in the booking modal). Push to the branch Netlify builds from and wait for the deploy to finish.

6. **Verify**
   - Open the production site → Book now or an experience page.
   - Open the first month; then click **Next month**. The second month should load (no “Unable to load availability”).
   - Before release: validate with GET /api/health (should not return 503). If health returns 503, fix the reported check (e.g. firebase, stripe, rateLimit). When rateLimit is degraded, set Redis env vars (see Rate limiting). Then confirm calendar data with GET /api/booking/slots?experienceId=...&startDate=...&endDate=...
   - If the second month still doesn’t load: Netlify → Deploys → latest → Functions / Logs; look for errors from `/api/booking/slots` (e.g. 400/503). In the browser, DevTools → Network: check the request to `/api/booking/slots?experienceId=...&startDate=...&endDate=...` for the next month and see the response status and body.

## Production deployment (Netlify / Vercel / etc.)

For **Book now** and experiences to work in production, the server must have Firebase Admin credentials. If they are missing or truncated, `/api/booking/slots` returns 503 and calendar month data never loads; `/api/experiences` may return 500 and the booking modal shows “No experiences” or “Failed to load experiences.”

**Set these in your host’s environment** (e.g. Netlify → Site settings → Environment variables) exactly as required by `lib/booking/env.ts`:

- `FIREBASE_PROJECT_ID` — your Firebase project ID
- `FIREBASE_CLIENT_EMAIL` — from the service account JSON (`client_email`)
- `FIREBASE_PRIVATE_KEY` — **must be the full private key on a single line** using literal `\n` for newlines. Netlify (and most hosts) do not support multi-line env values. In the service account JSON, `private_key` is multiple lines. To use it in Netlify: open the key in a text editor, replace every actual newline with the two characters backslash + n (`\n`), so you get one long line (e.g. `-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n`). Paste that single line as the value of `FIREBASE_PRIVATE_KEY` (no surrounding quotes). The app will turn `\n` back into newlines at runtime.

**Avoid** using `FIREBASE_SERVICE_ACCOUNT_JSON_PATH` on Netlify unless the file truly exists at runtime (e.g. committed or built into the deploy). If the path is set but the file is missing, Firebase fails and the app returns 503. Using the three variables above is the reliable approach. **Do not set FIREBASE_SERVICE_ACCOUNT_JSON_PATH in Netlify**—the file is not in the deploy.

**Before release:** validate with `GET /api/health` (should not return 503). If health returns 503, the body includes which check failed (e.g. `firebase`, `stripe`, `rateLimit`). When `rateLimit` is `degraded`, configure Redis (see [Rate limiting](#rate-limiting)) for proper limiting; with Redis down and `RATE_LIMIT_FAIL_CLOSED=1`, booking mutation endpoints return 503. Direct calls to `GET /api/booking/slots?experienceId=...&startDate=...&endDate=...` can confirm calendar month data loads.

Also set: `STRIPE_*`, `BREVO_*`, `APP_BASE_URL` (e.g. `https://yoursite.com`), and optionally `ADMIN_EMAIL` and `NEXT_PUBLIC_FIREBASE_*` for admin login. **For admin login in production:** `FIREBASE_PROJECT_ID` and `NEXT_PUBLIC_FIREBASE_PROJECT_ID` must be the same Firebase project; otherwise the server cannot verify the sign-in token and returns 401. After saving, redeploy so the new env vars are applied.

## Admin sign-in (Firebase Auth)

- **Firebase Console:** Enable **Authentication** → **Sign-in method** → **Email/Password**. Create a user with the email you use for admin (e.g. `boatbrosll@gmail.com`) and set that user’s password. In **Project settings** → **General** → **Your apps**, add a Web app if needed and copy the **API key**, **Auth domain** (`your-project.firebaseapp.com`), and **Project ID** into `.env.local` as `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, and `NEXT_PUBLIC_FIREBASE_PROJECT_ID`.
- **Login:** Go to **[/admin/login](http://localhost:3000/admin/login)** and sign in with that email and password. The app uses Firebase Auth; on success it exchanges the ID token for a session cookie and redirects to `/admin`.
- **Protection:** When `ADMIN_EMAIL` is set, all routes under `/admin` (except `/admin/login`) require a valid Firebase session cookie. Only the user with that email can access admin.
- **Logout:** Use the **Sign out** button on the admin page, or call `POST /api/admin/logout` (clears the cookie and redirects to `/admin/login`).
- **Password not working / Forgot password:** Use **Forgot password?** on the login page to send a reset link to your admin email. The email must match `ADMIN_EMAIL` and the user must exist in Firebase Console → Authentication → Users. If you never set a password, add the user in Firebase Console (Authentication → Users → Add user) with the same email as `ADMIN_EMAIL` and set a password. Ensure **Email/Password** is enabled under Authentication → Sign-in method.
- **"Not authorized for admin":** You signed in with an email that does not match `ADMIN_EMAIL`. Sign in with the exact email configured as `ADMIN_EMAIL` in your environment.
- **401 "Invalid or expired token" in production:** The login page and browser console (F12 → Console) show a hint. Common fixes: (1) In Netlify, set **FIREBASE_PROJECT_ID** and **NEXT_PUBLIC_FIREBASE_PROJECT_ID** to the **exact same value** (e.g. `boat-bros-app`) and ensure both are available at **build time** (env scope "All" or "Build"). (2) **FIREBASE_PRIVATE_KEY** must be the full key on one line with `\n` for newlines; remove any surrounding quotes in the Netlify value. (3) Redeploy after changing env vars. To see the exact server error: Netlify → your site → Deploys → latest deploy → Functions / Logs, and search for `[admin/session] 401 cause:`.

## Create a listing

1. Sign in at **[/admin/login](http://localhost:3000/admin/login)** if `ADMIN_EMAIL` is set.
2. Open **[/admin](http://localhost:3000/admin)** → **Manage experiences**.
3. Click **Create experience**, fill in the form (slug, title, description, hero URL, gallery URLs, location, capacity, included, rules, cancellation policy, FAQs, seasonal options, rates, add-ons).
4. Submit. The experience is created in Firestore; the calendar and booking flow read from Firestore. Hero and gallery are URL fields (paste links or use existing `/photos/...` paths); image upload is not included in this phase.
5. To edit an existing experience, go to **Manage experiences** and click **Edit** on a row.

## Booking data collected

| Data | Where collected | Notes |
|------|------------------|--------|
| **Contact** (name, email, phone) | Stripe Checkout (direct flow) or book-page form (full flow) | Checkout collects email + phone; name can be collected via Stripe or pre-checkout form. Webhook uses `customer_details` when present. |
| **Party size** | Full book page (`/experiences/…/book`) or default 1 for direct checkout | Direct checkout (header calendar, listing calendar) uses default party size 1; full book page lets the user choose. Stored on hold and booking. |
| **Pets** | Full book page or default 0 for direct checkout | Same as party size: direct checkout defaults to 0. |
| **Special notes** | Stripe Checkout custom field | Optional “Special requests (optional)” text field in Checkout; saved on booking as `specialNotes`. |

**Future options:** To collect party size, special notes, or contact before redirecting to Stripe (e.g. from the header or listing calendar), add a short pre-checkout step: a small form (party size, notes, name/email/phone) that submits to create-hold then redirects to Checkout. The hold would carry the submitted values and Checkout could skip or prefill fields as needed.

## Cancel flow and release-hold

When the user cancels Stripe Checkout, they are redirected to `/booking/cancel?holdId=...`. The cancel page calls `GET /api/booking/release-hold?holdId=...` so the held slot is **released immediately** and set back to open. The hold document is marked `status: "expired"`. No auth is required for release-hold (the holdId is unguessable). You can also call `POST /api/booking/release-hold` with body `{ "holdId": "..." }` for the same effect. The cleanup-holds cron still runs to expire holds that were never released (e.g. user closed the tab).

## Rate limiting

The booking endpoints `POST /api/booking/create-hold`, `POST /api/booking/create-payment-intent`, `POST /api/booking/create-checkout-session`, `POST /api/booking/create-checkout-session-direct`, and `POST /api/booking/validate-discount` are rate-limited in code (see `lib/booking/rate-limit.ts`). **In production, a shared Redis store is recommended.** When Redis is not configured in production, the rate limiter **fails open** (requests are allowed) so the site keeps working; set Redis for proper rate limiting. When Redis is configured but unavailable (error or timeout), policy is controlled by env: default is fail-open; set `RATE_LIMIT_FAIL_CLOSED=1` to reject requests with **503** (not 429) so Redis outages do not silently bypass limits. In development, when Redis is not set, an in-memory store is used (resets on cold start).

### Production: Redis recommended

Set **one** of the following in your production environment:

| Variable | Description |
|----------|-------------|
| `RATE_LIMIT_REDIS_REST_URL` | Redis REST API URL (e.g. Upstash Redis REST endpoint) |
| `RATE_LIMIT_REDIS_REST_TOKEN` | Redis REST API token |
| **Or** | |
| `UPSTASH_REDIS_REST_URL` | Same as above (alternative names) |
| `UPSTASH_REDIS_REST_TOKEN` | Same as above |

Without these, in production the rate limiter **fails open** (no 429); booking works but rate limiting is disabled. When Redis is configured but **unavailable** and `RATE_LIMIT_FAIL_CLOSED=1`, rate-limited booking endpoints return **503** with a generic message and an `incidentCode` for support correlation; see SECURITY.md for runbook. The health endpoint reports status: `GET /api/health` returns 503 with `rateLimit: "degraded"` when Redis is missing or unhealthy in production; use a privileged health request (see docs) for `rateLimitDetail`. **Before release, ensure `/api/health` returns 200**; if it returns 503 due to `rateLimit: degraded`, configure Redis or deployment checks should block release.

For a quick setup, use [Upstash Redis](https://upstash.com/) (REST API), create a database, and set `RATE_LIMIT_REDIS_REST_URL` and `RATE_LIMIT_REDIS_REST_TOKEN` (or the `UPSTASH_REDIS_*` equivalents) in your host's environment variables.

As a short-term improvement, you can also enable IP-based rate limiting at the edge (e.g. Netlify rate limiting in `netlify.toml`, or Vercel's built-in DDoS protection) in addition to the app-level limiter.

## Local development

### 1. Firebase

- Create a Firebase project and enable Firestore.
- Create a service account (Project settings → Service accounts → Generate new private key).
- Put `project_id`, `client_email`, and `private_key` into `.env.local` as `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.

**Alternative: Firestore Emulator (no quota, no billing)**  
If you’re hitting **RESOURCE_EXHAUSTED: Quota exceeded**, use the Firestore emulator for local dev. It runs Firestore on your machine with no limits.

1. Install the [Firebase CLI](https://firebase.google.com/docs/cli): `npm install -g firebase-tools` (or use `npx`).
2. From the project root, run: `firebase init emulators`. Choose **Firestore**, use the default port (8080), and skip the rest if you don’t need them.
3. Start the emulator (in a separate terminal):  
   `firebase emulators:start --only firestore`  
   Leave it running. It will show something like: `Firestore Emulator running at http://127.0.0.1:8080`.
4. In `.env.local`, add (or set):  
   `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`  
   Keep your existing Firebase env vars (project ID and credentials). The app will use the emulator instead of cloud Firestore when this is set.
5. Start the app: `npm run dev`. Then run the seed: `npm run seed` (or use **Run setup** on `/admin`).  
   All Firestore traffic goes to the emulator, so there is no quota and the seed should succeed.

When you’re done with local dev, remove or comment out `FIRESTORE_EMULATOR_HOST` so the app uses real Firestore again.

### 2. Stripe

- Use [Stripe CLI](https://stripe.com/docs/stripe-cli) to forward webhooks to your local server:

  ```bash
  stripe listen --forward-to localhost:3000/api/stripe/webhook
  ```

- Copy the webhook signing secret (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`.
- Use Stripe test keys: `STRIPE_SECRET_KEY=sk_test_...`.

### 3. Brevo

- Create an API key in Brevo (SMTP & API → API Keys). The key must have **Send transactional emails** permission.
- Set `BREVO_API_KEY`. Optionally create a transactional template and set `BREVO_BOOKING_TEMPLATE_ID`, and a list for `BREVO_MARKETING_LIST_ID`.
- **Verify the sender:** In Brevo go to **Senders & IP** → **Senders** and add/verify the email you use as the “From” address. By default the app uses `noreply@boatbrosatx.com`; if that domain is not verified, Brevo will reject sends. Set `BREVO_SENDER_EMAIL` (and optionally `BREVO_SENDER_NAME`) to a verified sender if you use a different address.

### 4. App URL

- Set `APP_BASE_URL=http://localhost:3000` for local dev (success/cancel URLs use this).

### 5. Seed data

- Start the dev server: `npm run dev`.

**Legacy boats (optional):**

  ```bash
  curl -X POST http://localhost:3000/api/booking/seed -H "Authorization: Bearer YOUR_SECRET"
  ```
  Creates boats, rates, add-ons, and open slots for the next 14 days (used by `/booking`).

**Experiences (4 listing pages + 60 days of slots):**

  - **One-click (recommended):** Open **[/admin](http://localhost:3000/admin)** in the browser and click **Run setup**. That page shows status (Firebase, Stripe, Brevo, experiences) and runs the seed. In production, set `SEED_SECRET` in your env and enter it as the setup key.
  - **Or via API:**

  ```bash
  curl -X POST http://localhost:3000/api/booking/seed-experiences
  ```
  If you set `SEED_SECRET`/`CRON_SECRET`, add `-H "Authorization: Bearer YOUR_SECRET"`. This creates:
  - 4 experiences: Lake Austin Pontoon Charter (`pontoon`), WaterSports Charter (`watersports`), Sunset Cruise (`sunset`), Holiday Boat Tour (`holiday`)
  - Rates (3–8 hours), add-ons (snack pack, ice, towels, sunscreen, tip), and slots for the next 60 days (start times 11:00, 14:00, 17:00 per duration)
  - Listing pages: `/experiences/pontoon`, `/experiences/watersports`, `/experiences/sunset`, `/experiences/holiday`

### 6. Firestore index (slots)

The slots API queries `startAt` with a range and `orderBy("startAt")`. If Firestore prompts you to create an index, use the link in the error message or add a composite index on `boats/{boatId}/slots`: fields `startAt` (Ascending).

## API routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/experiences` | List active experiences (id, slug, title, fromPriceCents, etc.) |
| GET | `/api/experiences/[slug]` | Experience detail + rates + addons (slug: pontoon, watersports, sunset, holiday) |
| GET | `/api/booking/boats` | List active boats (legacy) |
| GET | `/api/booking/boat/[boatId]` | Boat detail + rates + addons (legacy) |
| GET | `/api/booking/slots?experienceId= or boatId=&startDate=&endDate=` | Slots in date range (YYYY-MM-DD) |
| POST | `/api/booking/create-hold` | Create hold (body: **experienceId** or boatId, slotId, rateId, addonSelections, partySize, petsCount, customerDraft, marketingOptIn, answers). Validates seasonal rules for experiences. |
| POST | `/api/booking/create-checkout-session` | Create Stripe Checkout Session (body: holdId) |
| GET | `/api/booking/receipt?session_id=` | Get booking by Stripe session (for success page; returns experienceName when experienceId) |
| POST | `/api/stripe/webhook` | Stripe webhook (signature verified; finalizes booking, sends Brevo email, optional marketing list) |
| POST | `/api/booking/cleanup-holds` | Expire old holds and release slots (cron; supports boatId and experienceId) |
| POST | `/api/booking/seed` | Seed boats (legacy; optional `Authorization: Bearer SEED_SECRET`) |
| POST | `/api/booking/seed-experiences` | Seed 4 experiences + rates + addons + 60 days slots (optional `Authorization: Bearer SEED_SECRET`) |
| POST | `/api/admin/session` | Admin sign-in (body: `token` = Firebase ID token); verifies token, sets session cookie, returns redirect |
| POST | `/api/admin/logout` | Clear admin session cookie, redirect to `/admin/login` |
| GET | `/api/admin/experiences` | List all experiences (id, slug, title, active); requires admin session |
| POST | `/api/admin/experiences` | Create experience + optional rates/addons; requires admin session |
| GET | `/api/admin/experiences/[id]` | Get one experience + rates + addons; requires admin session |
| PATCH | `/api/admin/experiences/[id]` | Update experience and optionally replace rates/addons; requires admin session |

## Frontend routes

- `/admin` — Admin dashboard (status, Run setup, Manage experiences). When `ADMIN_EMAIL` is set, redirects to `/admin/login` if not signed in.
- `/admin/login` — Admin sign-in (Firebase Auth email/password).
- `/admin/experiences` — List experiences; links to create and edit.
- `/admin/experiences/new` — Create experience form.
- `/admin/experiences/[id]` — Edit experience form.
- `/experiences/pontoon`, `/experiences/watersports`, `/experiences/sunset`, `/experiences/holiday` — Experience listing pages (hero, content, sticky booking card with calendar, time, duration, add-ons, Stripe Checkout). Data from Firestore (seed first).
- `/booking` — Legacy calendar and booking flow (boats).
- `/booking/success?session_id=` — Confirmation page (calls receipt API; shows experience name when applicable).
- `/booking/cancel` — Checkout cancelled (link back to `/booking`).

## Cleanup cron

To release expired holds periodically, call `POST /api/booking/cleanup-holds` with `Authorization: Bearer CRON_SECRET` on a schedule (e.g. every 5–10 minutes via Vercel Cron, GitHub Actions, or a cron job).

## 50/50 deposit flow (Payment Element only)

- **Deposit:** Customer pays 50% via Payment Element; card is saved for off-session use. Booking is created with status `final_due` and `finalChargeAt` = trip start − 48 hours.
- **Final charge cron:** Call `POST /api/booking/run-final-charges` with `Authorization: Bearer CRON_SECRET` (e.g. every 15–30 minutes). It attempts off-session final charge for bookings where `status === "final_due"` and `finalChargeAt <= now`. Webhook `payment_intent.succeeded` (metadata `payment_stage: "final"`) marks the booking `final_paid`.
- **Final payment request email (48h before trip):** Call `POST /api/booking/final-payment-reminder-cron` with `Authorization: Bearer CRON_SECRET` (e.g. hourly). Finds `final_due` bookings whose trip is in 46–50 hours, sends one email per booking with a secure “Pay now” link to `/booking/manage?token=...`. After they pay on that page, the Stripe webhook marks the booking `final_paid`. Requires `MANAGE_BOOKING_SECRET` and `APP_BASE_URL`. Tracks `finalPaymentRequestSentAt` on the booking so each customer gets only one email.
- **Manage booking:** Set `MANAGE_BOOKING_SECRET` in env. Confirmation email includes a signed link to `/booking/manage?token=...` where the customer can update card or pay remaining balance.
- **Firestore index:** For `run-final-charges` you may need a composite index on `bookings`: `status` (Ascending) + `finalChargeAt` (Ascending). If the query fails, use the link in the error to create the index in Firebase Console.

## Console messages and troubleshooting

- **`api/admin/session` 401** — Shown when something sends a **POST** to `/api/admin/session` with an invalid or expired token (e.g. admin login with wrong credentials or after token expiry). The site header uses **GET** to check session and never triggers 401; you can ignore this if you are not on the admin login page.
- **Stripe: "You have not registered or verified the domain" (Apple Pay)** — To enable Apple Pay in the Payment Element, [register and verify your domain](https://stripe.com/docs/payments/payment-methods/pmd-registration) in the Stripe Dashboard. Until then, card and other enabled methods still work.
- **"Unable to download payment manifest" (Google Pay)** — Often a network or CORS issue with `pay.google.com`; Google Pay may still work in supported browsers. You can ignore if card payments succeed.
- **`/api/booking/complete-after-payment` 500** — Payment succeeded but creating the booking failed. Check **server logs** (e.g. Netlify Functions logs) for `[booking:complete-after-payment]`; the logged error and stack show the cause. Common causes: missing or invalid **Firebase** env (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` or service account path), **Stripe** key, **Brevo** key, or Firestore permissions. The client shows a generic “contact support” message for config errors; for other errors the server returns the message so the user sees it in the booking modal.

## Security notes

- Stripe secret key and webhook secret, Brevo API key, and Firebase private key are server-only; never expose them to the client.
- Pricing is computed on the server in create-hold and create-checkout-session and rechecked in the webhook.
- Slot state changes (open → held → booked) use Firestore transactions.
- Webhook processing is idempotent (events stored in `stripeEvents`).
