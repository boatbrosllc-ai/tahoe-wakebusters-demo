# Slipstack plans (Lite vs Full)

One master `slipstack-platform` repo powers both products. Each customer fork sets:

```ts
// config/site.ts
plan: "lite" | "full",
features: { /* resolved flags */ }
```

## Defaults

| Situation | Behavior |
|-----------|----------|
| `plan` omitted (legacy forks) | Treated as **`full`** — all premium modules stay available |
| New Lite provision | Slipstack.io sends `"plan": "lite"` in the launch packet |
| New Full provision | `"plan": "full"` (or omit; same result) |

## How gating works

- Central entitlements: `lib/plan/entitlements.ts` (`PLAN_FEATURE_DEFAULTS`)
- Runtime checks: `hasFeature("waivers")` (never scatter `if (plan === "lite")`)
- API protection: `requireFeatureResponse("waivers")` → HTTP 403
- Admin UI: nav filtered + `PlanFeatureGate` on premium sections
- Money-path tools stay on Lite: `discounts`, `pricingCalendar`
- Add-ons later: launch packet `featureOverrides: { smsReminders: true }` on a Lite plan

## Upgrade Lite → Full

1. Slipstack.io updates the customer plan to `full`
2. Re-import launch packet (or set `plan: "full"` in `config/site.ts` and re-resolve features)
3. Redeploy
4. Premium admin/APIs unlock; existing bookings, boats, and branding stay intact

## Launch packet fields

```json
{
  "plan": "lite",
  "featureOverrides": {
    "smsReminders": true
  }
}
```

`features` (legacy 4-key object) is still accepted and merged; `featureOverrides` wins on conflicts.
