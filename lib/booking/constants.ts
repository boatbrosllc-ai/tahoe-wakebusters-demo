/**
 * Shared booking constants. No server-only imports so both client and server can use.
 * Single source of truth for values that must match between display and charge (e.g. tax rate).
 *
 * Tax rate and deposit fraction come from `config/site.ts` (customer-owned).
 * PROCESSING_FEE_RATE stays 0: processor cost is absorbed in published rates.
 */

import { siteConfig } from "@/config/site";

/**
 * Sales tax rate applied to subtotal (rate + addons).
 * Customer-owned: set `siteConfig.business.taxRate` (template default is 0).
 *
 * Slipstack onboarding does not yet collect tax rate — control plane writes 0 and
 * `transformToPlatformLaunchPacket` sets `taxRate: 0`. When tax is added to intake,
 * map it through the launch packet → `mapPacketToSiteConfig` → this constant only;
 * pricing/checkout already multiply subtotal by TAX_RATE.
 */
export const TAX_RATE = siteConfig.business.taxRate;

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
export const DEPOSIT_FRACTION = siteConfig.booking.depositFraction;

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
