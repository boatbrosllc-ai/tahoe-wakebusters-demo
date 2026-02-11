/**
 * Server-side pricing: rate + addons + tax/fees.
 * All amounts in cents.
 * Rate may be Boat Rate (basePriceCents) or Experience Rate (priceCents).
 */

import type { Rate, Addon, AddonSelection, BookingPricing } from "./types";
import type { ExperienceAddon } from "./types";

const TAX_RATE = 0.0825; // 8.25% example; adjust per jurisdiction
const FEE_CENTS = 0; // optional booking fee

type RateLike = { basePriceCents?: number; priceCents?: number };
type AddonLike = Addon | ExperienceAddon;

export function computePricing(params: {
  rate: Rate | RateLike;
  addons: { addon: AddonLike; qty: number }[];
  currency?: string;
}): BookingPricing {
  const { rate, addons, currency = "usd" } = params;
  const baseCents = "basePriceCents" in rate && rate.basePriceCents != null ? rate.basePriceCents : (rate as RateLike).priceCents ?? 0;
  let subtotalCents = baseCents;
  for (const { addon, qty } of addons) {
    subtotalCents += addon.priceCents * qty;
  }
  const taxCents = Math.round(subtotalCents * TAX_RATE);
  const feesCents = FEE_CENTS;
  const totalCents = subtotalCents + taxCents + feesCents;
  return {
    subtotalCents,
    taxCents,
    feesCents,
    totalCents,
    currency,
  };
}

export function buildAddonSelectionsForPricing(
  addonSelections: { addonId: string; qty: number }[],
  addonsById: Map<string, Addon | ExperienceAddon>
): { addon: AddonLike; qty: number }[] {
  return addonSelections
    .filter((s) => s.qty > 0)
    .map((s) => {
      const addon = addonsById.get(s.addonId);
      if (!addon || !addon.active) return null;
      return { addon, qty: s.qty };
    })
    .filter((x): x is { addon: AddonLike; qty: number } => x != null);
}
