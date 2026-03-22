/**
 * Shared PaymentIntent → convertHoldToBooking input resolution.
 * Keeps deposit vs full classification aligned across webhook, complete-after-payment, and admin sync.
 */

import type { Firestore, Timestamp as FirestoreTimestamp } from "firebase-admin/firestore";
import type Stripe from "stripe";
import type { ConvertHoldInput, ConvertHoldInputDeposit } from "@/lib/booking/convert-hold-to-booking";
import type { BookingCardDisplay } from "@/lib/booking/types";
import { HOLD_PAYMENT_ATTEMPT_VERSION_META } from "@/lib/booking/constants";

export type HoldPricingFallback = {
  pricing?: { totalCents?: number };
  tipCents?: number;
  discountCents?: number;
} | null;

const PLACEHOLDER_EMAIL_DOMAIN = "@pending.internal";

export function isPlaceholderCheckoutEmail(email: string | undefined | null): boolean {
  if (!email || typeof email !== "string") return false;
  return email.toLowerCase().endsWith(PLACEHOLDER_EMAIL_DOMAIN);
}

/**
 * Merge Stripe billing / receipt email over hold draft so PI-first webhooks do not persist checkout+…@pending.internal.
 * Returns undefined when nothing improves the canonical email (still placeholder or empty).
 */
export function customerOverrideFromPaymentIntent(
  pi: Stripe.PaymentIntent,
  holdDraft: { name: string; email: string; phone: string }
): { name: string; email: string; phone: string } | undefined {
  const pm = pi.payment_method as Stripe.PaymentMethod | string | null | undefined;
  const billing =
    pm && typeof pm === "object" && pm && "billing_details" in pm ? pm.billing_details : undefined;
  const stripeEmail = (billing?.email?.trim() || pi.receipt_email?.trim() || "") || "";
  const stripeName = billing?.name?.trim() || "";
  const stripePhone = billing?.phone?.trim() || "";

  const email = stripeEmail || holdDraft.email;
  const name = stripeName || holdDraft.name || "Guest";
  const phone = stripePhone || holdDraft.phone;

  if (isPlaceholderCheckoutEmail(email)) return undefined;

  if (
    email === holdDraft.email &&
    name === (holdDraft.name || "Guest") &&
    phone === holdDraft.phone
  ) {
    return undefined;
  }

  return { name, email, phone };
}

/** Same deposit vs full classification as {@link buildConvertHoldInputFromSucceededPaymentIntent} (metadata + amount vs total). */
export function resolveUsesDepositInputFromPaymentIntent(
  pi: Pick<Stripe.PaymentIntent, "metadata" | "amount">,
  holdPricingFallback: HoldPricingFallback
): boolean {
  const paymentStage = (pi.metadata?.payment_stage ?? "") as string;
  const totalCentsFromMeta = parseInt(pi.metadata?.totalCents ?? "0", 10) || 0;
  const amountCharged = pi.amount ?? 0;
  const isDepositByStage = paymentStage === "deposit";

  let totalCents: number;
  if (totalCentsFromMeta > 0) {
    totalCents = totalCentsFromMeta;
  } else if (holdPricingFallback?.pricing && typeof holdPricingFallback.pricing.totalCents === "number") {
    const tipCents = typeof holdPricingFallback.tipCents === "number" ? holdPricingFallback.tipCents : 0;
    const discountCents =
      typeof holdPricingFallback.discountCents === "number" ? holdPricingFallback.discountCents : 0;
    totalCents = Math.max(0, holdPricingFallback.pricing.totalCents + tipCents - discountCents);
  } else {
    totalCents = amountCharged;
  }

  const isDepositByAmount = totalCents > 0 && amountCharged > 0 && amountCharged < totalCents;
  return isDepositByStage || (paymentStage !== "full" && paymentStage !== "final" && isDepositByAmount);
}

export type HoldStripeIntentIds = {
  depositPaymentIntentId?: string;
  fullPaymentIntentId?: string;
  paymentAttemptVersion?: number;
};

/**
 * Ensures the succeeded PaymentIntent is the one recorded on the hold for the resolved payment stage,
 * and that the intent matches at least one hold record when any intent id is stored.
 * Aligns with complete-after-payment hold / PI enforcement.
 */
export function paymentIntentMatchesHoldForConversion(
  pi: Pick<Stripe.PaymentIntent, "id" | "metadata" | "amount">,
  hold: HoldStripeIntentIds,
  holdPricingFallback: HoldPricingFallback
): { ok: true } | { ok: false } {
  const useDeposit = resolveUsesDepositInputFromPaymentIntent(pi, holdPricingFallback);
  const dep = hold.depositPaymentIntentId;
  const full = hold.fullPaymentIntentId;
  const primary = useDeposit ? dep : full;
  if (primary && primary !== pi.id) {
    return { ok: false };
  }
  if ((dep || full) && dep !== pi.id && full !== pi.id) {
    return { ok: false };
  }

  const holdVer = typeof hold.paymentAttemptVersion === "number" ? hold.paymentAttemptVersion : 0;
  const piStr = pi.metadata?.[HOLD_PAYMENT_ATTEMPT_VERSION_META] ?? "";
  const piVer = piStr === "" ? NaN : parseInt(piStr, 10);

  if (holdVer >= 1) {
    if (!Number.isFinite(piVer) || piVer !== holdVer) {
      return { ok: false };
    }
  } else {
    // Legacy holds without paymentAttemptVersion: require at least one intent id on the hold
    // (race where ids are not yet written is handled by holdVer >= 1 + metadata match on new PIs).
    if (!dep && !full) {
      return { ok: false };
    }
  }
  return { ok: true };
}

