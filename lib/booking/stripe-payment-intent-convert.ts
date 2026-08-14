/**
 * Shared PaymentIntent → convertHoldToBooking input resolution.
 * Keeps deposit vs full classification aligned across webhook, complete-after-payment, and admin sync.
 */

import type { Firestore, Timestamp as FirestoreTimestamp } from "firebase-admin/firestore";
import type Stripe from "stripe";
import type { ConvertHoldInput, ConvertHoldInputDeposit } from "@/lib/booking/convert-hold-to-booking";
import type { BookingCardDisplay } from "@/lib/booking/types";
import { HOLD_PAYMENT_ATTEMPT_VERSION_META } from "@/lib/booking/constants";
import { DEPOSIT_FRACTION } from "@/lib/booking/constants";
import { computeFinalChargeTotalCentsFromHoldPricing } from "@/lib/booking/hold-pricing-final-total";
import { bookingWarn } from "@/lib/booking/debug";
import type { BookingPricing } from "@/lib/booking/types";

export type HoldPricingFallback = {
  pricing?: { totalCents?: number };
  tipCents?: number;
  discountCents?: number;
} | null;
type OperationalAlertPayload = {
  type: string;
  severity?: string;
  requiresManualReview?: boolean;
  paymentIntentIdPrefix?: string;
  totalCents?: number;
  amountCharged?: number;
  ratio?: number;
  source: string;
  message: string;
  [key: string]: unknown;
};

type DepositClassification = {
  useDepositInput: boolean;
  requiresManualReview: boolean;
  operationalAlert?: OperationalAlertPayload;
};

const PLACEHOLDER_EMAIL_DOMAIN = "@pending.internal";
const DEPOSIT_RATIO_EPSILON = 0.02;

export function isPlaceholderCheckoutEmail(email: string | undefined | null): boolean {
  if (!email || typeof email !== "string") return false;
  const e = email.trim().toLowerCase();
  return e.endsWith(PLACEHOLDER_EMAIL_DOMAIN) || e === "checkout@pending.local";
}

/**
 * Merge Stripe billing / receipt details with the hold draft for PI-first conversion (webhook or complete-after-payment).
 * When the hold already has a real guest email, that address wins: card billing / receipt_email often belongs to a
 * company or account holder (e.g. the operator configured in site config) and must not replace the email the guest entered on the booking form.
 * Stripe values still replace internal checkout placeholders (…@pending.internal, checkout@pending.local).
 * Returns undefined when the resolved customer matches the hold draft (no override needed).
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

  const holdEmailTrimmed = (holdDraft.email ?? "").trim();
  const email =
    holdEmailTrimmed && !isPlaceholderCheckoutEmail(holdEmailTrimmed)
      ? holdEmailTrimmed
      : stripeEmail || holdEmailTrimmed;
  const name = stripeName || holdDraft.name || "Guest";
  const phone = stripePhone || holdDraft.phone;

  if (isPlaceholderCheckoutEmail(email)) return undefined;

  const holdNameNorm = (holdDraft.name || "Guest").trim();
  if (
    email === holdEmailTrimmed &&
    name === holdNameNorm &&
    phone === holdDraft.phone
  ) {
    return undefined;
  }

  return { name, email, phone };
}

/**
 * Merge Stripe Checkout `customer_details` with the hold draft (checkout.session.completed path).
 * When the hold already has a real guest email, that address wins: `customer_details.email` often reflects
 * the Stripe account or card holder (e.g. business inbox) and must not replace the email from the booking form.
 * Placeholder hold emails still resolve from Checkout. Same rules as {@link customerOverrideFromPaymentIntent}.
 */
export function customerOverrideFromCheckoutSession(
  session: Pick<Stripe.Checkout.Session, "customer_details">,
  holdDraft: { name: string; email: string; phone: string }
): { name: string; email: string; phone: string } | undefined {
  const d = session.customer_details;
  const stripeEmail = (d?.email ?? "").trim() || "";
  const stripeName = (d?.name ?? "").trim() || "";
  const stripePhone = (d?.phone ?? "").trim() || "";

  const holdEmailTrimmed = (holdDraft.email ?? "").trim();
  const email =
    holdEmailTrimmed && !isPlaceholderCheckoutEmail(holdEmailTrimmed)
      ? holdEmailTrimmed
      : stripeEmail || holdEmailTrimmed;
  const name = stripeName || holdDraft.name || "Guest";
  const phone = stripePhone || holdDraft.phone;

  if (isPlaceholderCheckoutEmail(email)) return undefined;

  const holdNameNorm = (holdDraft.name || "Guest").trim();
  if (email === holdEmailTrimmed && name === holdNameNorm && phone === holdDraft.phone) {
    return undefined;
  }

  return { name, email, phone };
}

