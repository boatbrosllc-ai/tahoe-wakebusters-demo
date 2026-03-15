import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/booking/stripe-client";
import { getDb } from "@/lib/booking/firebase-admin";
import { getSlotStartEnd, parseSlotId } from "@/lib/booking/experience-slots";
import { signReceiptToken, verifyReceiptToken } from "@/lib/booking/receiptToken";
import { checkRateLimit, getClientKey } from "@/lib/booking/rate-limit";
import type { Booking, Slot, Boat, Rate } from "@/lib/booking/types";
import type { Experience, ExperienceRate, BoatRate } from "@/lib/booking/types";
import type { BookingStatus } from "@/lib/booking/types";

/** Deposit-related statuses: booking is in deposit flow (deposit paid or final balance due/paid). */
const DEPOSIT_STATUSES: ReadonlySet<BookingStatus> = new Set<BookingStatus>([
  "deposit_paid",
  "final_due",
  "final_processing",
  "final_paid",
  "final_requires_action",
  "final_failed",
]);

/**
 * True when the booking is a deposit booking: stripe has split fields (depositAmountCents)
 * and booking status indicates deposit flow. Used for mode selection so we don't treat
 * full-paid or legacy records as deposit when split fields persist.
 */
function isDepositBooking(booking: Booking): boolean {
  const stripe = booking.stripe;
  if (stripe?.depositAmountCents == null) return false;
  return DEPOSIT_STATUSES.has(booking.status);
}

