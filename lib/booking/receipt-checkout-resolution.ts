/**
 * Hosted Checkout success fallback: verify Stripe session + signed claim, then run the same
 * conversion path as complete-after-payment when webhooks are delayed.
 */

import type { Firestore } from "firebase-admin/firestore";
import type Stripe from "stripe";
import type { Hold } from "@/lib/booking/types";
import {
  buildConvertHoldInputFromSucceededPaymentIntent,
  customerOverrideFromPaymentIntent,
  paymentIntentMatchesHoldForConversion,
} from "@/lib/booking/stripe-payment-intent-convert";
import {
  convertHoldToBooking,
  isConvertHoldInputDeposit,
  type ConvertHoldInput,
} from "@/lib/booking/convert-hold-to-booking";
import { bookingWarn } from "@/lib/booking/debug";

export async function tryResolvePendingReceiptViaCheckoutSession(
  db: Firestore,
  stripe: Stripe,
  claimHoldId: string,
  checkoutSessionId: string
): Promise<
  { status: "converted"; bookingId: string } | { status: "still_pending" } | { status: "invalid_session" }
> {
  const cs = checkoutSessionId.trim();
  if (!cs) return { status: "invalid_session" };
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(cs, {
      expand: ["payment_intent", "payment_intent.payment_method"],
    });
  } catch {
    return { status: "invalid_session" };
  }
  if (session.metadata?.holdId?.trim() !== claimHoldId) {
    return { status: "invalid_session" };
  }

  const holdSnap = await db.collection("holds").doc(claimHoldId).get();
  if (!holdSnap.exists) return { status: "invalid_session" };
  const holdRow = holdSnap.data() as Hold;
  const authCs = holdRow.checkoutSessionId?.trim();
  if (authCs && authCs !== cs) {
    return { status: "invalid_session" };
  }

  if (session.payment_status !== "paid") return { status: "still_pending" };

  const pi =
    typeof session.payment_intent === "object" && session.payment_intent && "id" in session.payment_intent
      ? (session.payment_intent as Stripe.PaymentIntent)
      : null;
  if (!pi || pi.status !== "succeeded") return { status: "still_pending" };

  const holdForPricing = {
    pricing: holdRow.pricing,
    tipCents: (holdRow as { tipCents?: number }).tipCents,
    discountCents: (holdRow as { discountCents?: number }).discountCents,
  };
  const holdStripeIds = {
    depositPaymentIntentId: holdRow.depositPaymentIntentId,
    fullPaymentIntentId: holdRow.fullPaymentIntentId,
    paymentAttemptVersion: holdRow.paymentAttemptVersion,
  };
  if (!paymentIntentMatchesHoldForConversion(pi, holdStripeIds, holdForPricing).ok) {
    bookingWarn("receipt", "PI does not match hold for checkout session recovery", {
      holdId: claimHoldId,
      checkoutSessionId: cs,
    });
    return { status: "still_pending" };
  }

  const holdDraft = holdRow.customerDraft ?? { name: "", email: "", phone: "" };
  const customerOverridePi = customerOverrideFromPaymentIntent(pi, holdDraft);
  const convertInput: ConvertHoldInput = buildConvertHoldInputFromSucceededPaymentIntent(
    pi,
    holdForPricing,
    customerOverridePi ? { customerOverride: customerOverridePi } : undefined
  );
  if (!isConvertHoldInputDeposit(convertInput)) {
    (convertInput as { checkoutSessionId?: string }).checkoutSessionId = cs;
  }

  const result = await convertHoldToBooking(db, claimHoldId, convertInput);
  if ("amountIntegrityMismatch" in result) {
    return { status: "still_pending" };
  }
  if ("bookingId" in result) {
    return { status: "converted", bookingId: result.bookingId };
  }
  if ("alreadyConverted" in result) {
    const bid = holdRow.bookingId;
    if (bid) return { status: "converted", bookingId: bid };
  }
  return { status: "still_pending" };
}
