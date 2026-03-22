/**
 * POST /api/booking/receipt — JSON body { receipt_token } (claim token `c.*` or booking receipt `r.*`).
 * GET — query receipt_token required. Session / payment_intent mint paths removed; use claim token from success_url / email.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { getSlotStartEnd, parseSlotId } from "@/lib/booking/experience-slots";
import { signReceiptToken, verifyReceiptToken, verifyReceiptClaimToken } from "@/lib/booking/receiptToken";
import { checkRateLimit, getClientKey } from "@/lib/booking/rate-limit";
import type { Booking, Slot, Boat, Rate, ExperienceAddon, Addon } from "@/lib/booking/types";
import type { Experience, ExperienceRate, BoatRate } from "@/lib/booking/types";
import { isDepositMode } from "@/lib/booking/deposit-mode";
import { getStripe } from "@/lib/booking/stripe-client";
import { tryResolvePendingReceiptViaCheckoutSession } from "@/lib/booking/receipt-checkout-resolution";
import { DEPOSIT_FRACTION } from "@/lib/booking/constants";

export async function GET(request: NextRequest) {
  const receiptTokenQuery = request.nextUrl.searchParams.get("receipt_token")?.trim() || null;
  if (!receiptTokenQuery) {
    return NextResponse.json(
      {
        error:
          "receipt_token is required. Use the link from your confirmation email or POST with body { receipt_token: \"...\" }.",
      },
      { status: 400 }
    );
  }
  const checkoutSessionId = request.nextUrl.searchParams.get("checkout_session_id")?.trim() || null;
  return handleReceipt(request, receiptTokenQuery, checkoutSessionId, null);
}

export async function POST(request: NextRequest) {
  let body: { receipt_token?: string; checkout_session_id?: string; payment_intent_id?: string } = {};
  try {
    body = await request.json();
  } catch {
    // invalid or empty body
  }
  const receiptToken = typeof body.receipt_token === "string" ? body.receipt_token.trim() || null : null;
  if (!receiptToken) {
    return NextResponse.json(
      { error: "receipt_token is required in the JSON body." },
      { status: 400 }
    );
  }
  const checkoutSessionId =
    typeof body.checkout_session_id === "string" ? body.checkout_session_id.trim() || null : null;
  const paymentIntentId =
    typeof body.payment_intent_id === "string" ? body.payment_intent_id.trim() || null : null;
  return handleReceipt(request, receiptToken, checkoutSessionId, paymentIntentId);
}

function paymentIntentIdsOnHold(hold: Record<string, unknown> | undefined): string[] {
  if (!hold) return [];
  const out: string[] = [];
  for (const k of ["depositPaymentIntentId", "fullPaymentIntentId", "paymentIntentId"] as const) {
    const v = hold[k];
    if (typeof v === "string" && v.trim()) out.push(v.trim());
  }
  const stripe = hold.stripe;
  if (stripe && typeof stripe === "object" && !Array.isArray(stripe)) {
    const st = stripe as { paymentIntentId?: string; depositPaymentIntentId?: string; finalPaymentIntentId?: string };
    for (const v of [st.paymentIntentId, st.depositPaymentIntentId, st.finalPaymentIntentId]) {
      if (typeof v === "string" && v.trim()) out.push(v.trim());
    }
  }
  return out;
}

async function handleReceipt(
  request: NextRequest,
  receiptToken: string,
  checkoutSessionId: string | null = null,
  paymentIntentId: string | null = null
) {
  try {
    const secret =
      process.env.RECEIPT_TOKEN_SECRET?.trim() || process.env.MANAGE_BOOKING_SECRET?.trim();
    if (!secret) {
      return NextResponse.json(
        {
          error:
            "Receipt and manage-booking links are temporarily unavailable. Please try again later or contact support.",
        },
        { status: 503 }
      );
    }

    const rl = await checkRateLimit(getClientKey(request));
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: rl.retryAfterMs != null ? { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } : undefined,
        }
      );
    }

    const db = getDb();
    let doc: import("firebase-admin/firestore").QueryDocumentSnapshot | null = null;
    let customerVerified = false;
    let resolvedViaClaim = false;

    const payload = verifyReceiptToken(receiptToken);
    if (payload) {
      const bookingSnap = await db.collection("bookings").doc(payload.bookingId).get();
      if (!bookingSnap.exists) {
        return NextResponse.json({ error: "Booking not found" }, { status: 404 });
      }
      doc = bookingSnap as import("firebase-admin/firestore").QueryDocumentSnapshot;
      customerVerified = true;
    } else {
      const claim = verifyReceiptClaimToken(receiptToken);
      if (claim) {
        let holdSnap = await db.collection("holds").doc(claim.holdId).get();
        if (!holdSnap.exists) {
          return NextResponse.json(
            { error: "Booking not found. If you just paid, please wait a moment and refresh." },
            { status: 404 }
          );
        }
        const holdRaw = holdSnap.data() as Record<string, unknown>;
        if (paymentIntentId) {
          const ids = paymentIntentIdsOnHold(holdRaw);
          if (ids.length === 0 || !ids.includes(paymentIntentId)) {
            return NextResponse.json(
              { error: "Receipt claim does not match this payment. Use the link from your confirmation email." },
              { status: 401 }
            );
          }
        }
        let holdData = holdRaw as { status?: string; bookingId?: string };
        if (holdData.status !== "converted" || !holdData.bookingId) {
          if (checkoutSessionId) {
            try {
              const stripe = getStripe();
              const resolved = await tryResolvePendingReceiptViaCheckoutSession(
                db,
                stripe,
                claim.holdId,
                checkoutSessionId
              );
              if (resolved.status === "converted") {
                holdSnap = await db.collection("holds").doc(claim.holdId).get();
                holdData = holdSnap.exists
                  ? (holdSnap.data() as { status?: string; bookingId?: string })
                  : holdData;
              }
            } catch (resolveErr) {
              console.error("[receipt] checkout session resolution failed", resolveErr);
            }
          }
          if (holdData.status !== "converted" || !holdData.bookingId) {
            return NextResponse.json({ pending: true }, { status: 202 });
          }
        }
        const bookingSnap = await db.collection("bookings").doc(holdData.bookingId).get();
        if (!bookingSnap.exists) {
          return NextResponse.json(
            { error: "Booking not found. If you just paid, please wait a moment and refresh." },
            { status: 404 }
          );
        }
        doc = bookingSnap as import("firebase-admin/firestore").QueryDocumentSnapshot;
        customerVerified = true;
        resolvedViaClaim = true;
      } else {
        return NextResponse.json({ error: "Invalid or expired receipt link" }, { status: 401 });
      }
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
      const rateSnap = await db
        .collection("experiences")
        .doc(booking.experienceId!)
        .collection("rates")
        .doc(booking.rateId)
        .get();
      slot = slotSnap.exists ? (slotSnap.data() as Slot) : null;
      rate = rateSnap.exists ? (rateSnap.data() as ExperienceRate) : null;
    } else if (hasExperience) {
      const expSnap = await db.collection("experiences").doc(booking.experienceId!).get();
      experienceName = expSnap.exists ? (expSnap.data() as Experience).title : "Charter";
      boatName = experienceName;
      const slotSnap = await db
        .collection("experiences")
        .doc(booking.experienceId!)
        .collection("slots")
        .doc(booking.slotId)
        .get();
      const rateSnap = await db
        .collection("experiences")
        .doc(booking.experienceId!)
        .collection("rates")
        .doc(booking.rateId)
        .get();
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
        const { start, end } = getSlotStartEnd(
          parsed.dateStr,
          parsed.startHour,
          parsed.durationHours,
          parsed.startMinute ?? 0
        );
        if (!Number.isNaN(start.getTime())) startAt = start.toISOString();
        if (!Number.isNaN(end.getTime())) endAt = end.toISOString();
      }
    }

    const addonSelectionsWithNames = await (async () => {
      if (!booking.addonSelections?.length) return [];
      const addonsRef = hasExperience
        ? db.collection("experiences").doc(booking.experienceId!).collection("addons")
        : db.collection("boats").doc(booking.boatId!).collection("addons");
      const addonsSnap = await addonsRef.get();
      const addonsById = new Map<string, ExperienceAddon | Addon>();
      addonsSnap.docs.forEach((d) => addonsById.set(d.id, d.data() as ExperienceAddon | Addon));
      return booking.addonSelections.map((sel) => ({
        addonId: sel.addonId,
        name: addonsById.get(sel.addonId)?.name ?? sel.addonId,
        qty: sel.qty,
      }));
    })();

    let discountLimitExceeded = false;
    const pendingRefundSnap = await db
      .collection("pendingRefunds")
      .where("bookingId", "==", doc.id)
      .where("reason", "==", "discount_limit_exceeded")
      .limit(1)
      .get();
    if (!pendingRefundSnap.empty) discountLimitExceeded = true;

    const durationHours = rate?.durationHours;
    const newReceiptToken = resolvedViaClaim ? signReceiptToken(doc.id) : undefined;

    const stripe = booking.stripe;
    const depositAmountCents = stripe?.depositAmountCents;
    const totalAmountCents = stripe?.totalAmountCents ?? booking.pricing.totalCents;

    const isDeposit = isDepositMode(booking);
    let mode: "event_deposit" | "event_full" | "state_fallback" | "state_fallback_deposit";
    let paidNowCents: number;
    if (isDeposit && typeof depositAmountCents === "number") {
      mode = "state_fallback_deposit";
      paidNowCents = depositAmountCents;
    } else if (isDeposit) {
      mode = "state_fallback_deposit";
      const stripePaid = stripe?.amountTotalCents;
      if (typeof stripePaid === "number" && stripePaid > 0) {
        paidNowCents = Math.min(stripePaid, totalAmountCents);
      } else {
        const fallbackDeposit = Math.round(totalAmountCents * DEPOSIT_FRACTION);
        console.warn("[receipt] depositAmountCents absent; using 50% heuristic for paidNowCents", {
          bookingId: doc.id,
          totalAmountCents,
          fallbackDeposit,
          stripeAmountTotalCents: stripePaid,
        });
        paidNowCents = fallbackDeposit;
      }
    } else {
      mode = "state_fallback";
      paidNowCents = totalAmountCents;
    }

    const paymentSummary: Record<string, unknown> = {
      mode,
      paidNowCents,
      totalAmountCents,
    };
    if (isDeposit && typeof depositAmountCents !== "number") {
      const recovered = typeof stripe?.amountTotalCents === "number" && stripe.amountTotalCents > 0;
      if (!recovered) paymentSummary.depositAmountIsEstimate = true;
    }
    if (depositAmountCents != null) paymentSummary.depositAmountCents = depositAmountCents;
    if (stripe?.finalAmountCents != null) paymentSummary.finalAmountCents = stripe.finalAmountCents;
    if (
      booking.finalChargeAt != null &&
      typeof (booking.finalChargeAt as { toDate?: () => Date }).toDate === "function"
    ) {
      paymentSummary.finalChargeAt = (booking.finalChargeAt as { toDate: () => Date }).toDate().toISOString();
    }

    const payloadOut: Record<string, unknown> = {
      bookingId: doc.id,
      ...(booking.experienceId ? { experienceId: booking.experienceId } : {}),
      boatName,
      experienceName,
      startAt,
      endAt,
      durationHours,
      addonSelections: addonSelectionsWithNames,
      pricing: booking.pricing,
      status: booking.status,
      paymentSummary,
      ...(discountLimitExceeded && { discountLimitExceeded: true }),
    };
    if (customerVerified) {
      payloadOut.customer = booking.customer;
      if (booking.answers != null) payloadOut.answers = booking.answers;
      if (booking.specialNotes != null) payloadOut.specialNotes = booking.specialNotes;
    }
    if (newReceiptToken) payloadOut.receiptToken = newReceiptToken;
    return NextResponse.json(payloadOut);
  } catch (err) {
    console.error("[receipt]", err);
    return NextResponse.json({ error: "Failed to load receipt" }, { status: 500 });
  }
}
