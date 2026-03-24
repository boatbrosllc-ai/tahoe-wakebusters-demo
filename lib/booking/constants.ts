/**
 * Shared booking constants. No server-only imports so both client and server can use.
 * Single source of truth for values that must match between display and charge (e.g. tax rate).
 */

/** Texas combined sales tax (e.g. Austin: state 6.25% + local up to 2% = 8.25%). */
export const TAX_RATE = 0.0825;

/**
 * Default deposit = this fraction of total (when deposit checkout is allowed).
 * Must match `amountIntegrityMismatch` deposit math in `convertHoldToBooking` — keep in sync.
 */
export const DEPOSIT_FRACTION = 0.5;

/** Server enforcement in create-hold (tip cap as % of post-discount total). */
export const TIP_MAX_PERCENT_SERVER = 35;

/**
 * Max tip percentage when customer chooses "tip now" — must match {@link TIP_MAX_PERCENT_SERVER} and create-hold.
 */
export const TIP_MAX_PERCENT = TIP_MAX_PERCENT_SERVER;

/** Hold lifetime for `create-hold` (modal / inline / embedded payment flows). */
export const HOLD_EXPIRY_MINUTES = 10;

/** Stripe PaymentIntent / Checkout Session metadata key — must match hold.paymentAttemptVersion after hold create/resume. */
export const HOLD_PAYMENT_ATTEMPT_VERSION_META = "holdPaymentAttemptVersion";

/**
 * Hold lifetime for `create-checkout-session-direct`: one request creates the hold and the
 * Stripe Checkout session, so the customer may need more time for redirect and payment than
 * the in-modal flow where checkout opens immediately after the hold exists.
 */
export const DIRECT_CHECKOUT_HOLD_EXPIRY_MINUTES = 20;
