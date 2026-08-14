# Slipstack Platform Architecture

This repository is the shared **Slipstack** boat-rental platform: one codebase that powers many boat-rental companies.

Model:

> Shared software engine + custom customer website/design.

It is not a generic SaaS where every site looks the same. Each customer can have unique branding, homepage, navigation, and marketing components, while still using the shared booking/payment/admin engine.

## What belongs in shared/core code

Reusable product functionality used across customers:

- Booking engine (holds, slots, availability, deposits, final charges)
- Checkout and Stripe payment flows
- Waivers
- Authentication and admin/dashboard
- Customer, boat, and experience management
- Notifications (email/SMS plumbing)
- Shared UI primitives and utilities (`components/ui/`, `components/site/BookingModal`, `BookingWidget`)
- APIs and backend logic under `lib/booking/`, `app/api/`

Do not put a customer’s legal name, logo, phone number, or API keys in these modules. Read identity from `siteConfig` (resolved from `sites/<id>/config.ts`) and secrets from environment variables.

Changes here may affect **every** Slipstack customer.

## What belongs in a customer site

Each customer gets a folder under `sites/`:

```text
sites/
  platform-dev/          default / neutral demo
  abc-boats/             fake customer (proof of unique frontend)
    config.ts
    pages/               home, about, …
    components/          header, hero, cards, …
    styles/
```

Public assets: `public/sites/<id>/`.

That folder is what a Slipstack developer opens in Cursor to redesign **only** that customer. Unique homepage, nav, typography, card styles, animations, and marketing pages belong there.

Customer sites consume shared features, for example:

```tsx
import { BookingWidget } from "@/components/site/BookingWidget";
```

Do **not** copy booking, payment, waiver, or auth logic into `sites/`.

### Configuration

`config/site.ts` still exports `siteConfig` for the rest of the app. It resolves the active customer from `SLIPSTACK_SITE_ID` via `config/resolve-site.ts`.

`content/brand.ts` and `content/location.ts` remain adapters derived from `siteConfig`.

Theme CSS variables are applied on `<html>` from `siteConfig.theme` (`siteThemeCssVars()`). Customer CSS can add extra rules scoped with `[data-site="<id>"]`.

## How the active site is chosen (development)

```env
SLIPSTACK_SITE_ID=abc-boats
```

`NEXT_PUBLIC_SLIPSTACK_SITE_ID` is also accepted. Restart the Next.js server after changing it.

This is **not** production multi-tenancy. There is no domain-based tenant router yet. The intended production shape is: one deployment per customer, same GitHub repo, that deployment’s env selects the site **and** that customer’s Firebase/Stripe accounts.

## What belongs in environment variables

Credentials and deployment-specific infrastructure — see `.env.example`.

**Public / browser** (`NEXT_PUBLIC_*`, plus `APP_BASE_URL` / `NEXT_PUBLIC_SITE_URL`):

- Site URL
- Firebase web app config
- Stripe publishable key
- Analytics IDs
- `SLIPSTACK_SITE_ID` / `NEXT_PUBLIC_SLIPSTACK_SITE_ID`

**Private / server-only:**

- Firebase Admin / service account
- Stripe secret key and webhook secret
- Brevo, Twilio, Upstash
- HMAC/cron/admin secrets
- Contact and staff inboxes (when not using the config fallback)

Never commit real credentials. Never put server secrets in client components.

## Databases (future)

Nothing in `sites/` selects a Firebase project. The app uses whatever `FIREBASE_PROJECT_ID` / service account the **deployment** provides.

Today local/dev uses the current development Firebase project via `.env.local`.

Later:

```text
ABC Boats deployment     → ABC Boats Firebase
Sunset Rentals deployment → Sunset Rentals Firebase
```

both built from this repository. Do not hardcode a single Firebase project into shared source as a permanent assumption.

## Manual onboarding / design workflow (not automated yet)

```text
Customer purchases Slipstack
  → self-onboarding (company, logo, boats, payments, domain)
  → status: READY FOR DESIGN
  → Slipstack developer customizes sites/<customer-id>/ in Cursor
  → review and launch
```

Per-customer Firebase **create** is not implemented yet. Keyless **auth** for the org provisioner is:

`Netlify (HMAC) → Cloud Run worker (ADC as slipstack-provisioner) → Google APIs`

See `docs/PROVISIONING_AUTH.md`. Do not put a Google service-account JSON key in Netlify.

## What should NOT happen

Developers should not hardcode customer names, logos, phone numbers, API credentials, or customer-specific fallback domains into shared components.

Do not assume a single Firebase project, Stripe account, or domain. Those are per-deployment env values.

Do not rename Firestore experience slugs (`pontoon` / `watersports`) — bookings and boats reference them. Public titles and URLs can change; document IDs cannot without a migration.

Do not build a page builder, CMS, or plugin system to make sites unique — unique React/CSS in `sites/<id>/` is the mechanism.

## Cursor instruction

> Only modify ABC Boats' customer site (`sites/abc-boats/` and `public/sites/abc-boats/`). Do not modify shared Slipstack platform functionality.
