/**
 * Server-only PaymentIntent method selection for booking checkout.
 * Full-payment intents default to card (incl. Apple Pay / Google Pay via Payment Element),
 * not broad automatic_payment_methods, unless product policy + env opt-in allow alternatives.
 */
import type { Experience } from "@/lib/booking/types";
import type Stripe from "stripe";

/** When "1" or "true", server may enable automatic_payment_methods if the experience allows delayed/alternative methods. */
export function alternativePaymentMethodsEnvEnabled(): boolean {
  const v = process.env.BOOKING_ALLOW_ALTERNATIVE_PAYMENT_METHODS?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function experienceAllowsDelayedPaymentMethods(experience: Experience | null | undefined): boolean {
  return experience?.allowDelayedPaymentMethods === true;
}

/** True when full charge should use Stripe automatic_payment_methods (async-capable methods may appear). */
export function shouldUseAutomaticPaymentMethodsForFullCharge(opts: {
  payFullAmount: boolean;
  experience: Experience | null;
}): boolean {
  if (!opts.payFullAmount) return false;
  return alternativePaymentMethodsEnvEnabled() && experienceAllowsDelayedPaymentMethods(opts.experience);
}

export type BookingPaymentIntentMethodParams = Pick<
  Stripe.PaymentIntentCreateParams,
  "automatic_payment_methods" | "payment_method_types" | "setup_future_usage"
>;

/**
 * deposit: card + save for off-session final charge.
 * full: card-only by default; optional automatic methods when env + experience allow.
 */
export function buildBookingPaymentIntentMethodParams(opts: {
  payFullAmount: boolean;
  experience: Experience | null;
}): BookingPaymentIntentMethodParams {
  if (!opts.payFullAmount) {
    return {
      payment_method_types: ["card"],
      setup_future_usage: "off_session",
    };
  }
  if (shouldUseAutomaticPaymentMethodsForFullCharge(opts)) {
    return { automatic_payment_methods: { enabled: true } };
  }
  return { payment_method_types: ["card"] };
}
