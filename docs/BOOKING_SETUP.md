# BoatBros Custom Booking Engine — Setup

This document covers local development and deployment for the custom booking flow (Firebase + Stripe + Brevo). The system **starts completely empty** (no experiences in Firestore). Follow the steps below to set everything up.

## Cold start (full process)

1. **Environment** — Copy `.env.example` to `.env.local` and fill in the variables below (Firebase, Stripe, Brevo, `APP_BASE_URL`).
2. **Firebase** — Create a Firebase project, enable Firestore (Blaze plan enables it; you still need a **service account** for the server). Create a service account and set `FIREBASE_SERVICE_ACCOUNT_JSON_PATH` (or the individual Firebase env vars). Admin and booking APIs use the server-side Firebase Admin SDK; without this, admin pages and booking will return 503 with a setup hint.
3. **Stripe** — Create a Stripe account, add test keys (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`), and configure the webhook to point to `APP_BASE_URL/api/stripe/webhook`.
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
| `APP_BASE_URL` | Yes | Base URL of the app (e.g. `http://localhost:3000` or `https://boatbrosatx.com`) |
| `CRON_SECRET` | No | Secret for cleanup-holds and seed (Bearer token) |
| `SEED_SECRET` | No | Same as CRON_SECRET for seeding |
| `ADMIN_EMAIL` | No | Email of the only user allowed to access admin (e.g. `boatbrosll@gmail.com`). If unset, admin routes stay open (dev only). |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Yes** | Firebase Web API key (from Firebase Console → Project settings → Your apps → Web app). Required for admin login when `ADMIN_EMAIL` is set. |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Yes** | Auth domain (e.g. `your-project.firebaseapp.com`). |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Yes** | Firebase project ID (same as Firestore). |

**Required when using admin sign-in (when `ADMIN_EMAIL` is set).

See `.env.example` for a template.

## Production deployment (Netlify / Vercel / etc.)

For **Book now** and experiences to work in production, the server must have Firebase Admin credentials. If they are missing, `/api/experiences` returns 500 and the booking modal shows “No experiences” or “Failed to load experiences.”

**Set these in your host’s environment** (e.g. Netlify → Site settings → Environment variables):

- `FIREBASE_PROJECT_ID` — your Firebase project ID
- `FIREBASE_CLIENT_EMAIL` — from the service account JSON (`client_email`)
- `FIREBASE_PRIVATE_KEY` — **must be the full private key on a single line.** Netlify (and most hosts) do not support multi-line env values. In the service account JSON, `private_key` is multiple lines. To use it in Netlify: open the key in a text editor, replace every actual newline with the two characters backslash + n (`\n`), so you get one long line (e.g. `-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n`). Paste that single line as the value of `FIREBASE_PRIVATE_KEY`. The app will turn `\n` back into newlines at runtime.

**Avoid** relying on `FIREBASE_SERVICE_ACCOUNT_JSON_PATH` in production unless the JSON file is committed or built into the app; most hosts don’t have your local file. Using the three variables above is the reliable approach. **Do not set FIREBASE_SERVICE_ACCOUNT_JSON_PATH in Netlify**—if set, the app tries to read that file at runtime and it does not exist in the deploy, so Firebase fails and the app returns 500.

Also set: `STRIPE_*`, `BREVO_*`, `APP_BASE_URL` (e.g. `https://yoursite.com`), and optionally `ADMIN_EMAIL` and `NEXT_PUBLIC_FIREBASE_*` for admin login. After saving, redeploy so the new env vars are applied.

## Admin sign-in (Firebase Auth)

- **Firebase Console:** Enable **Authentication** → **Sign-in method** → **Email/Password**. Create a user with the email you use for admin (e.g. `boatbrosll@gmail.com`) and set that user’s password. In **Project settings** → **General** → **Your apps**, add a Web app if needed and copy the **API key**, **Auth domain** (`your-project.firebaseapp.com`), and **Project ID** into `.env.local` as `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, and `NEXT_PUBLIC_FIREBASE_PROJECT_ID`.
- **Login:** Go to **[/admin/login](http://localhost:3000/admin/login)** and sign in with that email and password. The app uses Firebase Auth; on success it exchanges the ID token for a session cookie and redirects to `/admin`.
- **Protection:** When `ADMIN_EMAIL` is set, all routes under `/admin` (except `/admin/login`) require a valid Firebase session cookie. Only the user with that email can access admin.
- **Logout:** Use the **Sign out** button on the admin page, or call `POST /api/admin/logout` (clears the cookie and redirects to `/admin/login`).
- **Password not working / Forgot password:** Use **Forgot password?** on the login page to send a reset link to your admin email. The email must match `ADMIN_EMAIL` and the user must exist in Firebase Console → Authentication → Users. If you never set a password, add the user in Firebase Console (Authentication → Users → Add user) with the same email as `ADMIN_EMAIL` and set a password. Ensure **Email/Password** is enabled under Authentication → Sign-in method.
- **"Not authorized for admin":** You signed in with an email that does not match `ADMIN_EMAIL`. Sign in with the exact email configured as `ADMIN_EMAIL` in your environment.

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

The booking endpoints `POST /api/booking/create-hold` and `POST /api/booking/create-checkout-session-direct` are rate-limited to **30 requests per minute per client IP** (in-memory). If exceeded, the API returns `429 Too Many Requests` with a `Retry-After` header. For multi-instance deployments, replace the in-memory limiter in `lib/booking/rate-limit.ts` with Redis or similar.

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

- Create an API key in Brevo (SMTP & API → API Keys).
- Set `BREVO_API_KEY`. Optionally create a transactional template and set `BREVO_BOOKING_TEMPLATE_ID`, and a list for `BREVO_MARKETING_LIST_ID`.

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

## Security notes

- Stripe secret key and webhook secret, Brevo API key, and Firebase private key are server-only; never expose them to the client.
- Pricing is computed on the server in create-hold and create-checkout-session and rechecked in the webhook.
- Slot state changes (open → held → booked) use Firestore transactions.
- Webhook processing is idempotent (events stored in `stripeEvents`).
