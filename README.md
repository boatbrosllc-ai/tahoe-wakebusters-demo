# Nasty Sport Fishing

Next.js 14 App Router site for **Nasty Sport Fishing** — Cabo San Lucas sport fishing charters with online booking.

This repository was originally cloned from Boat Bros ATX. Business-specific Austin content has been removed. Generic booking infrastructure (holds, Stripe, slots, deposits, final charges) is retained intentionally.

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

### Booking setup

1. Use a **Nasty Sport Fishing** Firebase project (not Boat Bros).
2. Copy `.env.example` → `.env.local` and fill Firebase, Stripe, Brevo, secrets.
3. Deploy Firestore indexes: `firestore.indexes.json`
4. Admin → **Seed** experiences (`lib/booking/seed-experiences.ts`)
5. Admin → **Seed** boats — creates the launch **Cabo 40 Express** (`content/launch-boat.ts`)
6. Assign that listing boat to both Half Day and Full Day (`experienceIds`)

See `.env.example` for variable names. Never commit service-account JSON.

## Stable experience IDs (intentional legacy)

| Firestore slug | Customer title | Public URL |
|----------------|----------------|------------|
| `pontoon` | Nasty Half Day | `/experiences/nasty-half-day` |
| `watersports` | Nasty Full Day | `/experiences/nasty-full-day` |

**Do not rename these Firestore IDs** — bookings and boats reference them. Use `lib/booking/experience-ids.ts` for semantic constants.

Sunset / Billfish specialty docs may exist inactive for history; core sellable products are Half Day and Full Day.

## Configuration

| File | Purpose |
|------|---------|
| `content/brand.ts` | Company name, logo, email, phone placeholders, Cabo address |
| `config/site.ts` | Phone / booking path / brand color refs |
| `content/location.ts` | Marina / map / location page body |
| `content/catalog-pricing.ts` | Founder/standard/peak display + seed prices |
| `content/bundle-presets.ts` | Nasty (Half) / Nastier (Full) / Nastiest (Full all-in) |
| `lib/booking/constants.ts` | Tax/fee rates (**Cabo decision still outstanding**) |

## Important routes

| Route | Description |
|-------|-------------|
| `/` | Home — bundles, charters, inquiry teaser |
| `/experiences` | Charter list |
| `/experiences/nasty-half-day` | Half Day (alias of `pontoon`) |
| `/experiences/nasty-full-day` | Full Day (alias of `watersports`) |
| `/packages` | Multi-day inquiry packages |
| `/booking` | Booking calendar / modal flow |
| `/admin` | Operator dashboard |
| `/waiver/sign` | Guest waiver |

## Tests

```bash
npm run test:booking
npm run lint
npm run build
```

## Production safety notes

- **Tax / fees:** `PROCESSING_FEE_RATE` is `0` (no customer surcharge; processing cost is in published rates). `TAX_RATE` is still legacy — decide Cabo IVA treatment before live paid traffic.
- **Timezone:** Operational boat/trip timezone is `America/Mazatlan` (`brand.timezone` → `BUSINESS_TIMEZONE` / `SLOT_TIMEZONE`).
- **Waiver legal:** Branding can say NSF; governing-law clauses may still mention Texas — legal review required before Mexico production.
- **No Boat Bros Firebase / Stripe / analytics IDs** should be hardcoded; use env vars for Nasty accounts.

## Docs

Legacy Boat Bros setup docs under `docs/` may still mention Austin domains — prefer this README and `.env.example` for NSF.
