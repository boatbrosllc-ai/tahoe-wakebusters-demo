# Boat Bros ATX – Marketing Website

Next.js 14 App Router marketing site for Boat Bros ATX: Lake Travis boat rentals. Built for high conversion (book now, click-to-call, lead capture) with a premium, mobile-first experience.

## Tech stack

- **Next.js 14+** (App Router), TypeScript
- **Tailwind CSS** + shadcn-style UI (Button, Card, Accordion)
- **Framer Motion** for subtle animations
- **next/image** for all images
- Content in `content/*.ts` (ready to swap to Sanity/Contentful later)
- Analytics: `lib/analytics.ts` (event logger abstraction; plug in GA4/GTM/Plausible later)

## Install and run

```bash
# Install dependencies
npm install

# Development (with Turbopack when supported)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build (production)

```bash
npm run build
npm start
```

**Note:** If `npm run build` fails with `TypeError: generate is not a function` (Next.js `generateBuildId`), it can be due to the project path (e.g. spaces like "Boat Bros"). Workarounds: run the build from a path without spaces, or use `npm run dev` for local development. You can also set `BUILD_ID` in the environment and ensure `generateBuildId` in `next.config.js` is a function that returns a string.

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
| `/experiences/[slug]` | Experience detail (gallery, includes, pricing, FAQ, CTA) |
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

- **`POST /api/lead`** – Body: `{ email, source }`. Logs to console; TODO: DB/CRM.
- **`POST /api/contact`** – Body: `{ name, email, message }`. Logs to console; TODO: DB/email/CRM.

## Analytics events

- `book_cta_click` – source, page, experience
- `call_click` – source, page
- `lead_submit` – source, page
- `contact_submit` – source

Implementation: `lib/analytics.ts`. No vendor hardcoding; add `window.gtag` / `window.plausible` etc. in that file when ready.

## Content and CMS

- **Today:** `content/brand.ts`, `content/experiences.ts`, `content/testimonials.ts`, `content/faqs.ts`, `content/blog.ts`.
- **Later:** Swap to Sanity, Contentful, or MDX; components consume the same shape so UI stays unchanged.

## SEO and local

- Per-page metadata (title, description, Open Graph).
- JSON-LD: `LocalBusiness` in `(site)/layout.tsx`, `FAQPage` on `/faqs`.
- Location-oriented copy: Austin, TX / Lake Travis.

## Brand assets

- Logo: **`/public/brand/logo.svg`** (or `logo.png`). Replace with your asset; path is in `content/brand.ts`.

## Quality

- Accessibility: contrast, focus states, keyboard nav.
- Mobile-first, thumb-friendly nav and sticky bar.
- No lorem ipsum; real-sounding marketing copy and placeholders where needed.