export type HoldCheckoutGuardFields = HoldStripeIntentIds & { checkoutSessionId?: string };

/**
 * Pre-conversion guard for Checkout webhooks: when the hold already records a Checkout Session id
 * and/or PaymentIntent ids, the incoming session and PI must match (same rules as {@link paymentIntentMatchesHoldForConversion}).
 */
export function checkoutIncomingMismatchAgainstHold(
  sessionId: string,
  paymentIntentId: string | undefined,
  pi: Pick<Stripe.PaymentIntent, "id" | "metadata" | "amount"> | null,
  hold: HoldCheckoutGuardFields,
  holdPricingFallback: HoldPricingFallback
): { ok: true } | { ok: false; reason: "checkout_session_id_mismatch" | "payment_intent_mismatch" } {
  const authCs = hold.checkoutSessionId?.trim();
  if (authCs && authCs !== sessionId) {
    return { ok: false, reason: "checkout_session_id_mismatch" };
  }
  if (!paymentIntentId || !pi) {
    return { ok: true };
  }
  if (pi.id !== paymentIntentId) {
    return { ok: false, reason: "payment_intent_mismatch" };
  }
  if (!paymentIntentMatchesHoldForConversion(pi, hold, holdPricingFallback).ok) {
    return { ok: false, reason: "payment_intent_mismatch" };
  }
  return { ok: true };
}

export function buildConvertHoldInputFromSucceededPaymentIntent(
  pi: Stripe.PaymentIntent,
  holdPricingFallback: HoldPricingFallback,
  options?: { customerOverride?: { name: string; email: string; phone: string } }
): ConvertHoldInput {
  const customerId = typeof pi.customer === "string" ? pi.customer : pi.customer?.id;
  const pm = pi.payment_method as Stripe.PaymentMethod | string | null | undefined;
  let card: BookingCardDisplay | undefined;
  if (pm && typeof pm === "object" && pm.card && typeof pm.card === "object") {
    const c = pm.card;
    card = {
      brand: c.brand ?? undefined,
      last4: c.last4 ?? undefined,
      expMonth: c.exp_month ?? undefined,
      expYear: c.exp_year ?? undefined,
    };
  }
  const paymentMethodId = typeof pm === "object" && pm?.id ? pm.id : undefined;

  const totalCentsFromMeta = parseInt(pi.metadata?.totalCents ?? "0", 10) || 0;
  const amountCharged = pi.amount ?? 0;
  let totalCents: number;
  if (totalCentsFromMeta > 0) {
    totalCents = totalCentsFromMeta;
  } else if (holdPricingFallback?.pricing && typeof holdPricingFallback.pricing.totalCents === "number") {
    const tipCents = typeof holdPricingFallback.tipCents === "number" ? holdPricingFallback.tipCents : 0;
    const discountCents =
      typeof holdPricingFallback.discountCents === "number" ? holdPricingFallback.discountCents : 0;
    totalCents = Math.max(0, holdPricingFallback.pricing.totalCents + tipCents - discountCents);
  } else {
    totalCents = amountCharged;
  }
  const useDepositInput = resolveUsesDepositInputFromPaymentIntent(pi, holdPricingFallback);

  const baseFull = {
    paymentIntentId: pi.id,
    amountTotalCents: pi.amount ?? undefined,
    currency: pi.currency ?? undefined,
    ...(options?.customerOverride && { customerOverride: options.customerOverride }),
  };

  if (useDepositInput) {
    return {
      paymentStage: "deposit",
      paymentIntentId: pi.id,
      amountTotalCents: amountCharged,
      currency: pi.currency ?? undefined,
      ...(options?.customerOverride && { customerOverride: options.customerOverride }),
      stripe: {
        ...(customerId && { customerId }),
        ...(paymentMethodId && { paymentMethodId }),
        ...(card && { card }),
        totalCents,
        depositCents: amountCharged,
        finalCents: Math.max(0, totalCents - amountCharged),
      },
    } as ConvertHoldInputDeposit;
  }

  return baseFull;
}

/**
 * If payment_intent.succeeded created the booking with a direct-checkout placeholder email, patch from Checkout session details.
 */
export async function patchBookingCustomerIfPlaceholderFromCheckoutSession(
  db: Firestore,
  holdId: string,
  session: Stripe.Checkout.Session,
  updatedAt: FirestoreTimestamp
): Promise<void> {
  const holdSnap = await db.collection("holds").doc(holdId).get();
  if (!holdSnap.exists) return;
  const bookingId = (holdSnap.data() as { bookingId?: string }).bookingId;
  if (!bookingId) return;
  const bookingRef = db.collection("bookings").doc(bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists) return;
  const c = (bookingSnap.data() as { customer?: { email?: string; name?: string; phone?: string } }).customer;
  if (!c?.email || !isPlaceholderCheckoutEmail(c.email)) return;
  const d = session.customer_details;
  const name = (d?.name ?? "").trim() || c.name || "Guest";
  const email = (d?.email ?? "").trim();
  const phone = (d?.phone ?? "").trim() || c.phone || "";
  if (!email || isPlaceholderCheckoutEmail(email)) return;
  await bookingRef.update({
    customer: { name, email, phone },
    updatedAt,
  });
}
