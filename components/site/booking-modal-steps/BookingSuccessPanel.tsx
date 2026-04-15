"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { siteConfig } from "@/config/site";
import { DEPOSIT_FRACTION } from "@/lib/booking/constants";
import { formatMoneyNonNegative } from "@/lib/booking/format-money";
import { formatBookingTimeFromIso } from "@/lib/booking/format-booking-datetime";
import type { ExperienceItem } from "@/lib/booking/booking-modal-types";
import { bookingWarn } from "@/lib/booking/debug";

type BookingSuccessPanelProps = {
  paymentPhase: string;
  paymentError: string | null;
  recoveryFailedPiId: string | null;
  successRecoveryPaymentCaptured?: boolean;
  onClose: () => void;
  /** Fresh booking flow (category picker) — not the same as closing only. */
  onBookAnother: () => void;
  onTryAgain: () => void | Promise<void>;
  /** While true, complete-after-payment retry is in flight — blocks duplicate retries. */
  completeAfterRetryInFlight?: boolean;
  // "success" state data
  selectedExperience: ExperienceItem | null;
  isDepositFromServer: boolean | null;
  depositCentsFromServer: number | null;
  totalCentsFromServer: number | null;
  finalCentsFromServer: number | null;
  isTicketed: boolean;
  payFullAmount: boolean;
  completedBookingId: string | null;
  /** Trip date (YYYY-MM-DD) and slot start ISO for display */
  selectedDateStr: string | null;
  selectedSlotStartIso: string | null;
  /** Long-lived or claim token for linking to /booking/success */
  receiptClaimToken: string | null;
  priceSummary: {
    totalCents: number;
  };
  /** From complete-after-payment when pendingRefunds has discount_limit_exceeded */
  discountLimitExceeded?: boolean;
};

