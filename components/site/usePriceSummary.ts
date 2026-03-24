/**
 * Dedicated hook for booking modal price summary (rate + addons + tax + tip − discount).
 * Keeps BookingModal lean and allows reuse if needed.
 */
import { useMemo } from "react";
import { TAX_RATE, TIP_MAX_PERCENT_SERVER } from "@/lib/booking/constants";
import type { RateOption, AddonOption } from "@/lib/booking/booking-modal-types";

export interface PriceSummaryLine {
  name: string;
  qty: number;
  priceCents: number;
}

export interface PriceSummary {
  rateLabel: string;
  rateCents: number;
  addonLines: PriceSummaryLine[];
  /** Rate + add-ons before tax (for display of zero-tax / free tiers). */
  subtotalBeforeTaxCents: number;
  salesTaxCents: number;
  tipCents: number;
  discountCents: number;
  totalCents: number;
  /** True when the rate uses the cached base price because authoritative date pricing is not loaded yet. */
  priceIsEstimate: boolean;
}

export interface UsePriceSummaryArgs {
  isTicketed: boolean;
  partySize: number;
  effectiveRateCents: number | null | undefined;
  selectedRate: RateOption | null;
  displayAddons: AddonOption[];
  addonSelections: Record<string, number>;
  tipChoice: "now" | "later" | null;
  tipPercent: number;
  appliedDiscount: { discountCents: number; code: string } | null;
  /** True while `/api/booking/effective-price` is resolving (e.g. boat price override). */
  effectivePriceLoading?: boolean;
}

export function usePriceSummary({
  isTicketed,
  partySize,
  effectiveRateCents,
  selectedRate,
  displayAddons,
  addonSelections,
  tipChoice,
  tipPercent,
  appliedDiscount,
  effectivePriceLoading = false,
}: UsePriceSummaryArgs): PriceSummary {
  return useMemo(() => {
    const priceIsEstimate =
      (effectiveRateCents == null && selectedRate != null) || effectivePriceLoading;
    const unitCents = effectiveRateCents ?? selectedRate?.priceCents ?? 0;
    const ticketCount = isTicketed ? Math.max(1, Math.floor(Number(partySize))) : 1;
    const rateCents = isTicketed ? unitCents * ticketCount : unitCents;
    const addonLines = displayAddons
      .filter((a) => (addonSelections[a.id] ?? 0) > 0)
      .map((a) => ({
        name: a.name,
        qty: addonSelections[a.id] ?? 0,
        priceCents: a.priceCents * (addonSelections[a.id] ?? 0),
      }));
    const addonsTotalCents = addonLines.reduce((s, l) => s + l.priceCents, 0);
    const subtotalBeforeTax = rateCents + addonsTotalCents;
    const salesTaxCents = Math.round(subtotalBeforeTax * TAX_RATE);
    const subtotalAfterTax = subtotalBeforeTax + salesTaxCents;
    const pct = Math.min(TIP_MAX_PERCENT_SERVER, Math.max(20, tipPercent));
    const tipCents = tipChoice === "now" ? Math.round(subtotalBeforeTax * (pct / 100)) : 0;
    const discountCents = appliedDiscount?.discountCents ?? 0;
    const totalCents = Math.max(0, subtotalAfterTax + tipCents - discountCents);
    const baseLabel = selectedRate?.displayName ?? (selectedRate?.durationHours ? `${selectedRate.durationHours} hr` : "Rental");
    const rateLabel = isTicketed
      ? `${ticketCount} ticket${ticketCount !== 1 ? "s" : ""} × $${(unitCents / 100).toFixed(0)}/ticket`
      : baseLabel;
    return {
      rateLabel,
      rateCents,
      addonLines,
      subtotalBeforeTaxCents: subtotalBeforeTax,
      salesTaxCents,
      tipCents,
      discountCents,
      totalCents,
      priceIsEstimate,
    };
  }, [
    isTicketed,
    partySize,
    effectiveRateCents,
    selectedRate,
    displayAddons,
    addonSelections,
    tipChoice,
    tipPercent,
    appliedDiscount,
    effectivePriceLoading,
  ]);
}
