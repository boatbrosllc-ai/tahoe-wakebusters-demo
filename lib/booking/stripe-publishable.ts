/**
 * Client-side Stripe publishable key and checkout readiness.
 * Use this so booking UI can fail fast when payment is not configured.
 */

export const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

export const isStripeCheckoutReady = !!stripePublishableKey;

/** Production-safe message when NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing. */
export const STRIPE_CHECKOUT_NOT_CONFIGURED_MESSAGE =
  "Payment is not configured. The site administrator needs to set up Stripe (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) to accept payments. Contact support to complete your booking.";
