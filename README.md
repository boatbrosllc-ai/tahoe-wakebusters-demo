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

- `app/layout.tsx` injects the GA4 `gtag/js` script and inline bootstrap when `getGaMeasurementId()` returns a valid ID.
- `lib/ga-measurement-id.ts` reads `NEXT_PUBLIC_GA_MEASUREMENT_ID`:
  - Unset: uses the default GA4 measurement ID (in both local dev and production).
  - Set to a valid GA4 measurement ID (`G-XXXXXXXXXX`): overrides the stream.
  - Set to `off` or `0` (or empty): disables GA injection (so analytics won’t fire).
  - Malformed values: are logged and treated as disabled.
- Production guard: `scripts/check-production-env.js` fails the check in production when `NEXT_PUBLIC_GA_MEASUREMENT_ID` is empty/disabled/malformed.

Page views are tracked on App Router navigation by `components/providers/GaPageViewTracker.tsx` (it sends `page_view` updates only when `window.gtag` is available, and de-dupes the initial render).

### Conversion events

- `book_cta_click` – source, page, experience
- `call_click` – source, page
- `lead_submit` – source, page
- `contact_submit` – source

Implementation: `lib/analytics.ts` logs via `window.gtag('event', ...)` when GA is loaded, and also pushes the same payload to `window.dataLayer` for inspection/debugging.

### Verification checklist

Production
- Run `node scripts/check-production-env.js` and confirm it passes.
- Confirm GA injection is not being skipped in server logs.
- Navigate between routes and confirm GA4 `page_view` updates on client-side transitions.
- Click-to-call and booking CTAs should emit `call_click` / `book_cta_click` events with the expected `source` and `page`.

Local
- For GA testing: leave `NEXT_PUBLIC_GA_MEASUREMENT_ID` unset (uses the default) or set it to another valid `G-XXXXXXXXXX` ID.
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
