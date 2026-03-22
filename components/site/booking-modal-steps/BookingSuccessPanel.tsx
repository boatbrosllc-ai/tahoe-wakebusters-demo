"use client";

import { siteConfig } from "@/config/site";
import { DEPOSIT_FRACTION } from "@/lib/booking/constants";
import type { ExperienceItem } from "@/lib/booking/booking-modal-types";

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
  priceSummary: {
    totalCents: number;
  };
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
  priceSummary,
}: BookingSuccessPanelProps) {
  if (paymentPhase !== "successRecoveryFailed" && paymentPhase !== "successWithWarning" && paymentPhase !== "success") return null;

  if (paymentPhase === "successRecoveryFailed") {
    if (successRecoveryPaymentCaptured) {
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
            <h3 className="text-lg font-bold text-brand-dark">Payment received — please contact support</h3>
            <p className="text-sm text-brand-muted mt-2 max-w-[320px] mx-auto">
              Your payment was captured. We couldn&apos;t complete the booking confirmation automatically. Please contact us with your payment reference below.
            </p>
            {recoveryFailedPiId && (
              <p className="text-sm font-mono font-semibold text-brand-dark bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg mt-3">
                Payment reference: {recoveryFailedPiId}
              </p>
            )}
            <p className="text-base font-bold text-brand-dark mt-4">{siteConfig.phone}</p>
            <p className="text-xs text-brand-muted mt-1">Call or text with this reference so we can locate your payment.</p>
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
          <h3 className="text-lg font-bold text-brand-dark">Couldn&apos;t confirm payment</h3>
          <p className="text-sm text-brand-muted mt-2 max-w-[320px] mx-auto">
            We couldn&apos;t verify your payment with the server. You can start the booking again — you won&apos;t be charged twice for the same completed payment.
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
          <h3 className="text-lg font-bold text-brand-dark">Payment received — confirmation pending</h3>
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

  // paymentPhase === "success"
  return (
    <div className="py-4 sm:py-8 flex flex-col items-center gap-3 sm:gap-5 text-center">
      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-brand-primary/15 flex items-center justify-center shrink-0">
        <svg className="w-6 h-6 sm:w-7 sm:h-7 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <div className="min-w-0">
        <h3 className="text-lg sm:text-xl font-bold text-brand-dark">You&apos;re all set!</h3>
        <p className="text-xs sm:text-sm text-brand-muted mt-1 sm:mt-1.5 max-w-[280px] mx-auto">
          {selectedExperience && (priceSummary.totalCents > 0 || totalCentsFromServer != null) ? (
            (() => {
              const serverSaysDeposit = isDepositFromServer === true;
              const amountsShowDeposit =
                depositCentsFromServer != null &&
                totalCentsFromServer != null &&
                depositCentsFromServer < totalCentsFromServer;
              const showDeposit =
                serverSaysDeposit || amountsShowDeposit || (isDepositFromServer === null && !isTicketed && !payFullAmount);
              const paymentModeUnknown = isDepositFromServer === null && !amountsShowDeposit && !serverSaysDeposit;
              if (showDeposit) {
                const depositCents = depositCentsFromServer ?? Math.round(priceSummary.totalCents * DEPOSIT_FRACTION);
                let remainingCents: number;
                if (typeof finalCentsFromServer === "number" && finalCentsFromServer > 0) {
                  remainingCents = finalCentsFromServer;
                } else if (totalCentsFromServer != null && depositCentsFromServer != null && totalCentsFromServer > depositCentsFromServer) {
                  remainingCents = totalCentsFromServer - depositCentsFromServer;
                } else {
                  remainingCents = Math.round(priceSummary.totalCents * DEPOSIT_FRACTION);
                }
                return (
                  <>
                    We&apos;ve received your <strong>50% deposit</strong> of <span className="font-semibold text-brand-dark">${(depositCents / 100).toFixed(2)}</span> for {selectedExperience.title}. The remaining balance of{" "}
                    <span className="font-semibold text-brand-dark">${(remainingCents / 100).toFixed(2)}</span> will be charged 48 hours before your trip. Your receipt has been sent to your confirmation email.
                  </>
                );
              }
              if (paymentModeUnknown) {
                return <>We&apos;ve received your payment for {selectedExperience.title}. Your receipt has been sent to your confirmation email.</>;
              }
              return (
                <>We&apos;ve received your <strong>full payment</strong> of <span className="font-semibold text-brand-dark">${((totalCentsFromServer ?? priceSummary.totalCents) / 100).toFixed(2)}</span> for {selectedExperience.title}. Your receipt has been sent to your confirmation email.</>
              );
            })()
          ) : (
            <>We&apos;ve received your payment. Your receipt has been sent to your confirmation email.</>
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
      {completedBookingId != null && <p className="text-xs text-brand-muted">Booking #{completedBookingId}</p>}
    </div>
  );
}

