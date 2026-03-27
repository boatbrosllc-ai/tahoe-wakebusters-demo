/**
 * PaymentIntent status policy for POST complete-after-payment: polling timeouts and user-facing failure copy.
 */
import type Stripe from "stripe";

/** Short cap when we believe confirmation should be quick (e.g. card). */
export const POLL_HARD_TIMEOUT_SYNC_MS = 30_000;
/** Default long cap for delayed-settlement / bank-style methods. */
export const POLL_HARD_TIMEOUT_ASYNC_MS = 300_000;
/** Absolute ceiling the client will still honor from the server (15 minutes). */
export const POLL_HARD_TIMEOUT_ABS_MAX_MS = 900_000;

const ASYNC_PM_TYPES = new Set([
  "us_bank_account",
  "acss_debit",
  "sepa_debit",
  "customer_balance",
  "bacs_debit",
  "au_becs_debit",
  "ideal",
  "bancontact",
  "fpx",
  "paynow",
  "grabpay",
  "affirm",
  "afterpay_clearpay",
  "klarna",
  "paypal",
  "zip",
]);

function paymentMethodTypeFromPi(pi: Stripe.PaymentIntent): string | undefined {
  const pm = pi.payment_method;
  if (typeof pm === "object" && pm != null && "type" in pm && typeof (pm as { type?: unknown }).type === "string") {
    return (pm as { type: string }).type;
  }
  return undefined;
}

function nextActionImpliesAsyncRedirect(pi: Stripe.PaymentIntent): boolean {
  const na = pi.next_action;
  if (!na || typeof na !== "object" || !("type" in na)) return false;
  const t = (na as { type?: string }).type;
  return (
    t === "redirect_to_url" ||
    t === "alipay_handle_redirect" ||
    t === "oxxo_display_details" ||
    t === "wechat_pay_display_qr_code" ||
    t === "verify_with_microdeposits" ||
    t === "cashapp_handle_redirect_or_decline"
  );
}

/**
 * Derives how long the client may poll for conversion while the PI is still processing.
 * Biases toward longer timeouts when PM type is unknown or likely async to avoid premature “stalled” UX.
 */
export function pollHardTimeoutMsForProcessingPaymentIntent(pi: Stripe.PaymentIntent): number {
  const pmType = paymentMethodTypeFromPi(pi);
  if (pmType && ASYNC_PM_TYPES.has(pmType)) {
    return Math.min(POLL_HARD_TIMEOUT_ASYNC_MS, POLL_HARD_TIMEOUT_ABS_MAX_MS);
  }
  if (nextActionImpliesAsyncRedirect(pi)) {
    return Math.min(POLL_HARD_TIMEOUT_ASYNC_MS, POLL_HARD_TIMEOUT_ABS_MAX_MS);
  }
  if (pmType == null) {
    return Math.min(POLL_HARD_TIMEOUT_ASYNC_MS, POLL_HARD_TIMEOUT_ABS_MAX_MS);
  }
  if (pmType === "card" || pmType === "interac_present" || pmType === "link") {
    return Math.min(POLL_HARD_TIMEOUT_SYNC_MS, POLL_HARD_TIMEOUT_ABS_MAX_MS);
  }
  return Math.min(POLL_HARD_TIMEOUT_ASYNC_MS, POLL_HARD_TIMEOUT_ABS_MAX_MS);
}

export type PaymentIntentTerminalFailureCopy = {
  headline: string;
  recovery: string;
};

export function paymentIntentTerminalFailureCopy(
  status: Stripe.PaymentIntent.Status
): PaymentIntentTerminalFailureCopy | null {
  switch (status) {
    case "canceled":
      return {
        headline: "This payment was canceled.",
        recovery:
          "Your booking was not confirmed. Start a new booking and complete payment again. If you still see a charge on your card or bank account, contact us with the email you used and the approximate time of payment.",
      };
    case "requires_payment_method":
      return {
        headline: "Your payment did not go through.",
        recovery:
          "Go back to checkout and try again with a different card or payment method. Your booking is not confirmed until payment succeeds.",
      };
    case "requires_action":
      return {
        headline: "Your bank still needs you to finish this payment.",
        recovery:
          "Return to the payment step and complete authentication (for example 3D Secure), or check for a prompt from your bank. If you already closed checkout, start the booking again from the calendar.",
      };
    default:
      return null;
  }
}
