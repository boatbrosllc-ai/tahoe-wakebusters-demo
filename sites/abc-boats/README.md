# ABC Boats (fake customer)

Frontend and branding for the **ABC Boats** proof-of-architecture site.

| Path | What to edit |
|------|----------------|
| `config.ts` | Company name, colors, logos, contact, feature flags |
| `pages/home.tsx` | Homepage layout and section order |
| `pages/about.tsx` | Custom marketing page (`/about`) |
| `components/` | Header, hero, cards, CTA band |
| `styles/theme.css` | ABC-only CSS (scoped with `[data-site="abc-boats"]`) |
| `public/sites/abc-boats/` | Logo SVGs |

Shared booking/checkout: import `BookingWidget` from `@/components/site/BookingWidget` (opens the shared booking modal). Do not copy `lib/booking` or payment code into this folder.

## Redesign only ABC Boats

Tell Cursor:

> Only modify ABC Boats' customer site under `sites/abc-boats/` and `public/sites/abc-boats/`. Do not modify shared Slipstack platform functionality.

Activate locally with `SLIPSTACK_SITE_ID=abc-boats` in `.env.local`, then restart `npm run dev`.
