/**
 * Hosted Checkout success fallback: verify Stripe session + signed claim, then run the same
 * conversion path as complete-after-payment when webhooks are delayed.
 */

import type { Firestore } from "firebase-admin/firestore";
import type Stripe from "stripe";
import type { Hold } from "@/lib/booking/types";
import { ResolveAndConvertPaymentError, resolveAndConvertPayment } from "@/lib/booking/resolve-and-convert-payment";
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

  let result: Awaited<ReturnType<typeof resolveAndConvertPayment>>["result"];
  try {
    const conversion = await resolveAndConvertPayment(db, {
      paymentIntentId: pi.id,
      holdId: claimHoldId,
      source: "client",
      checkoutSession: session,
      checkoutSessionId: cs,
      paymentIntent: pi,
    });
    result = conversion.result;
  } catch (err) {
    if (err instanceof ResolveAndConvertPaymentError && err.kind === "PI_MATCH_FAILED") {
      bookingWarn("receipt", "PI does not match hold for checkout session recovery", {
        holdId: claimHoldId,
        checkoutSessionId: cs,
      });
      return { status: "still_pending" };
    }
    throw err;
  }
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
