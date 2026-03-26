/**
 * End-to-end deposit booking + final charge behaviors (Firestore emulator).
 * Follows patterns in booking-two-tab-concurrency.integration.test.ts and run-final-charges.route.ts.
 *
 * (1) convertHoldToBooking with deposit → final_due + finalChargeAt (America/Chicago −48h).
 * (2) Firestore transaction mirroring run-final-charges “reconcile existing succeeded final PI” path → final_paid
 *     (avoids live Stripe.retrieve; same tx as route when existing PI status is succeeded).
 * (3) Stale PI path: upsertPendingRefundRecord as webhook does for post_conversion_preconversion_success —
 *     pendingRefunds row without a second booking document.
 *
 * Dynamic imports only (no static imports of modules that transitively load `server-only`).
 */
import { describe, it } from "node:test";
import assert from "node:assert";

function firestoreEmulatorEnabled(): boolean {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST?.trim());
}

async function seedTicketedSharedDepositBooking(): Promise<{
  db: import("firebase-admin/firestore").Firestore;
  bookingId: string;
  holdId: string;
  expId: string;
}> {
  const { getDb, getFirestoreExports } = await import("../lib/booking/firebase-admin");
  const { convertHoldToBooking } = await import("../lib/booking/convert-hold-to-booking");

  const db = getDb();
  const { FieldValue, Timestamp } = getFirestoreExports();
  const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const expId = `dep_life_${uid}`;
  const dateStr = "2031-07-14";
  const slotId = `${dateStr}-10-3`;
  const holdId = `dep_hold_${uid}`;
  const partySize = 2;
  const pricing = { subtotalCents: 20000, totalCents: 21600, taxCents: 1600, currency: "usd" };

  await db
    .collection("experiences")
    .doc(expId)
    .set({
      slug: "dep-lifecycle",
      title: "Deposit lifecycle",
      subtitle: "",
      descriptionLong: "",
      heroMedia: { type: "image", url: "https://example.com/x.jpg" },
      gallery: [],
      location: { title: "Lake Austin", addressText: "Lake Austin, TX" },
      maxGuests: 14,
      petsMax: 0,
      included: [],
      whatToBring: [],
      rules: [],
      cancellationPolicy: {
        freeCancelDays: 2,
        partialRefundDaysStart: 1,
        partialRefundDaysEnd: 0,
        noRefundWithinDays: 0,
        fullText: "",
      },
      faqs: [],
      seasonal: { enabled: false },
      active: true,
      pricingType: "ticketed",
      maxCapacity: 10,
      departureHour: 10,
      departureMinute: 0,
      tripDurationHours: 3,
      defaultRateId: "rate1",
      createdAt: FieldValue.serverTimestamp(),
    });

  await db
    .collection("experiences")
    .doc(expId)
    .collection("rates")
    .doc("rate1")
    .set({
      durationHours: 3,
      displayName: "3h",
      priceCents: 10000,
      active: true,
    });

  await db
    .collection("holds")
    .doc(holdId)
    .set({
      experienceId: expId,
      slotId,
      startDateStr: dateStr,
      rateId: "rate1",
      partySize,
      bookingMode: "shared",
      pricingType: "ticketed",
      status: "active",
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 120_000)),
      createdAt: FieldValue.serverTimestamp(),
      customerDraft: { name: "Test", email: "test@example.com", phone: "+15125551234" },
      addonSelections: [],
      answers: {},
      marketingOptIn: false,
      pricing,
    });

  const totalCents = pricing.totalCents;
  const depositCents = Math.round(totalCents * 0.5);
  const finalCents = totalCents - depositCents;

  const result = await convertHoldToBooking(db, holdId, {
    paymentStage: "deposit",
    paymentIntentId: "pi_test_deposit_lifecycle",
    customerOverride: { name: "Test", email: "test@example.com", phone: "+15125551234" },
    stripe: {
      customerId: "cus_test",
      paymentMethodId: "pm_test",
      totalCents,
      depositCents,
      finalCents,
    },
  });
  assert.ok(result && "bookingId" in result && typeof result.bookingId === "string");
  return { db, bookingId: result.bookingId, holdId, expId };
}

/**
 * Same Firestore updates as run-final-charges when it would reconcile final_due → final_paid
 * after Stripe reports the stored final PaymentIntent succeeded (see route ~381–411).
 */
async function reconcileFinalDueToPaidLikeRunFinalCharges(db: import("firebase-admin/firestore").Firestore, bookingId: string) {
  const { getFirestoreExports } = await import("../lib/booking/firebase-admin");
  const { Timestamp, FieldValue } = getFirestoreExports();
  const { transitionToFinalPaid } = await import("../lib/booking/final-paid-transition");
  type Booking = import("../lib/booking/types").Booking;

  await db.runTransaction(async (tx) => {
    const bookingRef = db.collection("bookings").doc(bookingId);
    const snap = await tx.get(bookingRef);
    if (!snap.exists) return;
    const b = snap.data() as Booking;
    if (b.status === "final_paid" && b.stripe?.finalChargedAt) {
      return;
    }
    await transitionToFinalPaid(
      tx,
      db,
      bookingRef,
      b,
      bookingId,
      "pi_test_reconcile",
      FieldValue,
      Timestamp
    );
  });
}

