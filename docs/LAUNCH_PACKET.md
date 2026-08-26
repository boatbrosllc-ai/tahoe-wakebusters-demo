# Launch packet import (Slipstack.io → Platform)

Slipstack.io produces a **`CustomerPlatformConfig`** JSON launch packet. This repo imports it to configure the customer fork and seed Firebase.

**Secrets are not in the packet.** Stripe, Firebase credentials, email API keys, and public URLs (`NEXT_PUBLIC_SITE_URL`) are set via environment variables on the deployment.

## Import command

From the customer repo root (with `.env.local` Firebase credentials loaded):

```bash
npm run import:launch-packet -- path/to/launch-packet.json
```

Options (pass after the JSON path):

| Flag | Effect |
|------|--------|
| `--dry-run` | Validate only — no file writes, no Firebase |
| `--files-only` | Write `config/site.ts` + `content/*` only |
| `--firebase-only` | Seed Firestore only (skip file writes) |

Example dry run against the repo fixture:

```bash
npm run import:launch-packet -- lib/launch/__fixtures__/sample-launch-packet.json --dry-run
```

## What the importer does

1. **Validate** the packet (`lib/launch/customer-platform-config.schema.ts`) — fails with field paths on missing/invalid data
2. **Write config files**
   - `config/site.ts` — company, contact, branding, booking policies, timezone, tax
   - `content/catalog-pricing.ts` — marketing/seed rate cents
   - `content/upsells.ts` — add-on catalog
   - `content/launch-boat.ts` — primary boat metadata (first boat in packet)
   - `config/launch-packet.json` — archived copy of the imported packet
3. **Seed Firestore** (idempotent)
   - `experiences` + `rates` + `addons` from packet trips (not template placeholders)
   - `boats` linked to experience IDs by slug
   - `waiverTemplates` from packet waiver settings
   - `blocks` for blackout dates (deterministic doc IDs)
   - `settings/customerLaunch` — operating hours, season, fuel/gratuity, minimum notice, turnaround

## Launch packet fields → runtime behavior

| Packet area | Written to | Used live by |
|-------------|------------|--------------|
| Company, contact, branding, domain | `config/site.ts` | Site chrome, emails, SEO, legal |
| Timezone | `config/site.ts` | Slots, crons, calendars, waiver dates |
| Tax rate | `config/site.ts` (`business.taxRate`, default 0) | Checkout pricing (`TAX_RATE`) |
| Deposit fraction | `config/site.ts` | Holds, Stripe deposit math |
| Minimum notice hours | `config/site.ts` | Deposit eligibility, final charge cron |
| Operating hours | `config/site.ts` + Firestore settings | Slot grid start/end hours |
| Cancellation policy | `config/site.ts` + experience docs | Checkout copy, experience pages |
| Season | Experience `seasonal` + settings doc | `isSeasonalAllowed` on slot API |
| Blackout dates | Firestore `blocks` | Hold creation block checks |
| Boats / trips / rates / add-ons | Firestore | Booking modal, checkout, admin |
| Waiver | Firestore `waiverTemplates` | Signing wizard, age rules |
| Fuel / gratuity | Settings doc + add-ons catalog | Gratuity as tip add-on when in packet; fuel label stored for future |
| Turnaround minutes | `config/site.ts` + settings doc | Slot conflict buffer via `intervalsConflictWithTurnaround` |
| Slot selection | `booking.slotSelectionMode` | `hourly` (default) vs legacy `fixed-windows` |
| **Plan** | `plan` → `config/site.ts` | `lite` / `full` feature gating (`docs/PLANS.md`) |
| Feature overrides | `featureOverrides` / `features` | Merged into `siteConfig.features` |

Re-running import **updates** matched Firestore docs from the packet and may overwrite prior admin edits to those fields. Use `--files-only` after go-live if you only need config refresh.

## Tax rate (temporary)

Slipstack.io does not collect sales tax yet. If `taxRate` is omitted, import uses **`0`** and prints a warning. Set `taxRate` in the packet when onboarding adds the field, or edit `config/site.ts` after import.

## Programmatic API

```typescript
import { importLaunchPacket } from "@/lib/launch";

const result = await importLaunchPacket(packetJson, {
  dryRun: false,
  writeFiles: true,
  seedFirebase: true,
});
```

## Slipstack.io integration (future)

After infra provisioning, Slipstack.io can fork this repo and run:

```bash
# In the customer repo CI or post-provision hook
npm ci
npm run import:launch-packet -- /tmp/customer-launch-packet.json
npm run build
```

Or call the same `importLaunchPacket()` from a provisioning worker once Firebase credentials are injected into the environment.

## Not included yet

- GitHub repo creation / Netlify site provisioning
- Domain DNS automation
- Brand asset binary upload (packet uses paths/URLs; copy files to `public/` separately)
- Engine enforcement of `turnaroundMinutes` (stored in `settings/customerLaunch` for now)
- Fixed-window departure times from launch packet (use `slotSelectionMode: "fixed-windows"` only with manually tuned `content/charter-windows.ts`)