export async function GET(request: NextRequest) {
  try {
    const rl = await checkRateLimit(getClientKey(request));
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rl.retryAfterMs != null ? { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } : undefined }
      );
    }

    const receiptToken = request.nextUrl.searchParams.get("receipt_token");
    const sessionId = request.nextUrl.searchParams.get("session_id");
    const paymentIntentId = request.nextUrl.searchParams.get("payment_intent_id");

    const db = getDb();
    let doc: import("firebase-admin/firestore").QueryDocumentSnapshot | null = null;
    /** True only when the caller authenticated via signed receipt_token; used to gate customer PII. */
    let customerVerified = false;
    let session: { amount_total: number | null } | null = null;
    let pi: { amount: number } | null = null;

    if (receiptToken) {
      const payload = verifyReceiptToken(receiptToken);
      if (!payload) {
        return NextResponse.json({ error: "Invalid or expired receipt link" }, { status: 401 });
      }
      const bookingSnap = await db.collection("bookings").doc(payload.bookingId).get();
      if (!bookingSnap.exists) {
        return NextResponse.json({ error: "Booking not found" }, { status: 404 });
      }
      doc = bookingSnap as import("firebase-admin/firestore").QueryDocumentSnapshot;
      customerVerified = true;
    } else if (sessionId) {
      const stripe = getStripe();
      const s = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["line_items"] });
      session = s;
      if (!s.payment_status || s.payment_status !== "paid") {
        return NextResponse.json({ error: "Session not paid" }, { status: 400 });
      }
      const bookingsSnap = await db
        .collection("bookings")
        .where("stripe.checkoutSessionId", "==", sessionId)
        .limit(1)
        .get();
      if (!bookingsSnap.empty) {
        doc = bookingsSnap.docs[0];
      }
    } else if (paymentIntentId) {
      const stripe = getStripe();
      const p = await stripe.paymentIntents.retrieve(paymentIntentId);
      pi = p;
      if (p.status !== "succeeded") {
        return NextResponse.json({ error: "Booking not found" }, { status: 404 });
      }
      const byPi = await db
        .collection("bookings")
        .where("stripe.paymentIntentId", "==", paymentIntentId)
        .limit(1)
        .get();
      if (!byPi.empty) {
        doc = byPi.docs[0];
      } else {
        const byDepositPi = await db
          .collection("bookings")
          .where("stripe.depositPaymentIntentId", "==", paymentIntentId)
          .limit(1)
          .get();
        if (!byDepositPi.empty) {
          doc = byDepositPi.docs[0];
        }
      }
    }

    if (!receiptToken && !sessionId && !paymentIntentId) {
      return NextResponse.json(
        { error: "receipt_token, session_id, or payment_intent_id required" },
        { status: 400 }
      );
    }

    if (!doc) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const booking = doc.data() as Booking;
    const hasExperience = !!booking.experienceId;
    const hasBoat = !!booking.boatId;
    const isListingBoatFlow = hasExperience && hasBoat;
    let experienceName: string;
    let boatName: string;
    let slot: Slot | null = null;
    let rate: Rate | ExperienceRate | BoatRate | null = null;
    if (isListingBoatFlow) {
      const expSnap = await db.collection("experiences").doc(booking.experienceId!).get();
      experienceName = expSnap.exists ? (expSnap.data() as Experience).title : "Charter";
      const boatSnap = await db.collection("boats").doc(booking.boatId!).get();
      boatName = boatSnap.exists ? (boatSnap.data() as { name?: string }).name ?? experienceName : experienceName;
      const slotSnap = await db.collection("boats").doc(booking.boatId!).collection("slots").doc(booking.slotId).get();
      const rateSnap = await db.collection("experiences").doc(booking.experienceId!).collection("rates").doc(booking.rateId).get();
      slot = slotSnap.exists ? (slotSnap.data() as Slot) : null;
      rate = rateSnap.exists ? (rateSnap.data() as ExperienceRate) : null;
    } else if (hasExperience) {
      const expSnap = await db.collection("experiences").doc(booking.experienceId!).get();
      experienceName = expSnap.exists ? (expSnap.data() as Experience).title : "Charter";
      boatName = experienceName;
      const slotSnap = await db.collection("experiences").doc(booking.experienceId!).collection("slots").doc(booking.slotId).get();
      const rateSnap = await db.collection("experiences").doc(booking.experienceId!).collection("rates").doc(booking.rateId).get();
      slot = slotSnap.exists ? (slotSnap.data() as Slot) : null;
      rate = rateSnap.exists ? (rateSnap.data() as ExperienceRate) : null;
    } else {
      const boatSnap = await db.collection("boats").doc(booking.boatId!).get();
      boatName = boatSnap.exists ? (boatSnap.data() as Boat).name : "Charter";
      experienceName = boatName;
      const slotSnap = await db.collection("boats").doc(booking.boatId!).collection("slots").doc(booking.slotId).get();
      const rateSnap = await db.collection("boats").doc(booking.boatId!).collection("rates").doc(booking.rateId).get();
      slot = slotSnap.exists ? (slotSnap.data() as Slot) : null;
      rate = rateSnap.exists ? (rateSnap.data() as Rate) : null;
    }
    // For shared-ticketed bookings no slot doc is written to Firestore — fall back to computing
    // start/end from the slotId so the success page and receipt show the correct time.
    let startAt: string | null = null;
    let endAt: string | null = null;
    if (slot?.startAt) {
      const d = (slot.startAt as { toDate(): Date }).toDate();
      if (!Number.isNaN(d.getTime())) startAt = d.toISOString();
    }
    if (slot?.endAt) {
      const d = (slot.endAt as { toDate(): Date }).toDate();
      if (!Number.isNaN(d.getTime())) endAt = d.toISOString();
    }
    if ((!startAt || !endAt) && booking.slotId) {
      const parsed = parseSlotId(booking.slotId);
      if (parsed) {
        const { start, end } = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute ?? 0);
        if (!Number.isNaN(start.getTime())) startAt = start.toISOString();
        if (!Number.isNaN(end.getTime())) endAt = end.toISOString();
      }
    }

    const durationHours = rate?.durationHours;
    const newReceiptToken =
      !receiptToken
        ? signReceiptToken(doc.id)
        : undefined;

    const stripe = booking.stripe;
    const depositAmountCents = stripe?.depositAmountCents;
    const hasEvent = (sessionId && session) || (paymentIntentId && pi);
    const eventAmount =
      (session?.amount_total != null ? session.amount_total : pi?.amount) ?? 0;
    const totalAmountCents = stripe?.totalAmountCents ?? booking.pricing.totalCents;

    const isDeposit = isDepositBooking(booking);
    let mode: "event_deposit" | "event_full" | "state_fallback" | "state_fallback_deposit";
    let paidNowCents: number;
    if (isDeposit && hasEvent) {
      mode = "event_deposit";
      paidNowCents = eventAmount;
    } else if (hasEvent) {
      mode = "event_full";
      paidNowCents = eventAmount;
    } else if (isDeposit && typeof depositAmountCents === "number") {
      mode = "state_fallback_deposit";
      paidNowCents = depositAmountCents;
    } else {
      mode = "state_fallback";
      paidNowCents = totalAmountCents;
    }

    const paymentSummary: Record<string, unknown> = {
      mode,
      paidNowCents,
      totalAmountCents,
    };
    if (depositAmountCents != null) paymentSummary.depositAmountCents = depositAmountCents;
    if (stripe?.finalAmountCents != null) paymentSummary.finalAmountCents = stripe.finalAmountCents;
    if (booking.finalChargeAt != null && typeof (booking.finalChargeAt as { toDate?: () => Date }).toDate === "function") {
      paymentSummary.finalChargeAt = (booking.finalChargeAt as { toDate: () => Date }).toDate().toISOString();
    }

    const payload: Record<string, unknown> = {
      bookingId: doc.id,
      boatName,
      experienceName,
      startAt,
      endAt,
      durationHours,
      addonSelections: booking.addonSelections,
      pricing: booking.pricing,
      status: booking.status,
      paymentSummary,
    };
    if (customerVerified) payload.customer = booking.customer;
    if (newReceiptToken) payload.receiptToken = newReceiptToken;
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[receipt]", err);
    return NextResponse.json({ error: "Failed to load receipt" }, { status: 500 });
  }
}
