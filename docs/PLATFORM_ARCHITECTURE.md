# Slipstack Platform Architecture

This repository is the **master template** for Slipstack boat-rental customer sites: one codebase per customer deployment, not a multi-tenant switcher inside one production app.

Model:

> Shared booking engine + one customer's branding, config, and marketing pages in the same repo.

## What belongs in shared/core code

Reusable product functionality:

- Booking engine (holds, slots, availability, deposits, final charges)
- Checkout and Stripe payment flows
- Waivers
- Authentication and admin/dashboard
- Customer, boat, and experience management
- Notifications (email/SMS plumbing)
- Shared UI primitives (`components/ui/`, booking modal, widgets)
- APIs and backend logic under `lib/booking/`, `app/api/`

Do not hardcode a customer's legal name, logo, phone, or API keys here. Read identity from `siteConfig` (`config/site.ts`) and secrets from environment variables.

## Customer configuration (one deployment)

Each customer clone edits:

```text
config/site.ts          company, branding, theme, tax, timezone, deposit, cancellation
public/brand/           logos and favicon
content/launch-boat.ts  seed boat placeholder
content/catalog-pricing.ts
content/bundle-presets.ts
app/(site)/             marketing pages (homepage is app/(site)/page.tsx)
```

`content/brand.ts` and `content/location.ts` are adapters derived from `siteConfig`.

Theme CSS variables are applied on `<html>` from `siteConfig.theme` (`siteThemeCssVars()`).

## Fork-per-customer (not multi-site switching)

Do **not** use `SLIPSTACK_SITE_ID`, `sites/abc-boats/`, or a runtime site registry in production.

Each real customer gets:

- Their own GitHub repo (cloned from this template)
- Their own Netlify site
- Their own Firebase project, Stripe account, and domain
- Their own filled-in `config/site.ts` and env vars

Engine updates merge from master into customer repos without overwriting their homepage and brand config.

## Environment variables

See `.env.example`. Production requires:

- `APP_BASE_URL` or `NEXT_PUBLIC_SITE_URL` (real domain, not `example.com`)
- Firebase Admin + web config
- Stripe secret + webhook + publishable key
- Brevo, Redis (Upstash), cron/admin secrets

`config/assert-production-config.ts` refuses deployed production when `config/site.ts` still has template placeholder identity.

## Firebase

Nothing in marketing pages selects a Firebase project. The deployment's service account and `NEXT_PUBLIC_FIREBASE_*` vars determine the database.

## Seed data

`lib/booking/seed-experiences.ts` and `content/launch-boat.ts` ship generic placeholders for the unforked template.

For a real customer, import the Slipstack.io launch packet:

```bash
npm run import:launch-packet -- path/to/launch-packet.json
```

See [LAUNCH_PACKET.md](./LAUNCH_PACKET.md).

## Stable Firestore experience slugs

| Firestore slug | Role |
|----------------|------|
| `pontoon` | Half Day inventory document |
| `watersports` | Full Day inventory document |

Public URLs are `/experiences/half-day` and `/experiences/full-day`. Do not rename Firestore slugs without a migration.

## Customizing a customer clone

Safe to change in the customer repo:

- `config/site.ts`, logos, homepage sections, inquiry packages, blog posts
- Customer-specific SEO routes under `app/(site)/` (not included in the master template)

Do not copy booking/payment/waiver logic out of `lib/booking/` or `app/api/`.

## What should NOT happen

- Hardcode customer names, domains, or Cabo/Nasty-specific marketing in shared engine code
- Assume one Firebase or Stripe account for all customers
- Reintroduce `SITE_IDS` / `sites/<id>` runtime switching as the shipping model
- Silently fall back to `example.com` or placeholder company in production