export function BookingSuccessPanel({
  paymentPhase,
  paymentError,
  recoveryFailedPiId,
  successRecoveryPaymentCaptured = false,
  onClose,
  onBookAnother,
  onTryAgain,
  completeAfterRetryInFlight = false,
  selectedExperience,
  isDepositFromServer,
  depositCentsFromServer,
  totalCentsFromServer,
  finalCentsFromServer,
  isTicketed,
  payFullAmount,
  completedBookingId,
  selectedDateStr,
  selectedSlotStartIso,
  receiptClaimToken,
  priceSummary,
  discountLimitExceeded = false,
}: BookingSuccessPanelProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const hasLoggedPriceDriftRef = useRef(false);
  useEffect(() => {
    if (
      paymentPhase !== "successRecoveryFailed" &&
      paymentPhase !== "successWithWarning" &&
      paymentPhase !== "success"
    ) {
      return;
    }
    if (hasLoggedPriceDriftRef.current) return;
    if (typeof totalCentsFromServer !== "number" || !Number.isFinite(totalCentsFromServer)) return;
    if (typeof priceSummary?.totalCents !== "number" || !Number.isFinite(priceSummary.totalCents)) return;
    const delta = Math.abs(priceSummary.totalCents - totalCentsFromServer);
    if (delta <= 1) return;
    hasLoggedPriceDriftRef.current = true;
    bookingWarn("client", "priceSummary drift vs totalCentsFromServer on success panel", {
      totalCentsFromServer,
      totalCentsClient: priceSummary.totalCents,
      deltaCents: delta,
    });
  }, [paymentPhase, priceSummary?.totalCents, totalCentsFromServer]);

  if (paymentPhase !== "successRecoveryFailed" && paymentPhase !== "successWithWarning" && paymentPhase !== "success") return null;

  if (paymentPhase === "successRecoveryFailed") {
    if (successRecoveryPaymentCaptured) {
      const telHref = `tel:${siteConfig.phoneTel}`;
      return (
        <div className="py-6 sm:py-8 flex flex-col items-center gap-4 text-center">
          <div className="w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0" aria-hidden>
            <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-brand-dark">Your payment was received</h3>
            <p className="text-sm text-brand-muted mt-2 max-w-[320px] mx-auto">
              We&apos;re confirming your booking now. If you don&apos;t get a confirmation email within 15 minutes, contact us at{" "}
              <a href={telHref} className="font-semibold text-brand-primary underline underline-offset-2">
                {siteConfig.phone}
              </a>
              .
            </p>
            {recoveryFailedPiId ? (
              <div className="mt-4 text-left max-w-[320px] mx-auto space-y-2">
                <p className="text-sm text-brand-muted">
                  Please share this reference when you call:{" "}
                  <code className="font-mono text-sm font-semibold text-brand-dark bg-brand-bg/90 border border-brand-dark/15 px-2 py-1 rounded-md break-all block mt-1">
                    {recoveryFailedPiId}
                  </code>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const id = recoveryFailedPiId.trim();
                    if (!id || typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
                      setCopyState("error");
                      return;
                    }
                    void navigator.clipboard.writeText(id).then(
                      () => {
                        setCopyState("copied");
                        window.setTimeout(() => setCopyState("idle"), 2000);
                      },
                      () => setCopyState("error")
                    );
                  }}
                  className="text-sm font-semibold text-brand-primary underline underline-offset-2 hover:no-underline"
                >
                  {copyState === "copied" ? "Copied" : copyState === "error" ? "Copy failed — select text above" : "Copy reference"}
                </button>
              </div>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-xl bg-brand-primary text-white font-semibold py-2.5 px-5 text-sm hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-brand-primary shrink-0">
            Close
          </button>
        </div>
      );
    }
    return (
      <div className="py-6 sm:py-8 flex flex-col items-center gap-4 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0" aria-hidden>
          <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-brand-dark">Your booking is being confirmed</h3>
          <p className="text-sm text-brand-muted mt-2 max-w-[320px] mx-auto">
            We couldn&apos;t verify your payment with the server yet. You can start the booking again — you won&apos;t be charged twice for the same completed payment.
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-xl bg-brand-primary text-white font-semibold py-2.5 px-5 text-sm hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-brand-primary shrink-0">
          Start over
        </button>
      </div>
    );
  }

  if (paymentPhase === "successWithWarning") {
    return (
      <div className="py-6 sm:py-8 flex flex-col items-center gap-4 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0" aria-hidden>
          <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-brand-dark">Your booking is being confirmed</h3>
          <p className="text-sm text-brand-muted mt-2 max-w-[320px] mx-auto">{paymentError ?? "Your payment was successful, but we couldn't complete the booking confirmation. Please contact us with your email so we can confirm your reservation."}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => void onTryAgain()}
            disabled={completeAfterRetryInFlight}
            className="rounded-xl border-2 border-brand-primary bg-white text-brand-primary font-semibold py-2.5 px-5 text-sm hover:bg-brand-primary/10 focus:outline-none focus:ring-2 focus:ring-brand-primary shrink-0 disabled:opacity-60 disabled:pointer-events-none"
          >
            {completeAfterRetryInFlight ? "Retrying…" : "Try again"}
          </button>
          <button type="button" onClick={onClose} className="rounded-xl bg-brand-primary text-white font-semibold py-2.5 px-5 text-sm hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-brand-primary shrink-0">
            Close
          </button>
        </div>
      </div>
    );
  }

  const dateLine =
    selectedDateStr && selectedSlotStartIso
      ? `${new Date(selectedDateStr + "T12:00:00").toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        })} · ${formatBookingTimeFromIso(selectedSlotStartIso)}`
      : selectedDateStr
        ? new Date(selectedDateStr + "T12:00:00").toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : null;

  const successReceiptHref =
    receiptClaimToken != null && receiptClaimToken.length > 0
      ? `/booking/success?receipt_token=${encodeURIComponent(receiptClaimToken)}`
      : null;

  // paymentPhase === "success"
  return (
    <div className="py-4 sm:py-8 flex flex-col items-center gap-3 sm:gap-5 text-center">
      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-brand-primary/15 flex items-center justify-center shrink-0">
        <svg className="w-6 h-6 sm:w-7 sm:h-7 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <div className="min-w-0 w-full space-y-2">
        <h3 className="text-lg sm:text-xl font-bold text-brand-dark">You&apos;re all set!</h3>
        {discountLimitExceeded && (
          <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3 text-left max-w-[min(100%,360px)] mx-auto">
            Note: your discount code could not be applied — a partial refund will be processed within 1–2 business days.
          </p>
        )}
        {selectedExperience && (
          <p className="text-sm font-semibold text-brand-dark">{selectedExperience.title}</p>
        )}
        {dateLine && <p className="text-sm text-brand-muted">{dateLine}</p>}
        {completedBookingId != null && (
          <p className="text-sm text-brand-muted">
            Booking reference: <span className="font-mono font-medium text-brand-dark">#{completedBookingId}</span>
          </p>
        )}
        <p className="text-xs sm:text-sm text-brand-muted mt-1 sm:mt-1.5 max-w-[320px] mx-auto">
          {selectedExperience && (priceSummary.totalCents > 0 || totalCentsFromServer != null) ? (
            (() => {
              const serverSaysDeposit = isDepositFromServer === true;
              const amountsShowDeposit =
                depositCentsFromServer != null &&
                totalCentsFromServer != null &&
                depositCentsFromServer < totalCentsFromServer;
              const showDeposit = serverSaysDeposit || amountsShowDeposit;
              const paymentModeUnknown = isDepositFromServer === null && !amountsShowDeposit && !serverSaysDeposit;
              if (showDeposit) {
                if (
                  typeof depositCentsFromServer === "number" &&
                  typeof totalCentsFromServer === "number" &&
                  depositCentsFromServer >= 0 &&
                  totalCentsFromServer > depositCentsFromServer
                ) {
                  const depositCents = Math.max(0, depositCentsFromServer);
                  let remainingCents: number;
                  if (typeof finalCentsFromServer === "number" && finalCentsFromServer > 0) {
                    remainingCents = finalCentsFromServer;
                  } else {
                    remainingCents = totalCentsFromServer - depositCentsFromServer;
                  }
                  remainingCents = Math.max(0, remainingCents);
                  const ambiguousRemainingBalance =
                    (finalCentsFromServer == null || finalCentsFromServer <= 0) &&
                    depositCents > 0 &&
                    remainingCents === depositCents;
                  const detailsHref = successReceiptHref;
                  return (
                    <>
                      We&apos;ve received your <strong>{Math.round(DEPOSIT_FRACTION * 100)}% deposit</strong> of{" "}
                      <span className="font-semibold text-brand-dark">{formatMoneyNonNegative(depositCents)}</span>.
                      {ambiguousRemainingBalance ? (
                        <>
                          {" "}
                          <span className="font-semibold text-brand-dark">The remaining balance</span> will be charged 48 hours before your trip.
                          {detailsHref ? (
                            <>
                              {" "}
                              <Link
                                href={detailsHref}
                                className="font-semibold text-brand-primary underline underline-offset-2"
                              >
                                View booking details
                              </Link>
                              .
                            </>
                          ) : null}{" "}
                        </>
                      ) : (
                        <>
                          {" "}
                          The remaining balance of{" "}
                          <span className="font-semibold text-brand-dark">{formatMoneyNonNegative(remainingCents)}</span> will be charged 48 hours before your trip.{" "}
                        </>
                      )}
                      Your booking is confirmed. We&apos;re sending your confirmation email — please allow a few minutes and check your spam folder if it doesn&apos;t arrive.
                    </>
                  );
                }
                return (
                  <>
                    We&apos;ve received your <strong>deposit</strong>. The remaining balance will be charged 48 hours before your trip.
                    {" "}
                    For your exact amounts, please refer to your confirmation email or contact us.
                  </>
                );
              }
              if (paymentModeUnknown) {
                return (
                  <>
                    We&apos;ve received your payment for {selectedExperience.title}. Your booking is confirmed. We&apos;re sending your confirmation email — please allow a few minutes and check your spam folder if it doesn&apos;t arrive.
                  </>
                );
              }
              return (
                <>
                  We&apos;ve received your <strong>full payment</strong> of{" "}
                  <span className="font-semibold text-brand-dark">${((totalCentsFromServer ?? priceSummary.totalCents) / 100).toFixed(2)}</span> for{" "}
                  {selectedExperience.title}. Your booking is confirmed. We&apos;re sending your confirmation email — please allow a few minutes and check your spam folder if it doesn&apos;t arrive.
                </>
              );
            })()
          ) : (
            <>
              We&apos;ve received your payment. Your booking is confirmed. We&apos;re sending your confirmation email — please allow a few minutes and check your spam folder if it doesn&apos;t arrive.
            </>
          )}
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto items-center justify-center">
        <button type="button" onClick={onClose} className="w-full sm:w-auto rounded-xl bg-brand-primary text-white font-semibold py-2.5 px-5 sm:py-3 sm:px-6 text-sm sm:text-base hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 shrink-0">
          Close
        </button>
        <button
          type="button"
          onClick={onBookAnother}
          className="w-full sm:w-auto rounded-xl border-2 border-brand-primary bg-white text-brand-primary font-semibold py-2.5 px-5 sm:py-3 sm:px-6 text-sm sm:text-base hover:bg-brand-primary/10 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 shrink-0"
        >
          Book another experience
        </button>
      </div>
    </div>
  );
}
