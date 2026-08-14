# Slipstack Platform

Master template for a single boat-rental customer deployment: Next.js 14 (App Router), booking, payments, waivers, and admin.

**One repo clone = one customer.** Edit `config/site.ts` for identity, tax, timezone, deposit rules, and cancellation policy. Secrets and Firebase/Stripe accounts live in environment variables (see `.env.example`).

## Tech stack

- **Next.js 14** (App Router), React 18, TypeScript
- **Firestore** + Firebase Auth (admin)
- **Stripe** (Payment Element, deposits, final balance)
- **Brevo** email · optional Twilio SMS
- **Tailwind CSS** · Framer Motion
- Hosted on **Netlify** (scheduled functions call `/api/admin/cron/*`)

## Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### First-time setup

1. Clone this repo into a **new GitHub repo** for the customer (do not share Firebase/Stripe between customers).
2. Copy `.env.example` → `.env.local` and fill Firebase, Stripe, Brevo, Redis, secrets.
3. Edit `config/site.ts` — company name, domain, contact, tax rate, timezone, cancellation policy.
4. Replace logos under `public/brand/`.
5. Deploy Firestore indexes: `firestore.indexes.json`
6. Admin → **Seed** experiences (`lib/booking/seed-experiences.ts`)
7. Admin → **Seed** boats (`content/launch-boat.ts`)
8. Assign the listing boat to experiences (`experienceIds`)

Production requires `APP_BASE_URL` or `NEXT_PUBLIC_SITE_URL` (not `example.com`) and a filled-in `config/site.ts` (see `config/assert-production-config.ts`).

## Experience IDs

| Firestore slug | Customer title | Public URL |
|----------------|----------------|------------|
| `pontoon` | Half Day (configurable) | `/experiences/half-day` |
| `watersports` | Full Day (configurable) | `/experiences/full-day` |

**Do not rename Firestore document slugs** without a migration — bookings and boats reference them. Legacy aliases (`nasty-half-day`, etc.) still redirect for old links.

## Configuration

| File | Purpose |
|------|---------|
| `config/site.ts` | Company, branding, theme, tax, timezone, deposit, cancellation |
| `content/brand.ts` | Adapter used by UI (derived from `siteConfig`) |
| `content/location.ts` | Location page (derived from `siteConfig`) |
| `content/catalog-pricing.ts` | Placeholder seed/display prices |
| `content/bundle-presets.ts` | Homepage package ladder |
| `lib/booking/constants.ts` | Tax/deposit reads from `siteConfig` |
| `docs/PLATFORM_ARCHITECTURE.md` | Engine vs customer customization |

## Important routes

| Route | Description |
|-------|-------------|
| `/` | Default homepage |
| `/experiences` | Charter list |
| `/experiences/half-day` | Half Day (alias of `pontoon`) |
| `/experiences/full-day` | Full Day (alias of `watersports`) |
| `/packages` | Multi-day inquiry packages |
| `/booking` | Booking calendar / modal flow |
| `/admin` | Operator dashboard |
| `/waiver/sign` | Guest waiver |

## Tests

```bash
npm run test:booking
npm run lint
npm run build
npm run check-env
```

## Production notes

- **Tax / deposit / cancellation:** owned in `config/site.ts` → `lib/booking/constants.ts` and `booking.cancellation`.
- **Timezone:** `siteConfig.business.timezone` → `BUSINESS_TIMEZONE` / slot math.
- **Template guard:** deployed production refuses placeholder `example.com` identity and missing public URL env vars.

See `docs/PLATFORM_ARCHITECTURE.md` for how to customize a customer clone without forking the engine.
