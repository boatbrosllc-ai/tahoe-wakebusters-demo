"use client";

import { useCallback, useMemo, useState } from "react";
import { TAX_RATE } from "@/lib/booking/constants";
import type { AddonOption } from "@/lib/booking/booking-modal-types";

export function useDiscountValidation(
  discountCode: string,
  isTicketed: boolean,
  partySize: number,
  effectiveRateCents: number | null,
  selectedRatePriceCents: number | undefined,
  displayAddons: AddonOption[],
  addonSelections: Record<string, number>
) {
  const [appliedDiscount, setAppliedDiscount] = useState<{ discountCents: number; code: string } | null>(null);
  const [appliedDiscountLoading, setAppliedDiscountLoading] = useState(false);
  const [appliedDiscountError, setAppliedDiscountError] = useState<string | null>(null);

  const addonSelectionsKey = useMemo(
    () =>
      Object.keys(addonSelections)
        .sort()
        .map((k) => `${k}:${addonSelections[k] ?? 0}`)
        .join("|"),
    [addonSelections]
  );

  const clearDiscount = useCallback(() => {
    setAppliedDiscount(null);
    setAppliedDiscountError(null);
  }, []);

  const applyDiscount = useCallback(async () => {
    const code = discountCode.trim();
    if (!code) return;
    if (effectiveRateCents == null) return;
    setAppliedDiscountError(null);
    setAppliedDiscountLoading(true);
    try {
      const ticketCountForDiscount = isTicketed ? Math.max(1, Math.floor(Number(partySize))) : 1;
      const unitRateForDiscount = effectiveRateCents ?? selectedRatePriceCents ?? 0;
      const rateSubtotalCents = isTicketed ? unitRateForDiscount * ticketCountForDiscount : unitRateForDiscount;
      const addonSubtotalCents = displayAddons.reduce(
        (s, a) => s + a.priceCents * (addonSelections[a.id] ?? 0),
        0
      );
      const subtotalBeforeTaxDiscount = rateSubtotalCents + addonSubtotalCents;
      const salesTaxForDiscount = Math.round(subtotalBeforeTaxDiscount * TAX_RATE);
      const totalBeforeDiscount = subtotalBeforeTaxDiscount + salesTaxForDiscount;
      const res = await fetch("/api/booking/validate-discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, totalCents: totalBeforeDiscount }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        valid?: boolean;
        discountCents?: number;
        code?: string;
        error?: string;
      };
      if (data.valid && typeof data.discountCents === "number" && data.code) {
        setAppliedDiscount({ discountCents: data.discountCents, code: data.code });
      } else {
        setAppliedDiscount(null);
        setAppliedDiscountError(data.error ?? "Invalid or expired code");
      }
    } catch {
      setAppliedDiscount(null);
      setAppliedDiscountError("Could not validate code");
    } finally {
      setAppliedDiscountLoading(false);
    }
  }, [
    discountCode,
    isTicketed,
    partySize,
    effectiveRateCents,
    selectedRatePriceCents,
    displayAddons,
    addonSelections,
    addonSelectionsKey,
  ]);

  return {
    applyDiscount,
    appliedDiscount,
    appliedDiscountLoading,
    appliedDiscountError,
    clearDiscount,
    setAppliedDiscount,
    setAppliedDiscountError,
    setAppliedDiscountLoading,
  };
}
