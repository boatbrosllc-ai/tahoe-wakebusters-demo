# Customer sites

Each folder in `sites/` is one customer's **frontend and branding**.

```text
sites/
  platform-dev/     default / neutral Slipstack demo
  abc-boats/        fake customer used to prove unique design
```

The shared engine (booking, payments, waivers, auth, admin, APIs) stays in `lib/`, `app/api/`, and `components/` — never copy it into a customer folder.

## How the active site is chosen

Development (this phase):

```env
SLIPSTACK_SITE_ID=abc-boats
```

`NEXT_PUBLIC_SLIPSTACK_SITE_ID` is also accepted. Restart the Next.js dev server after changing it.

Domain-based tenant routing is **not** implemented yet. Each production customer will be a separate deployment of this same repository, with its own env (including its own Firebase project).

## Adding a customer

1. Copy the idea of `sites/abc-boats/` — config, pages, components, styles.
2. Register the id in `config/site-types.ts` (`SITE_IDS`) and `config/resolve-site.ts` (`SITE_REGISTRY`).
3. Add frontend overrides in `lib/site/pages.ts` and `lib/site/chrome.ts`.
4. Put public assets in `public/sites/<id>/`.
5. Set `SLIPSTACK_SITE_ID=<id>` for that deployment.

## Cursor instruction for a redesign

> Only modify `sites/abc-boats/` and `public/sites/abc-boats/`. Do not change shared Slipstack platform functionality (`lib/booking`, `app/api`, `components/site` except when adding a reusable primitive).

## Firebase

Customer folders do **not** select a database. Firebase project IDs stay in environment variables for that deployment. Later, ABC Boats production can point at an ABC Boats Firebase project while still using this repo.
