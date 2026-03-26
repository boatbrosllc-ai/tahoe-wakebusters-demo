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
    const authoritativeTotal = Math.max(0, totalCentsFromServer ?? priceSummary.totalCents);
    const halfRounded = Math.round(authoritativeTotal * DEPOSIT_FRACTION);
    const maxReasonableDeposit = Math.min(authoritativeTotal, Math.round(halfRounded * 1.01));

    let rawDepositCents: number;
    let trustServerDeposit = false;
    if (
      typeof depositCentsFromServer === "number" &&
      Number.isFinite(depositCentsFromServer) &&
      depositCentsFromServer >= 0
    ) {
      if (depositCentsFromServer === authoritativeTotal) {
        rawDepositCents = halfRounded;
      } else if (depositCentsFromServer <= maxReasonableDeposit) {
        rawDepositCents = depositCentsFromServer;
        trustServerDeposit = true;
      } else {
        rawDepositCents = depositCentsFromServer;
        trustServerDeposit = true;
      }
    } else {
      rawDepositCents = halfRounded;
    }

    const displayDepositCents = Math.max(0, Number.isFinite(rawDepositCents) ? rawDepositCents : 0);
    const rawFinalCents =
      finalCentsFromServer != null && trustServerDeposit
        ? finalCentsFromServer
        : Math.max(0, authoritativeTotal - displayDepositCents);
    const displayFinalCents = Math.max(0, Number.isFinite(rawFinalCents) ? rawFinalCents : 0);
    const depositAmountIsEstimate = depositCentsFromServer == null || !trustServerDeposit;
    const finalAmountIsEstimate = finalCentsFromServer == null || !trustServerDeposit;
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
