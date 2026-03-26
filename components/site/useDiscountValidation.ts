"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TAX_RATE } from "@/lib/booking/constants";
import type { AddonOption } from "@/lib/booking/booking-modal-types";

export function useDiscountValidation(
  discountCode: string,
  isTicketed: boolean,
  partySize: number,
  effectiveRateCents: number | null,
  displayAddons: AddonOption[],
  addonSelections: Record<string, number>,
  validationContext?: {
    slotId: string | null;
    experienceId: string | undefined;
    rateId: string | null;
    boatId: string | null | undefined;
    bookingMode: "shared" | "charter";
  },
  /** Drives automatic re-validation when add-ons or party size change while a code is entered. */
  discountDriverAddonKey: string = ""
) {
  const [appliedDiscount, setAppliedDiscount] = useState<{ discountCents: number; code: string } | null>(null);
  const [appliedDiscountLoading, setAppliedDiscountLoading] = useState(false);
  const [appliedDiscountError, setAppliedDiscountError] = useState<string | null>(null);

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
      const unitRateForDiscount = effectiveRateCents;
      const rateSubtotalCents = isTicketed ? unitRateForDiscount * ticketCountForDiscount : unitRateForDiscount;
      const addonSubtotalCents = displayAddons.reduce(
        (s, a) => s + a.priceCents * (addonSelections[a.id] ?? 0),
        0
      );
      const subtotalBeforeTaxDiscount = rateSubtotalCents + addonSubtotalCents;
      const salesTaxForDiscount = Math.round(subtotalBeforeTaxDiscount * TAX_RATE);
      const totalBeforeDiscount = subtotalBeforeTaxDiscount + salesTaxForDiscount;
      const addonPayload = displayAddons
        .map((a) => ({ addonId: a.id, qty: addonSelections[a.id] ?? 0 }))
        .filter((row) => row.qty > 0);
      const body: Record<string, unknown> = {
        code,
        totalCents: totalBeforeDiscount,
        partySize: Math.max(1, Math.floor(Number(partySize))),
      };
      const ctx = validationContext;
      if (
        ctx?.slotId &&
        ctx.rateId &&
        ctx.experienceId &&
        ctx.slotId.trim() &&
        ctx.rateId.trim() &&
        ctx.experienceId.trim()
      ) {
        body.slotId = ctx.slotId.trim();
        body.rateId = ctx.rateId.trim();
        body.experienceId = ctx.experienceId.trim();
        body.bookingMode = ctx.bookingMode;
        if (ctx.boatId?.trim()) body.boatId = ctx.boatId.trim();
        body.addonSelections = addonPayload;
      }
      const res = await fetch("/api/booking/validate-discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        valid?: boolean;
        discountCents?: number;
        code?: string;
        error?: string;
      };
      if (res.status === 422 && data.error === "Could not verify order total; please try again") {
        setAppliedDiscount(null);
        setAppliedDiscountError(data.error);
        return;
      }
      if (data.valid && typeof data.discountCents === "number" && data.code) {
        setAppliedDiscount({ discountCents: data.discountCents, code: data.code });
      } else {
        setAppliedDiscount(null);
        setAppliedDiscountError(data.error ?? "Invalid or expired code");
      }
    } catch {
      setAppliedDiscountError("Could not re-verify this code (network error). Please retry, or proceed without changes.");
    } finally {
      setAppliedDiscountLoading(false);
    }
  }, [
    discountCode,
    isTicketed,
    partySize,
    effectiveRateCents,
    displayAddons,
    addonSelections,
    validationContext,
  ]);

  const applyDiscountRef = useRef(applyDiscount);
  applyDiscountRef.current = applyDiscount;

  useEffect(() => {
    const code = discountCode.trim();
    if (!code) return;
    if (effectiveRateCents == null) return;
    const ctx = validationContext;
    if (!ctx?.slotId?.trim() || !ctx.rateId?.trim() || !ctx.experienceId?.trim()) return;
    const t = window.setTimeout(() => {
      void applyDiscountRef.current();
    }, 600);
    return () => window.clearTimeout(t);
    // Re-validate when slot/rate/experience context changes; party/addon totals use client `usePriceSummary` with last `discountCents`.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- discountCode read intentionally; do not re-run on each keystroke
  }, [
    discountDriverAddonKey,
    effectiveRateCents,
    validationContext?.slotId,
    validationContext?.rateId,
    validationContext?.experienceId,
    validationContext?.boatId,
    validationContext?.bookingMode,
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
