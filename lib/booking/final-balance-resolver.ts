/**
 * Single source of truth for the final balance (remaining amount before final charge)
 * from booking totals: totalAmountCents − depositAmountCents.
 * Customer pay-remaining, manage/get, and cron final charges must use this so Stripe
 * PaymentIntent amounts and Firestore stay aligned.
 */

import type { DocumentReference } from "firebase-admin/firestore";
import { getFirestoreExports } from "@/lib/booking/firebase-admin";
import type { Booking } from "@/lib/booking/types";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";

/** Treat stored finalAmountCents as matching if within this delta of the computed total. */
export const FINAL_BALANCE_MISMATCH_EPSILON_CENTS = 1;

export type FinalBalanceResolution = {
  /** Canonical final balance in cents from totals on the booking document. */
  authoritativeFinalCents: number;
  totalAmountCents: number;
  depositAmountCents: number;
  storedFinalAmountCents: number | undefined;
  /** True when stored `stripe.finalAmountCents` disagrees with authoritative total − deposit. */
  mismatchVsStored: boolean;
  /**
   * Deposit PI id is set on the booking but `depositAmountCents` is missing or non-positive — do not charge full total off-session.
   */
  isDepositAmountMissing: boolean;
};

export function resolveFinalBalanceFromBooking(booking: Booking): FinalBalanceResolution {
  const s = booking.stripe;
  const totalAmountCents = typeof s?.totalAmountCents === "number" ? s.totalAmountCents : 0;
  const depositAmountCents = typeof s?.depositAmountCents === "number" ? s.depositAmountCents : 0;
  const authoritativeFinalCents = Math.max(0, totalAmountCents - depositAmountCents);
  const storedFinalAmountCents =
    typeof s?.finalAmountCents === "number" ? s.finalAmountCents : undefined;
  const mismatchVsStored =
    storedFinalAmountCents != null &&
    Math.abs(storedFinalAmountCents - authoritativeFinalCents) > FINAL_BALANCE_MISMATCH_EPSILON_CENTS;
  const depositPiTrim =
    typeof s?.depositPaymentIntentId === "string" && s.depositPaymentIntentId.trim().length > 0
      ? s.depositPaymentIntentId.trim()
      : "";
  const hasValidDepositAmountCents =
    typeof s?.depositAmountCents === "number" && Number.isFinite(s.depositAmountCents) && s.depositAmountCents > 0;
  const isDepositAmountMissing = Boolean(depositPiTrim) && !hasValidDepositAmountCents;
  return {
    authoritativeFinalCents,
    totalAmountCents,
    depositAmountCents,
    storedFinalAmountCents,
    mismatchVsStored,
    isDepositAmountMissing,
  };
}

/**
 * If Firestore `stripe.finalAmountCents` is stale vs totals, patch it and emit a single
 * operational alert so ops/UI/Stripe share one baseline.
 */
export async function persistFinalBalanceNormalizationIfNeeded(
  bookingRef: DocumentReference,
  booking: Booking,
  ctx: { bookingId: string; source: string }
): Promise<{ authoritativeFinalCents: number; normalized: boolean }> {
  const resolution = resolveFinalBalanceFromBooking(booking);
  if (!resolution.mismatchVsStored) {
    return { authoritativeFinalCents: resolution.authoritativeFinalCents, normalized: false };
  }
  const { FieldValue } = getFirestoreExports();
  await bookingRef.update({
    "stripe.finalAmountCents": resolution.authoritativeFinalCents,
    "stripe.finalBalanceNormalizedAt": FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await writeOperationalAlert({
    type: "final_balance_normalized",
    bookingId: ctx.bookingId,
    source: ctx.source,
    storedFinalAmountCents: resolution.storedFinalAmountCents,
    authoritativeFinalCents: resolution.authoritativeFinalCents,
    totalAmountCents: resolution.totalAmountCents,
    depositAmountCents: resolution.depositAmountCents,
  });
  return { authoritativeFinalCents: resolution.authoritativeFinalCents, normalized: true };
}
