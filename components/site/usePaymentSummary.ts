/**
 * Derived payment/deposit display values for booking checkout (modal + inline).
 * Keeps totals, estimate flags, and "blocked" states in one place.
 */
import { useMemo } from "react";
import { DEPOSIT_FRACTION } from "@/lib/booking/constants";
import type { PriceSummary } from "@/components/site/usePriceSummary";

export interface UsePaymentSummaryArgs {
  priceSummary: PriceSummary;
  depositCentsFromServer: number | null;
  totalCentsFromServer: number | null;
  finalCentsFromServer: number | null;
  /** Matches BookingModal: no effective rate yet while these loaders run. */
  datePricesLoading: boolean;
  effectivePriceLoading: boolean;
  effectiveRateCents: number | null | undefined;
}

export interface PaymentSummaryDerived {
  displayDepositCents: number;
  displayFinalCents: number;
  /** True when deposit shown is client-side only (before create-payment-intent returns deposit). */
  depositAmountIsEstimate: boolean;
  finalAmountIsEstimate: boolean;
  /** True while authoritative effective rate is still loading (blocks showing exact pay-now totals). */
  paymentPriceBlocked: boolean;
  /** Hide client-estimated totals for pay-in-full until authoritative rate is known. */
  payFullTotalPending: boolean;
  /** Block proceeding when tipping on an estimate. */
  tipBlockedForEstimate: boolean;
  tipChoice: "now" | "later" | null;
}

export function usePaymentSummary({
  priceSummary,
  depositCentsFromServer,
  totalCentsFromServer,
  finalCentsFromServer,
  datePricesLoading,
  effectivePriceLoading,
  effectiveRateCents,
  tipChoice,
}: UsePaymentSummaryArgs & { tipChoice: "now" | "later" | null }): PaymentSummaryDerived {
  return useMemo(() => {
    const paymentPriceBlocked =
      effectiveRateCents == null && (datePricesLoading || effectivePriceLoading);
    const rawDepositCents =
      depositCentsFromServer ?? Math.round(priceSummary.totalCents * DEPOSIT_FRACTION);
    const displayDepositCents = Math.max(0, Number.isFinite(rawDepositCents) ? rawDepositCents : 0);
    const rawFinalCents =
      finalCentsFromServer ??
      (totalCentsFromServer != null
        ? totalCentsFromServer - rawDepositCents
        : Math.max(0, priceSummary.totalCents - rawDepositCents));
    const displayFinalCents = Math.max(0, Number.isFinite(rawFinalCents) ? rawFinalCents : 0);
    const depositAmountIsEstimate = depositCentsFromServer == null;
    const finalAmountIsEstimate = finalCentsFromServer == null;
    const payFullTotalPending = paymentPriceBlocked || priceSummary.priceIsEstimate;
    const tipBlockedForEstimate = tipChoice === "now" && priceSummary.priceIsEstimate;
    return {
      displayDepositCents,
      displayFinalCents,
      depositAmountIsEstimate,
      finalAmountIsEstimate,
      paymentPriceBlocked,
      payFullTotalPending,
      tipBlockedForEstimate,
      tipChoice,
    };
  }, [
    priceSummary,
    depositCentsFromServer,
    totalCentsFromServer,
    finalCentsFromServer,
    datePricesLoading,
    effectivePriceLoading,
    effectiveRateCents,
    tipChoice,
  ]);
}
