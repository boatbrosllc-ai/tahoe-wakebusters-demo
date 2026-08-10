/**
 * Client-side Stripe publishable key and checkout readiness.
 * Use this so booking UI can fail fast when payment is not configured.
 *
 * Apple Pay in the Payment Element only appears after each public origin is registered under
 * Stripe Dashboard → Settings → Payment methods → Payment method domains (add e.g. nastysportfishing.com
 * and www.nastysportfishing.com, then verify via hosted file or DNS). See:
 * https://stripe.com/docs/payments/payment-methods/pmd-registration
 */

export const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

export const isStripeCheckoutReady = !!stripePublishableKey;

/** Production-safe message when NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing. */
export const STRIPE_CHECKOUT_NOT_CONFIGURED_MESSAGE =
  "Payment is not configured. The site administrator needs to set up Stripe (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) to accept payments. Contact support to complete your booking.";
