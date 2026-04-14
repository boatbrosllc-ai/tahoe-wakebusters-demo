import type { Firestore } from "firebase-admin/firestore";
import type Stripe from "stripe";
import {
  convertHoldToBooking,
  isConvertHoldInputDeposit,
  type ConvertHoldInput,
  type ConvertHoldResult,
  type ConvertHoldToBookingOptions,
} from "@/lib/booking/convert-hold-to-booking";
import {
  buildConvertHoldInputFromSucceededPaymentIntent,
  customerOverrideFromPaymentIntent,
} from "@/lib/booking/stripe-payment-intent-convert";
import type { Hold } from "@/lib/booking/types";

export type PaymentContext = {
  paymentIntentId: string;
  holdId: string;
  amountTotalCents?: number;
  currency?: string;
  source: "checkout_webhook" | "pi_webhook" | "client";
  customerOverride?: { name: string; email: string; phone: string };
  specialNotes?: string;
  checkoutSessionId?: string;
  checkoutSession?: Stripe.Checkout.Session;
  paymentIntent?: Stripe.PaymentIntent;
  /** Admin sync: allow conversion when hold has expired but payment succeeded. */
  forceExpiredConversion?: boolean;
};

export type ConvertResult = {
  hold: Hold;
  convertInput: ConvertHoldInput;
  paymentSummary: {
    isDeposit: boolean;
    totalCents: number;
    depositCents: number;
    finalCents: number;
  };
  result: ConvertHoldResult;
};

export type ResolveAndConvertPaymentErrorKind = "PI_MISMATCH" | "PI_MATCH_FAILED";

export class ResolveAndConvertPaymentError extends Error {
  readonly kind: ResolveAndConvertPaymentErrorKind;

  constructor(kind: ResolveAndConvertPaymentErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = "ResolveAndConvertPaymentError";
  }
}

export async function resolveAndConvertPayment(
  db: Firestore,
  context: PaymentContext
): Promise<ConvertResult> {
  const holdSnap = await db.collection("holds").doc(context.holdId).get();
  if (!holdSnap.exists) {
    throw new Error("Hold not found");
  }
  const hold = holdSnap.data() as Hold;
  const holdForPricing = {
    pricing: hold.pricing,
    tipCents: (hold as { tipCents?: number }).tipCents,
    discountCents: (hold as { discountCents?: number }).discountCents,
  };
  let pi = context.paymentIntent;
  if (!pi && context.checkoutSession && context.checkoutSession.payment_intent) {
    if (typeof context.checkoutSession.payment_intent === "object") {
      pi = context.checkoutSession.payment_intent as Stripe.PaymentIntent;
    } else {
      pi = await (await import("@/lib/booking/stripe-client")).getStripe().paymentIntents.retrieve(
        context.checkoutSession.payment_intent,
        { expand: ["payment_method"] }
      );
    }
  }
  if (!pi) {
    pi = await (await import("@/lib/booking/stripe-client")).getStripe().paymentIntents.retrieve(
      context.paymentIntentId,
      { expand: ["payment_method"] }
    );
  }
  if (pi && typeof pi.payment_method === "string") {
    pi = await (await import("@/lib/booking/stripe-client")).getStripe().paymentIntents.retrieve(
      pi.id,
      { expand: ["payment_method"] }
    );
  }
  if (!pi || pi.id !== context.paymentIntentId) {
    throw new ResolveAndConvertPaymentError("PI_MISMATCH", "Payment intent mismatch");
  }

  const holdDraft = hold.customerDraft ?? { name: "", email: "", phone: "" };
  const derivedOverride = context.customerOverride ?? customerOverrideFromPaymentIntent(pi, holdDraft);
  const convertInputBase = await buildConvertHoldInputFromSucceededPaymentIntent(
    pi,
    holdForPricing,
    derivedOverride ? { customerOverride: derivedOverride } : undefined
  );
  const convertInput: ConvertHoldInput = {
    ...convertInputBase,
    ...(context.amountTotalCents != null ? { amountTotalCents: context.amountTotalCents } : {}),
    ...(context.currency ? { currency: context.currency } : {}),
    ...(context.specialNotes ? { specialNotesOverride: context.specialNotes } : {}),
    ...(context.checkoutSessionId ? { checkoutSessionId: context.checkoutSessionId } : {}),
  };
  const isDeposit = isConvertHoldInputDeposit(convertInput);
  const totalCents = isDeposit
    ? (convertInput as Extract<ConvertHoldInput, { paymentStage: "deposit" }>).stripe.totalCents
    : parseInt(pi.metadata?.totalCents ?? "0", 10) || (pi.amount ?? 0);
  const depositCents = isDeposit ? (pi.amount ?? 0) : totalCents;
  const finalCents = Math.max(0, totalCents - depositCents);
  const convertOpts: ConvertHoldToBookingOptions | undefined =
    context.forceExpiredConversion === true ? { graceVerifiedForConversion: true } : undefined;
  let result: ConvertHoldResult;
  try {
    result = await convertHoldToBooking(db, context.holdId, convertInput, convertOpts);
  } catch (err) {
    if (err instanceof Error && err.message === "Payment intent does not match hold") {
      throw new ResolveAndConvertPaymentError("PI_MATCH_FAILED", "Payment intent does not match hold");
    }
    throw err;
  }
  return {
    hold,
    convertInput,
    paymentSummary: {
      isDeposit,
      totalCents,
      depositCents,
      finalCents,
    },
    result,
  };
}

