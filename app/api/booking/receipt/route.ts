/**
 * POST /api/booking/receipt — JSON body { receipt_token } (signed claim `c.*` or booking receipt `r.*`),
 * or when RECEIPT_TOKEN_SECRET is unset: { payment_intent_id } (resolved via Stripe + hold metadata).
 * GET — query receipt_token, or payment_intent_id when receipt signing is disabled.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { getSlotStartEnd, parseSlotId, parseSlotIdRelaxed } from "@/lib/booking/experience-slots";
import {
  signReceiptToken,
  verifyReceiptToken,
  verifyReceiptClaimToken,
  verifyReceiptClaimTokenIgnoreExpiry,
  type ReceiptClaimPayload,
} from "@/lib/booking/receiptToken";
import { hasReceiptTokenSecretConfigured } from "@/lib/booking/receipt-token-secret";
import { checkRateLimitPostPayment, getClientKey } from "@/lib/booking/rate-limit";
import { bookingNotReadyResponse, legacyFallbackUnsafeResponse } from "@/lib/booking/booking-readiness-response";
import type { Booking, Slot, Boat, Rate, ExperienceAddon, Addon } from "@/lib/booking/types";
import type { Experience, ExperienceRate, BoatRate } from "@/lib/booking/types";
import { isDepositMode } from "@/lib/booking/deposit-mode";
import { getStripe } from "@/lib/booking/stripe-client";
import { tryResolvePendingReceiptViaCheckoutSession } from "@/lib/booking/receipt-checkout-resolution";
import { DEPOSIT_FRACTION } from "@/lib/booking/constants";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";

export async function GET(request: NextRequest) {
  const receiptTokenQuery = request.nextUrl.searchParams.get("receipt_token")?.trim() || null;
  const checkoutSessionId = request.nextUrl.searchParams.get("checkout_session_id")?.trim() || null;
  const paymentIntentIdGet =
    request.nextUrl.searchParams.get("payment_intent_id")?.trim() ||
    request.nextUrl.searchParams.get("payment_intent")?.trim() ||
    null;
  if (!receiptTokenQuery && !paymentIntentIdGet) {
    return NextResponse.json(
      {
        error:
          "receipt_token or payment_intent_id is required. Use your confirmation link or include payment_intent_id.",
      },
      { status: 400 }
    );
  }
  if (!receiptTokenQuery && paymentIntentIdGet && !hasReceiptTokenSecretConfigured()) {
    return handleReceipt(request, "", checkoutSessionId, paymentIntentIdGet);
  }
  if (!receiptTokenQuery) {
    return NextResponse.json(
      {
        error:
          "receipt_token is required unless payment_intent_id is used (unsigned receipt mode only).",
      },
      { status: 400 }
    );
  }
  return handleReceipt(request, receiptTokenQuery, checkoutSessionId, paymentIntentIdGet);
}

export async function POST(request: NextRequest) {
  let body: { receipt_token?: string; checkout_session_id?: string; payment_intent_id?: string } = {};
  try {
    body = await request.json();
  } catch {
    // invalid or empty body
  }
  const checkoutSessionId =
    typeof body.checkout_session_id === "string" ? body.checkout_session_id.trim() || null : null;
  const paymentIntentId =
    typeof body.payment_intent_id === "string" ? body.payment_intent_id.trim() || null : null;
  const receiptToken = typeof body.receipt_token === "string" ? body.receipt_token.trim() || null : null;
  if (!receiptToken) {
    if (!hasReceiptTokenSecretConfigured() && paymentIntentId) {
      return handleReceipt(request, "", checkoutSessionId, paymentIntentId);
    }
    return NextResponse.json(
      { error: "receipt_token is required in the JSON body (or payment_intent_id when receipt signing is disabled)." },
      { status: 400 }
    );
  }
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
    const notReady = bookingNotReadyResponse();
    if (notReady) return notReady;
    const legacyUnsafe = legacyFallbackUnsafeResponse();
    if (legacyUnsafe) return legacyUnsafe;
    const rl = await checkRateLimitPostPayment(getClientKey(request));
    if (!rl.allowed) {
      if (rl.serverError) {
        return NextResponse.json(
          { error: "Rate limit service temporarily unavailable. Please try again shortly." },
          { status: 503 }
        );
      }
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
      let claim: ReceiptClaimPayload | null = verifyReceiptClaimToken(receiptToken);
      if (!claim && !hasReceiptTokenSecretConfigured() && paymentIntentId) {
        try {
          const stripe = getStripe();
          const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
          if (pi.status === "succeeded" && typeof pi.metadata?.holdId === "string") {
            claim = { holdId: pi.metadata.holdId.trim(), exp: Math.floor(Date.now() / 1000) };
          }
        } catch (piErr) {
          console.error("[receipt] payment intent lookup failed (tokenless path)", piErr);
        }
      }
      if (!claim) {
        const stale = verifyReceiptClaimTokenIgnoreExpiry(receiptToken);
        if (stale) {
          if (!paymentIntentId) {
            return NextResponse.json(
              { error: "Invalid or expired receipt link. Open the link from your confirmation email, or add your payment reference to the URL." },
              { status: 401 }
            );
          }
          claim = stale;
        }
      }
      if (claim) {
        if (paymentIntentId) {
          try {
            const stripe = getStripe();
            const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
            const metaHold =
              typeof pi.metadata?.holdId === "string" ? pi.metadata.holdId.trim() : "";
            if (metaHold !== claim.holdId) {
              return NextResponse.json(
                {
                  error:
                    "Receipt claim does not match this payment. Use the link from your confirmation email.",
                },
                { status: 401 }
              );
            }
          } catch (piErr) {
            console.error("[receipt] payment intent lookup failed", piErr);
            return NextResponse.json(
              { error: "Could not verify payment reference. Try again or use your confirmation email link." },
              { status: 502 }
            );
          }
        }
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
            const latestForExpiry = holdSnap.exists ? holdSnap.data() : null;
            const st = (latestForExpiry as { status?: string } | null)?.status;
            const expAt = (latestForExpiry as { expiresAt?: { toDate(): Date } } | null)?.expiresAt;
            const expiredByStatus = st === "expired";
            const expiredByTime =
              expAt && typeof expAt.toDate === "function" ? expAt.toDate().getTime() <= Date.now() : false;
            if (expiredByStatus || expiredByTime) {
              if (paymentIntentId) {
                try {
                  const stripe = getStripe();
                  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
                  if (pi.status === "succeeded") {
                    return NextResponse.json(
                      {
                        pending: true,
                        holdExpired: true,
                        paymentReceived: true,
                        message:
                          "Your hold timed out, but your payment went through. We are confirming your booking — keep this page open or check your email.",
                      },
                      { status: 202 }
                    );
                  }
                } catch {
                  /* fall through to 410 */
                }
              }
              return NextResponse.json({ error: "Hold expired", holdExpired: true }, { status: 410 });
            }
            const holdExpiresAtIso =
              expAt && typeof expAt.toDate === "function" ? expAt.toDate().toISOString() : undefined;
            return NextResponse.json(
              { pending: true, ...(holdExpiresAtIso ? { holdExpiresAt: holdExpiresAtIso } : {}) },
              { status: 202 }
            );
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
      const [expSnap, boatSnap, slotSnap, rateSnap] = await Promise.all([
        db.collection("experiences").doc(booking.experienceId!).get(),
        db.collection("boats").doc(booking.boatId!).get(),
        db.collection("boats").doc(booking.boatId!).collection("slots").doc(booking.slotId).get(),
        db.collection("experiences").doc(booking.experienceId!).collection("rates").doc(booking.rateId).get(),
      ]);
      experienceName = expSnap.exists ? (expSnap.data() as Experience).title : "Charter";
      boatName = boatSnap.exists ? (boatSnap.data() as { name?: string }).name ?? experienceName : experienceName;
      slot = slotSnap.exists ? (slotSnap.data() as Slot) : null;
      rate = rateSnap.exists ? (rateSnap.data() as ExperienceRate) : null;
    } else if (hasExperience) {
      const [expSnap, slotSnap, rateSnap] = await Promise.all([
        db.collection("experiences").doc(booking.experienceId!).get(),
        db
          .collection("experiences")
          .doc(booking.experienceId!)
          .collection("slots")
          .doc(booking.slotId)
          .get(),
        db
          .collection("experiences")
          .doc(booking.experienceId!)
          .collection("rates")
          .doc(booking.rateId)
          .get(),
      ]);
      experienceName = expSnap.exists ? (expSnap.data() as Experience).title : "Charter";
      boatName = experienceName;
      slot = slotSnap.exists ? (slotSnap.data() as Slot) : null;
      rate = rateSnap.exists ? (rateSnap.data() as ExperienceRate) : null;
    } else {
      const [boatSnap, slotSnap, rateSnap] = await Promise.all([
        db.collection("boats").doc(booking.boatId!).get(),
        db.collection("boats").doc(booking.boatId!).collection("slots").doc(booking.slotId).get(),
        db.collection("boats").doc(booking.boatId!).collection("rates").doc(booking.rateId).get(),
      ]);
      boatName = boatSnap.exists ? (boatSnap.data() as Boat).name : "Charter";
      experienceName = boatName;
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

    const addonsPromise = (async () => {
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
    const pendingRefundPromise = db
      .collection("pendingRefunds")
      .where("bookingId", "==", doc.id)
      .where("reason", "==", "discount_limit_exceeded")
      .limit(1)
      .get();
    const [addonSelectionsWithNames, pendingRefundSnap] = await Promise.all([
      addonsPromise,
      pendingRefundPromise,
    ]);

    let discountLimitExceeded = false;
    if (!pendingRefundSnap.empty) discountLimitExceeded = true;

    const slotDurationParsed = parseSlotIdRelaxed(booking.slotId ?? "");
    const durationHoursFromSlot =
      slotDurationParsed != null &&
      typeof slotDurationParsed.durationHours === "number" &&
      !Number.isNaN(slotDurationParsed.durationHours) &&
      slotDurationParsed.durationHours > 0
        ? slotDurationParsed.durationHours
        : null;
    const durationHoursFromRate = rate?.durationHours;
    const durationHours = durationHoursFromSlot ?? durationHoursFromRate;
    if (
      durationHoursFromSlot != null &&
      durationHoursFromRate != null &&
      durationHoursFromSlot !== durationHoursFromRate
    ) {
      console.warn("[receipt] durationHours mismatch: slotId vs rate document (using slot)", {
        bookingId: doc.id,
        durationHoursFromSlot,
        durationHoursFromRate,
        slotId: booking.slotId,
        rateId: booking.rateId,
      });
    }
    const newReceiptToken = resolvedViaClaim ? signReceiptToken(doc.id) : undefined;

    const stripe = booking.stripe;
    const depositAmountCents = stripe?.depositAmountCents;
    const totalAmountCents = stripe?.totalAmountCents ?? booking.pricing.totalCents;

    const isDeposit = isDepositMode(booking);
    let mode: "event_deposit" | "event_full" | "state_fallback" | "state_fallback_deposit";
    let paidNowCents: number;
    let usedDepositHeuristic = false;
    if (isDeposit && typeof depositAmountCents === "number") {
      mode = "state_fallback_deposit";
      paidNowCents = depositAmountCents;
    } else if (isDeposit) {
      mode = "state_fallback_deposit";
      const stripePaid = stripe?.amountTotalCents;
      if (typeof stripePaid === "number" && stripePaid > 0 && stripePaid < totalAmountCents) {
        paidNowCents = stripePaid;
      } else if (typeof stripePaid === "number" && stripePaid > 0) {
        paidNowCents = Math.min(stripePaid, totalAmountCents);
      } else {
        const fallbackDeposit = Math.round(totalAmountCents * DEPOSIT_FRACTION);
        usedDepositHeuristic = true;
        try {
          await writeOperationalAlert({
            type: "receipt_deposit_missing_used_heuristic",
            bookingId: doc.id,
            totalAmountCents,
            fallbackDeposit,
            stripeAmountTotalCents: stripePaid ?? null,
            source: "receipt",
          });
        } catch {
          /* non-fatal */
        }
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
      totalAmountCents,
    };
    if (!(isDeposit && usedDepositHeuristic)) {
      paymentSummary.paidNowCents = paidNowCents;
    } else {
      paymentSummary.depositPaidLabel = "Deposit paid";
    }
    if (isDeposit && typeof depositAmountCents !== "number") {
      const recoveredFromStripe =
        typeof stripe?.amountTotalCents === "number" &&
        stripe.amountTotalCents > 0 &&
        stripe.amountTotalCents < totalAmountCents;
      if (usedDepositHeuristic || !recoveredFromStripe) paymentSummary.depositAmountIsEstimate = true;
    }
    if (depositAmountCents != null) paymentSummary.depositAmountCents = depositAmountCents;
    if (isDeposit) {
      const depositForFinal =
        typeof depositAmountCents === "number" ? depositAmountCents : typeof paidNowCents === "number" ? paidNowCents : undefined;
      const derivedFinal =
        typeof stripe?.finalAmountCents === "number"
          ? stripe.finalAmountCents
          : typeof depositForFinal === "number" && typeof totalAmountCents === "number"
            ? Math.max(0, totalAmountCents - depositForFinal)
            : undefined;
      if (derivedFinal != null) paymentSummary.finalAmountCents = derivedFinal;
    } else if (stripe?.finalAmountCents != null) {
      paymentSummary.finalAmountCents = stripe.finalAmountCents;
    }
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