/** Same deposit vs full classification as {@link buildConvertHoldInputFromSucceededPaymentIntent} (metadata + amount vs total). */
export function resolveUsesDepositInputFromPaymentIntent(
  pi: Pick<Stripe.PaymentIntent, "metadata" | "amount"> & { id?: string },
  holdPricingFallback: HoldPricingFallback
): boolean {
  return resolveDepositClassificationFromPaymentIntent(pi, holdPricingFallback).useDepositInput;
}

function resolveDepositClassificationFromPaymentIntent(
  pi: Pick<Stripe.PaymentIntent, "metadata" | "amount"> & { id?: string },
  holdPricingFallback: HoldPricingFallback
): DepositClassification {
  const paymentStageRaw = (pi.metadata?.payment_stage ?? "") as string;
  const paymentStage = paymentStageRaw.trim();
  const totalCentsFromMeta = parseInt(pi.metadata?.totalCents ?? "0", 10) || 0;
  const amountCharged = pi.amount ?? 0;

  let totalCents: number;
  if (totalCentsFromMeta > 0) {
    totalCents = totalCentsFromMeta;
  } else if (holdPricingFallback?.pricing && typeof holdPricingFallback.pricing.totalCents === "number") {
    const tipCents = typeof holdPricingFallback.tipCents === "number" ? holdPricingFallback.tipCents : 0;
    const discountCents =
      typeof holdPricingFallback.discountCents === "number" ? holdPricingFallback.discountCents : 0;
    totalCents = computeFinalChargeTotalCentsFromHoldPricing(
      holdPricingFallback.pricing as BookingPricing,
      tipCents,
      discountCents
    );
  } else {
    totalCents = amountCharged;
  }

  if (
    holdPricingFallback == null &&
    paymentStage === "" &&
    totalCentsFromMeta <= 0
  ) {
    bookingWarn("convert-hold", "deposit vs full: no totalCents metadata and no hold pricing — defaulting to full payment (avoid amount ratio heuristic)", {
      paymentIntentIdPrefix: typeof pi.id === "string" ? pi.id.slice(0, 12) : undefined,
    });
    return { useDepositInput: false, requiresManualReview: false };
  }

  if (paymentStage === "deposit") return { useDepositInput: true, requiresManualReview: false };
  if (paymentStage === "full" || paymentStage === "final") return { useDepositInput: false, requiresManualReview: false };

  if (paymentStage !== "") {
    return { useDepositInput: false, requiresManualReview: false };
  }

  if (holdPricingFallback == null) {
    bookingWarn("convert-hold", "deposit vs full: no hold pricing context (classifying as full payment)", {
      paymentIntentIdPrefix: typeof pi.id === "string" ? pi.id.slice(0, 12) : undefined,
      totalCentsFromMeta,
      amountCharged,
    });
    return { useDepositInput: false, requiresManualReview: false };
  }

  const ratio = totalCents > 0 ? amountCharged / totalCents : 0;
  const ratioLooksLikeDeposit = Math.abs(ratio - DEPOSIT_FRACTION) <= DEPOSIT_RATIO_EPSILON;
  if (ratioLooksLikeDeposit) {
    return {
      useDepositInput: true,
      requiresManualReview: true,
      operationalAlert: {
        type: "deposit_vs_full_missing_payment_stage_metadata_manual_review",
        severity: "critical",
        requiresManualReview: true,
        paymentIntentIdPrefix: typeof pi.id === "string" ? pi.id.slice(0, 12) : undefined,
        totalCents,
        amountCharged,
        ratio,
        source: "resolveUsesDepositInputFromPaymentIntent",
        message:
          "payment_stage metadata missing; amount ratio matched deposit fraction and was classified as deposit. Manual verification required.",
      },
    };
  }

  return {
    useDepositInput: false,
    requiresManualReview: false,
    operationalAlert: {
      type: "deposit_vs_full_missing_payment_stage_metadata",
      paymentIntentIdPrefix: typeof pi.id === "string" ? pi.id.slice(0, 12) : undefined,
      totalCents,
      amountCharged,
      source: "resolveUsesDepositInputFromPaymentIntent",
      message:
        "payment_stage metadata absent on PaymentIntent; defaulting to full payment (avoids misclassifying full as deposit).",
    },
  };
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
export type PaymentIntentHoldMatchOptions = {
  /** Firestore holds/{id}. When set, allows a brief race where PI succeeded but deposit/full IDs are not on the hold yet. */
  holdDocId?: string;
};

export function paymentIntentMatchesHoldForConversion(
  pi: Pick<Stripe.PaymentIntent, "id" | "metadata" | "amount">,
  hold: HoldStripeIntentIds,
  holdPricingFallback: HoldPricingFallback,
  options?: PaymentIntentHoldMatchOptions
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
  if (holdVer >= 1 && !dep && !full) {
    const doc = options?.holdDocId?.trim() ?? "";
    const metaHold = typeof pi.metadata?.holdId === "string" ? pi.metadata.holdId.trim() : "";
    if (doc && metaHold && metaHold === doc) {
      bookingWarn("convert-hold", "hold PI fields not persisted yet; metadata holdId matches doc — allowing conversion guard", {
        paymentIntentIdPrefix: typeof pi.id === "string" ? pi.id.slice(0, 12) : undefined,
        holdVer,
      });
      return { ok: true };
    }
    return { ok: false };
  }

  const piStr = pi.metadata?.[HOLD_PAYMENT_ATTEMPT_VERSION_META] ?? "";
  const piVer = piStr === "" ? NaN : parseInt(piStr, 10);

  if (holdVer >= 1) {
    if (!Number.isFinite(piVer) || piVer !== holdVer) {
      /**
       * Hold documents authoritatively record the PI id for this attempt. Metadata `holdPaymentAttemptVersion`
       * can be missing (older Stripe tooling), lost on some flows, or briefly stale vs Firestore after a bump
       * while the same PI id remains on the hold — blocking here caused paid customers to stuck in
       * conversion_failed / reconciliation with no booking.
       */
      const piIdMatchesHoldRecord = dep === pi.id || full === pi.id;
      if (piIdMatchesHoldRecord) {
        bookingWarn("convert-hold", "PI holdPaymentAttemptVersion metadata vs hold mismatch; PI id matches hold — allowing conversion", {
          paymentIntentIdPrefix: typeof pi.id === "string" ? pi.id.slice(0, 12) : undefined,
          holdVer,
          piMetaVer: Number.isFinite(piVer) ? piVer : null,
        });
        return { ok: true };
      }
      return { ok: false };
    }
  } else {
    /**
     * @deprecated Legacy holds without paymentAttemptVersion — remove this branch once all holds have
     * paymentAttemptVersion >= 1 in production (see HOLD_PAYMENT_ATTEMPT_VERSION_META).
     */
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

export async function buildConvertHoldInputFromSucceededPaymentIntent(
  pi: Stripe.PaymentIntent,
  holdPricingFallback: HoldPricingFallback,
  options?: { customerOverride?: { name: string; email: string; phone: string } }
): Promise<ConvertHoldInput> {
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
    totalCents = computeFinalChargeTotalCentsFromHoldPricing(
      holdPricingFallback.pricing as BookingPricing,
      tipCents,
      discountCents
    );
  } else {
    totalCents = amountCharged;
  }
  const classification = resolveDepositClassificationFromPaymentIntent(pi, holdPricingFallback);
  const useDepositInput = classification.useDepositInput;
  if (classification.operationalAlert) {
    const { writeOperationalAlert } = await import("@/lib/booking/operational-alerts");
    await writeOperationalAlert(classification.operationalAlert);
  }

  const baseFull = {
    paymentIntentId: pi.id,
    ...(classification.requiresManualReview ? { requiresManualReview: true } : {}),
    amountTotalCents: pi.amount ?? undefined,
    currency: pi.currency ?? undefined,
    ...(options?.customerOverride && { customerOverride: options.customerOverride }),
  };

  if (useDepositInput) {
    return {
      paymentStage: "deposit",
      ...(classification.requiresManualReview ? { requiresManualReview: true } : {}),
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
): Promise<boolean> {
  const holdSnap = await db.collection("holds").doc(holdId).get();
  if (!holdSnap.exists) return false;
  const bookingId = (holdSnap.data() as { bookingId?: string }).bookingId;
  if (!bookingId) return false;
  const bookingRef = db.collection("bookings").doc(bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists) return false;
  const c = (bookingSnap.data() as { customer?: { email?: string; name?: string; phone?: string } }).customer;
  // When customer email is already non-placeholder (or missing), there's nothing to patch.
  if (!c?.email || !isPlaceholderCheckoutEmail(c.email)) return true;
  const d = session.customer_details;
  const name = (d?.name ?? "").trim() || c.name || "Guest";
  const email = (d?.email ?? "").trim();
  const phone = (d?.phone ?? "").trim() || c.phone || "";
  // If Checkout didn't provide a real email (or provided placeholder), we can't complete the patch.
  if (!email || isPlaceholderCheckoutEmail(email)) return false;
  await bookingRef.update({
    customer: { name, email, phone },
    updatedAt,
  });
  return true;
}
