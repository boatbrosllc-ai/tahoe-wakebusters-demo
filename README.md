# Boat Bros ATX – Marketing Website

Next.js 14 App Router marketing site for Boat Bros ATX: Lake Austin boat rentals. Built for high conversion (book now, click-to-call, lead capture) with a premium, mobile-first experience.

## Tech stack

- **Next.js 14+** (App Router), TypeScript
- **Tailwind CSS** + shadcn-style UI (Button, Card, Accordion)
- **Framer Motion** for subtle animations
- **next/image** for all images
- Content in `content/*.ts` (ready to swap to Sanity/Contentful later)
- Analytics: `lib/analytics.ts` (GA4 event logger; pushes to `dataLayer` and optionally calls Plausible)

## Install and run

```bash
# Install dependencies
npm install

# Development (with Turbopack when supported)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Booking system (cold start):** The booking calendar and checkout start with an empty Firestore. To enable them: set Firebase, Stripe, Brevo, and `APP_BASE_URL` in `.env.local`, then open **[http://localhost:3000/admin](http://localhost:3000/admin)** and click **Run setup**. See **`docs/BOOKING_SETUP.md`** for the full checklist.

**Firestore indexes (blocks + booking):** Before exercising create-hold or availability locally, deploy composite indexes from **`firestore.indexes.json`** to your project or emulator (e.g. `firebase deploy --only firestore:indexes`, or start the emulator with an import that already includes index definitions). If the `blocks` composite index is missing, block checks return **503** until indexes are **READY** in the Firebase Console—this is intentional so enforcement is never skipped.

### Build (production)

```bash
npm run build
npm start
```

**Note:** Build ID is set in `next.config.js` via `generateBuildId` (uses `BUILD_ID` env var if set, otherwise a timestamp). Set `BUILD_ID` in CI for reproducible cache keys (e.g. `${{ github.sha }}`).

## Configuration (single place)

Edit **`config/site.ts`** for:

- **Phone number** – `phone`, `phoneTel`, `sms`
- **Booking** – `booking.mode` (`"embed"` | `"link"`), `booking.providerUrl`, `booking.embedSrc`
- **Brand colors** – reference only (CSS variables live in `app/globals.css`)

Edit **`app/globals.css`** for:

- **Brand palette** – `--brand-primary`, `--brand-secondary`, `--brand-accent`, `--brand-bg`

Edit **`content/brand.ts`** for:

- Logo path, company name, tagline, address, socials

## Routes

| Route | Description |
|-------|-------------|
| `/` | Home (hero, experience chooser, how it works, testimonials, gallery, lead capture) |
| `/book` | Booking funnel (experience selection + embed or link to provider) |
| `/experiences` | Grid of experience packages |
| `/experiences/[slug]` | Experience detail (Firestore: pontoon, watersports, sunset, holiday) — hero, content, sticky booking card |
| `/experiences/pontoon` | Lake Austin Pontoon Charter |
| `/experiences/watersports` | Lake Austin WaterSports Charter |
| `/experiences/sunset` | Lake Austin Sunset Cruise |
| `/experiences/holiday` | Lake Austin Holiday Boat Tour (seasonal) |
| `/booking` | Legacy booking calendar (boats) |
| `/booking/success` | Post-Stripe success; shows receipt from `?session_id=` |
| `/booking/cancel` | Checkout cancelled; slot released |
| `/faqs` | FAQs (with FAQPage JSON-LD) |
| `/our-story` | About |
| `/contact` | Contact (map link, form → `POST /api/contact`) |
| `/blog` | Blog index |
| `/blog/[slug]` | Blog post (stub; body from CMS/MDX later) |

## Key components

- **Header** – Logo, desktop nav, phone button, mobile hamburger
- **MobileStickyBar** – Call + Book Now (sticky bottom on mobile)
- **Hero** – Headline, bullets, primary CTA (Check Availability), secondary (Call), trust row
- **ExperienceChooser** / **ExperienceCard** – Experience cards with CTAs
- **BookingCTA** – Reusable CTA that logs `book_cta_click` / `call_click` via `lib/analytics.ts`
- **BookingEmbed** – Renders iframe (when `booking.mode === "embed"`) or deep link (when `"link"`)
- **LeadCapture** – Email form → `POST /api/lead`
- **Footer** – Address, hours, phone, email, socials, legal

## APIs

- **`POST /api/lead`** – Body: `{ email, source }`. Persists to Firestore `leads` when configured and/or sends to business email via Brevo.
- **`POST /api/contact`** – Body: `{ name, email, message }`. Logs to console; TODO: DB/email/CRM.
- **Custom booking engine** – See **Environment variables** below and **`docs/BOOKING_SETUP.md`**. Routes: `/api/booking/*`, `/api/experiences`, `/api/experiences/[slug]`, `/api/stripe/webhook`. Frontend: `/booking`, `/booking/success`, `/booking/cancel`, `/experiences/pontoon`, etc.

### Environment variables (booking + experiences)

Create **`.env.local`** (see **`.env.example`**):

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREBASE_SERVICE_ACCOUNT_JSON_PATH` | Yes* | Path to Firebase service account JSON (e.g. `./boat-bros-service-account.json`) |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Yes* | Alternative to JSON path (use one or the other) |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook signing secret (from Stripe CLI or Dashboard) |
| `BREVO_API_KEY` | Yes | Brevo API key for transactional email |
| `BREVO_BOOKING_TEMPLATE_ID` | No | Brevo template ID for booking confirmation (or inline HTML) |
| `BREVO_MARKETING_LIST_ID` | No | Brevo list ID for marketing opt-in |
| `APP_BASE_URL` | Yes | Base URL (e.g. `http://localhost:3000`) |
| `SEED_SECRET` / `CRON_SECRET` | No | Optional; protect seed and cleanup-holds with `Authorization: Bearer <secret>` |
| `ADMIN_EDGE_SECRET` | Yes (production) | Required in production. HMAC secret for admin Edge/middleware guard; when unset, admin paths return 503. Set in Netlify. See `docs/BOOKING_SETUP.md`. |

**Local dev – Stripe webhooks:** Forward events to your app:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Use the printed webhook signing secret as `STRIPE_WEBHOOK_SECRET` in `.env.local`. Then trigger a test payment; `checkout.session.completed` will finalize the booking and send the Brevo confirmation email.

**Seed experiences (4 listings + 60 days of slots):** use the admin dashboard **Seed** action (signed in at `/admin`), or `POST /api/admin/seed/experiences` with an admin session cookie. Public Bearer-only seed URLs were removed.

Then open `/experiences/pontoon`, `/experiences/watersports`, `/experiences/sunset`, `/experiences/holiday`.

## Analytics events

### GA4 bootstrap (page views + stream selection)

- `app/layout.tsx` injects GA4 using Google’s two-tag pattern: native `<script async src="…gtag/js?id=…">` plus a nonce’d inline `dataLayer` / `gtag('config')` (works cleanly with CSP `strict-dynamic`).
- `lib/ga-measurement-id.ts` reads `NEXT_PUBLIC_GA_MEASUREMENT_ID`:
  - **Production** (`NODE_ENV=production`): the variable must be set to a valid Google tag ID. Accepted families are `G-`, `GT-`, `AW-`, `DC-` with alphanumeric suffix. There is no hardcoded fallback; unset, empty, `off`/`0`, or malformed values disable GA and fail deploy checks.
  - **Do not quote the value** in Netlify or other hosts (use `G-...`, not `"G-..."`). Accidental surrounding `'` or `"` layers are stripped before validation so a valid ID is not disabled by host UI quoting mistakes.
  - **Local development**: when unset, a dev fallback `G-...` ID is used so you can verify Realtime/DebugView without editing env; set a specific tag ID to target another stream.
  - Set to `off` or `0` (or empty): disables GA injection (intended for local use).
  - Malformed values: logged and treated as disabled.
- Production guard: Netlify production builds run `scripts/check-production-env.js --ga-only` before `next build` (GA ID only; see `netlify.toml`). The deploy health plugin fails production deploys when `/api/health` reports `ga4.enabled !== true`, and runs a browser synthetic smoke test that requires: GA loader present, one successful analytics request on initial load, and one successful request after client-side navigation. Run the full script without `--ga-only` locally or in CI for a complete env audit.
- Optional hard fallback (recommended when some clients block `gtag/js`): set `GA4_MEASUREMENT_PROTOCOL_API_SECRET` in host env. Then client events/page views that cannot use `window.gtag` are forwarded through `/api/analytics/collect` to GA4 Measurement Protocol.

Page views are tracked on App Router navigation by `components/providers/GaPageViewTracker.tsx` (it de-dupes the automatic first `page_view` from `gtag('config', ...)`, and retries client navigations until `window.gtag` is available so early navigations are not dropped).

### Conversion events

- `book_cta_click` – source, page, experience
- `call_click` – source, page
- `lead_submit` – source, page
- `contact_submit` – source

Implementation: `lib/analytics.ts` logs via `window.gtag('event', ...)` when GA is loaded, and also pushes the same payload to `window.dataLayer` for inspection/debugging.

### Google Ads — contact conversion

**Recommended:** In Google Ads, open **Goals → Conversions →** your contact action **→ Tag setup**, use the **Event snippet**, and copy the full **`send_to`** value (format **`AW-123456789/YourLabel`**). Set **`NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_SEND_TO`** to that string. A successful **`/contact`** submit then runs **`gtag('event', 'conversion', { send_to: '…' })`**, which matches Google’s documented pattern.

**Optional:** Set **`NEXT_PUBLIC_GOOGLE_ADS_ID=AW-…`** only if your Google tag setup also asks for **`gtag('config', 'AW-…')`** after GA4 (`app/layout.tsx` wires that).

**Alternate:** If Google’s UI only gives a **named** conversion event (no `send_to` in the snippet you use), set **`NEXT_PUBLIC_GOOGLE_ADS_ID`** and optionally **`NEXT_PUBLIC_GOOGLE_ADS_CONTACT_EVENT`** (default **`ads_conversion_Contact_Us_1`**).

Without **`NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_SEND_TO`** or **`NEXT_PUBLIC_GOOGLE_ADS_ID`**, only GA4 + **`contact_submit`** run. Rebuild after changing any **`NEXT_PUBLIC_*`** variable. Details: **`lib/google-ads-id.ts`**.

### If GA4 says “Data collection isn’t active” / “No data received”

That banner is GA’s way of saying it has **not seen hits on this stream yet** (or not in 48+ hours). Your stream details (**Measurement ID** `G-…`) must match `GET /api/health` → `ga4.measurementId`. After deploy, use **Chrome with extensions off** (or Tag Assistant) and confirm **Network** requests to `google-analytics.com` / `googletagmanager.com` (e.g. `collect` / `g/collect`) return **200/204**. In **Admin → Data streams → your web stream → Configure tag settings**, ensure nothing is pausing the tag. Internal-traffic **data filters** can hide you from Realtime even when data arrives.

### If GA4 Realtime shows zero (but you are on the site)

The integration can be correct and you still see **no users** in Realtime. Check these in order:

1. **Same property as your stream** — Open `https://YOUR-DOMAIN/api/health` and read `ga4.measurementId`. In GA4, **Admin → Data streams → your Web stream** must show that **exact** Measurement ID. If you are in a different GA4 property (or an old Universal Analytics view), Realtime will stay empty even though the site is firing tags.
2. **Ad blockers and strict browsers** — uBlock, Privacy Badger, Brave Shields, Firefox Strict ETP, and some VPNs block `googletagmanager.com` / `google-analytics.com`. Test in a **fresh Chrome incognito** window with extensions disabled, or another device.
3. **Internal traffic filter** — **Admin → Data settings → Data filters**: an active “Internal traffic” filter can remove your office/home IP from reports (including Realtime).
4. **Network proof** — DevTools → **Network**, filter `collect` or `google-analytics`. Successful sends usually show `204` or `200` on `google-analytics.com` / `analytics.google.com`. If there are **no** requests, the tag is not firing or is blocked. If requests succeed but Realtime is empty, you are almost certainly in the **wrong GA4 property** or **filtered**.
5. **DebugView** — Set `NEXT_PUBLIC_GA_DEBUG=1` in Netlify (rebuild), then in GA4 open **Admin → DebugView** while you browse. Debug hits appear there even when Realtime is slow or confusing. Remove the var after testing.

**Operator workflow (no hits / unclear if GA is working):**

1. **`/api/health`** — Confirm `ga4.enabled` is `true` and `ga4.measurementId` matches the stream you expect. This reflects server-side env and build config only; it does not prove the browser sent hits.
2. **Network** — In DevTools, confirm `gtag/js` (or `gtm.js` if applicable) loads without errors, then filter for `collect` or `google-analytics` and verify requests on load and on client navigations.
3. **GA4 property and filters** — In **Admin → Data streams**, match the measurement ID to your property; check **Data settings → Data filters** (e.g. internal traffic) so you are not excluding the traffic you are testing.

### Verification checklist

Production
- Run `NODE_ENV=production node scripts/check-production-env.js` (full audit) before releases; Netlify runs `--ga-only` at build plus the post-deploy health check.
- Set `NEXT_PUBLIC_GA_MEASUREMENT_ID` to your live GA4 web stream ID on the host; do not rely on an implicit default.
- Netlify production deploys block promotion if browser synthetic smoke cannot observe successful analytics requests on initial load and SPA navigation.
- Confirm GA injection is not being skipped in server logs and `/api/health` shows `ga4.enabled: true`.
- Navigate between routes and confirm GA4 `page_view` updates on client-side transitions.
- Click-to-call and booking CTAs should emit `call_click` / `book_cta_click` events with the expected `source` and `page`.

Local
- For GA testing without setting env: leave `NEXT_PUBLIC_GA_MEASUREMENT_ID` unset (uses the dev fallback stream) or set another valid `G-XXXXXXXXXX` ID.
- To avoid polluting GA: set `NEXT_PUBLIC_GA_MEASUREMENT_ID=off` (or `0`).
- Confirm `page_view` fires when navigating between routes.

## Content and CMS

- **Today:** `content/brand.ts`, `content/experiences.ts`, `content/testimonials.ts`, `content/faqs.ts`, `content/blog.ts`.
- **Later:** Swap to Sanity, Contentful, or MDX; components consume the same shape so UI stays unchanged.

## SEO and local

- Per-page metadata (title, description, Open Graph).
- JSON-LD: `LocalBusiness` in `(site)/layout.tsx`, `FAQPage` on `/faqs`.
- Location-oriented copy: Austin, TX / Lake Austin boat rentals.

## Brand assets

- Logo: **`/public/brand/logo.svg`** (or `logo.png`). Replace with your asset; path is in `content/brand.ts`.

## Quality

- Accessibility: contrast, focus states, keyboard nav.
- Mobile-first, thumb-friendly nav and sticky bar.
- No lorem ipsum; real-sounding marketing copy and placeholders where needed.
