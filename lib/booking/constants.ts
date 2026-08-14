/**
 * Shared booking constants. No server-only imports so both client and server can use.
 * Single source of truth for values that must match between display and charge (e.g. tax rate).
 *
 * =============================================================================
 * OPERATOR PRICING MODEL
 * =============================================================================
 * Customer-facing total (conceptual):
 *   published charter price + add-ons + applicable tax/IVA + optional tip − discounts
 *
 * PROCESSING_FEE_RATE = 0 for NEW holds/bookings:
 *   Payment-processing cost (~6%) is an INTERNAL margin assumption baked into
 *   published rates — NOT a customer-facing surcharge. Do not reintroduce a
 *   checkout fee without an explicit product decision.
 *
 * TAX_RATE = 0.0825:
 *   Still legacy Texas-era rate. Cabo / Mexican IVA treatment is a SEPARATE
 *   decision (exclusive vs inclusive). Do not change TAX_RATE here without
 *   explicit ops/legal instruction.
 *
 * Where these rates affect charged totals (server-authoritative):
 *   - lib/booking/pricing.ts → computePricing
 *   - create-hold → holds.pricing snapshot
 *   - create-payment-intent / convert-hold / Stripe
 *
 * Where they affect display (must stay in sync):
 *   - components/site/usePriceSummary.ts
 *   - components/site/useDiscountValidation.ts
 *   - components/experience/ExperienceBookingCard.tsx
 *   - Inline booking "Sales tax" labels (rate % only — not jurisdiction name)
 *
 * Historical bookings keep their stored pricing snapshots — never recalculate.
 * =============================================================================
 */

/**
 * Sales tax rate applied to subtotal (rate + addons).
 * NEEDS CABO TAX / IVA DECISION BEFORE PRODUCTION — currently 8.25% legacy value.
 */
export const TAX_RATE = 0.0825;

/**
 * Customer-facing processing fee rate on subtotal (excluding tip).
 * Must stay 0: processor cost is absorbed in published charter/add-on prices.
 * Field `feesCents` remains on pricing snapshots for historical bookings / admin.
 */
export const PROCESSING_FEE_RATE = 0;

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