describe(
  "deposit lifecycle (Firestore emulator)",
  { skip: !firestoreEmulatorEnabled() },
  () => {
    it("convertHoldToBooking deposit path stores final_due and finalChargeAt (Chicago 48h before slot)", async () => {
      const { getSlotStartEnd } = await import("../lib/booking/experience-slots");
      const { computeFinalChargeAtUtc } = await import("../lib/booking/final-charge-at");

      const { db, bookingId } = await seedTicketedSharedDepositBooking();

      const bSnap = await db.collection("bookings").doc(bookingId).get();
      assert.strictEqual(bSnap.exists, true);
      const b = bSnap.data() as { status?: string; finalChargeAt?: { toDate(): Date }; startDateStr?: string };
      assert.strictEqual(b.status, "final_due");
      const dateStr = b.startDateStr ?? "2031-07-14";
      const parsedSlot = getSlotStartEnd(dateStr, 10, 3, 0);
      const expectedFinal = computeFinalChargeAtUtc(parsedSlot.start);
      const stored = b.finalChargeAt?.toDate?.();
      assert.ok(stored);
      assert.strictEqual(stored!.getTime(), expectedFinal.getTime());
    });

    it("missing payment_stage metadata + 50% PI amount resolves to deposit (complete-after-payment conversion path)", async () => {
      const { buildConvertHoldInputFromSucceededPaymentIntent } = await import(
        "../lib/booking/stripe-payment-intent-convert"
      );
      const { convertHoldToBooking } = await import("../lib/booking/convert-hold-to-booking");
      const { getDb, getFirestoreExports } = await import("../lib/booking/firebase-admin");

      const db = getDb();
      const { FieldValue, Timestamp } = getFirestoreExports();
      const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const expId = `dep_path_${uid}`;
      const holdId = `dep_path_hold_${uid}`;
      const totalCents = 21600;
      const depositCents = Math.round(totalCents * 0.5);

      await db
        .collection("experiences")
        .doc(expId)
        .set({
          slug: "dep-path",
          title: "Deposit path",
          subtitle: "",
          descriptionLong: "",
          heroMedia: { type: "image", url: "https://example.com/x.jpg" },
          gallery: [],
          location: { title: "Lake Austin", addressText: "Lake Austin, TX" },
          maxGuests: 14,
          petsMax: 0,
          included: [],
          whatToBring: [],
          rules: [],
          cancellationPolicy: { freeCancelDays: 2, partialRefundDaysStart: 1, partialRefundDaysEnd: 0, noRefundWithinDays: 0, fullText: "" },
          faqs: [],
          seasonal: { enabled: false },
          active: true,
          pricingType: "ticketed",
          maxCapacity: 10,
          departureHour: 10,
          departureMinute: 0,
          tripDurationHours: 3,
          defaultRateId: "rate1",
          createdAt: FieldValue.serverTimestamp(),
        });
      await db.collection("experiences").doc(expId).collection("rates").doc("rate1").set({
        durationHours: 3,
        displayName: "3h",
        priceCents: 10000,
        active: true,
      });
      await db.collection("holds").doc(holdId).set({
        experienceId: expId,
        slotId: "2031-08-18-10-3",
        startDateStr: "2031-08-18",
        rateId: "rate1",
        partySize: 2,
        bookingMode: "shared",
        pricingType: "ticketed",
        status: "active",
        expiresAt: Timestamp.fromDate(new Date(Date.now() + 120_000)),
        createdAt: FieldValue.serverTimestamp(),
        customerDraft: { name: "Path", email: "path@example.com", phone: "+15125550011" },
        addonSelections: [],
        answers: {},
        marketingOptIn: false,
        pricing: { subtotalCents: 20000, totalCents, taxCents: 1600, currency: "usd" },
        tipCents: 0,
        discountCents: 0,
      });

      const pi = {
        id: `pi_missing_stage_${uid}`,
        amount: depositCents,
        currency: "usd",
        metadata: {},
      } as import("stripe").Stripe.PaymentIntent;
      const convertInput = await buildConvertHoldInputFromSucceededPaymentIntent(pi, {
        pricing: { totalCents },
        tipCents: 0,
        discountCents: 0,
      });
      const result = await convertHoldToBooking(db, holdId, convertInput);
      assert.ok("bookingId" in result);
      if (!("bookingId" in result)) return;
      const bookingSnap = await db.collection("bookings").doc(result.bookingId).get();
      assert.strictEqual(bookingSnap.exists, true);
      const booking = bookingSnap.data() as { status?: string };
      assert.strictEqual(booking.status, "final_due");
    });

    it("reconcile path (mirrors run-final-charges when final PI succeeded) transitions deposit booking to final_paid", async () => {
      const { finalChargeSuccessOutboxDocId } = await import("../lib/booking/notification-outbox");

      const { db, bookingId } = await seedTicketedSharedDepositBooking();

      await reconcileFinalDueToPaidLikeRunFinalCharges(db, bookingId);

      const bSnap = await db.collection("bookings").doc(bookingId).get();
      assert.strictEqual(bSnap.exists, true);
      const b = bSnap.data() as { status?: string; stripe?: { finalChargedAt?: unknown } };
      assert.strictEqual(b.status, "final_paid");
      assert.ok(b.stripe?.finalChargedAt);

      const outboxId = finalChargeSuccessOutboxDocId(bookingId);
      const outSnap = await db.collection("notificationOutbox").doc(outboxId).get();
      assert.strictEqual(outSnap.exists, true);
      const o = outSnap.data() as { type?: string };
      assert.strictEqual(o.type, "final_charge_success");
    });

    it("reconcile path increments revenue when stripe.finalAmountCents is absent", async () => {
      const { getFirestoreExports } = await import("../lib/booking/firebase-admin");
      const { FieldValue } = getFirestoreExports();
      const { db, bookingId } = await seedTicketedSharedDepositBooking();
      await db.collection("bookings").doc(bookingId).update({
        "stripe.finalAmountCents": FieldValue.delete(),
        "stripe.finalRevenueSummaryApplied": FieldValue.delete(),
      });

      await reconcileFinalDueToPaidLikeRunFinalCharges(db, bookingId);

      const bSnap = await db.collection("bookings").doc(bookingId).get();
      assert.strictEqual(bSnap.exists, true);
      const b = bSnap.data() as { stripe?: { finalRevenueSummaryApplied?: boolean }; status?: string };
      assert.strictEqual(b.status, "final_paid");
      assert.strictEqual(b.stripe?.finalRevenueSummaryApplied, true);
    });

    it("post_conversion_preconversion_success pendingRefund upsert does not create a second booking", async () => {
      const { getDb, getFirestoreExports } = await import("../lib/booking/firebase-admin");
      const { upsertPendingRefundRecord, pendingRefundDocumentId } = await import("../lib/booking/pending-refund-idempotent");

      const db = getDb();
      const { FieldValue, Timestamp } = getFirestoreExports();
      const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const holdId = `stale_pi_hold_${uid}`;
      const bookingId = `stale_pi_book_${uid}`;
      const piStale = "pi_stale_deposit_succeeded";
      const piNewer = "pi_final_stored_on_booking";

      await db
        .collection("holds")
        .doc(holdId)
        .set({
          experienceId: `exp_${uid}`,
          slotId: "2032-08-01-10-3",
          status: "converted",
          bookingId,
          customerDraft: { name: "Stale", email: "stale@example.com", phone: "+15125550000" },
          createdAt: FieldValue.serverTimestamp(),
        });

      await db
        .collection("bookings")
        .doc(bookingId)
        .set({
          holdId,
          experienceId: `exp_${uid}`,
          slotId: "2032-08-01-10-3",
          startDateStr: "2032-08-01",
          status: "final_due",
          partySize: 2,
          customer: { name: "Stale", email: "stale@example.com", phone: "+15125550000" },
          pricing: { subtotalCents: 10000, totalCents: 10800, taxCents: 800, currency: "usd" },
          stripe: {
            depositAmountCents: 5400,
            finalAmountCents: 5400,
            totalAmountCents: 10800,
            finalPaymentIntentId: piNewer,
            customerId: "cus_x",
            paymentMethodId: "pm_x",
          },
          finalChargeAt: Timestamp.fromDate(new Date("2032-07-30T12:00:00.000Z")),
          createdAt: Timestamp.now(),
        });

      await upsertPendingRefundRecord(
        db,
        {
          reason: "post_conversion_preconversion_success",
          holdId,
          bookingId,
          paymentIntentId: piStale,
          duplicatePaymentIntentId: piStale,
          expectedPaymentIntentId: piNewer,
        },
        {
          holdId,
          bookingId,
          duplicatePaymentIntentId: piStale,
          expectedPaymentIntentId: piNewer,
          amountTotal: 5400,
          currency: "usd",
          customerEmail: "stale@example.com",
        }
      );

      const prId = pendingRefundDocumentId({
        reason: "post_conversion_preconversion_success",
        holdId,
        bookingId,
        paymentIntentId: piStale,
        duplicatePaymentIntentId: piStale,
        expectedPaymentIntentId: piNewer,
      });
      const prSnap = await db.collection("pendingRefunds").doc(prId).get();
      assert.strictEqual(prSnap.exists, true);

      const dup = await db.collection("bookings").where("holdId", "==", holdId).get();
      assert.strictEqual(dup.size, 1);
      assert.strictEqual(dup.docs[0].id, bookingId);
    });
  }
);
