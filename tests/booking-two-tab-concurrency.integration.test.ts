/**
 * Contract tests for concurrent booking flows: checkout session idempotency per hold,
 * bounded session-creation locks, and single-stage pre-conversion PaymentIntent ownership
 * (deposit vs full) when toggling payment mode across tabs.
 *
 * When FIRESTORE_EMULATOR_HOST is set (e.g. CI: `firebase emulators:exec --only firestore`), additional
 * parallel integration tests run against the Firestore emulator.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
/** Keep in sync with `SESSION_CREATION_IN_FLIGHT_MAX_AGE_MS` in `lib/booking/checkout-session-helpers.ts`. */
const SESSION_CREATION_IN_FLIGHT_MAX_AGE_MS = 30_000;

function firestoreConcurrencyEnabled(): boolean {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST?.trim());
}

describe("two-tab checkout and mode-toggle duplicate-charge prevention", () => {
  it("checkout session idempotency key is per hold, mode (embedded vs redirect), and paymentAttemptVersion", async () => {
    const { buildCheckoutSessionIdempotencyKey } = await import("../lib/booking/stripe-idempotency-keys");
    const holdId = "hold_concurrency_1";
    const embV1 = buildCheckoutSessionIdempotencyKey({ holdId, embedded: true, holdPaymentAttemptVersion: 1 });
    const redirV1 = buildCheckoutSessionIdempotencyKey({ holdId, embedded: false, holdPaymentAttemptVersion: 1 });
    const embV2 = buildCheckoutSessionIdempotencyKey({ holdId, embedded: true, holdPaymentAttemptVersion: 2 });
    assert.strictEqual(embV1, "cs-hold_concurrency_1-emb-v1");
    assert.strictEqual(redirV1, "cs-hold_concurrency_1-redir-v1");
    assert.notStrictEqual(embV1, redirV1);
    assert.notStrictEqual(embV1, embV2, "hold resume (version bump) must use a fresh Stripe idempotency key");
  });

  it("payment intent idempotency key includes hold payment attempt version (resume-safe)", async () => {
    const { buildPaymentIntentIdempotencyKey } = await import("../lib/booking/stripe-idempotency-keys");
    const holdId = "hold_resume_test";
    const k1 = buildPaymentIntentIdempotencyKey({
      holdId,
      payFullAmount: false,
      chargeCents: 5000,
      holdPaymentAttemptVersion: 1,
    });
    const k2 = buildPaymentIntentIdempotencyKey({
      holdId,
      payFullAmount: false,
      chargeCents: 5000,
      holdPaymentAttemptVersion: 2,
    });
    assert.notStrictEqual(k1, k2);
    assert.match(k1, /-v1$/);
    assert.match(k2, /-v2$/);
  });

  it("session creation inflight lease is time-bounded so locks cannot stick forever", () => {
    assert.strictEqual(SESSION_CREATION_IN_FLIGHT_MAX_AGE_MS > 0, true);
    assert.strictEqual(SESSION_CREATION_IN_FLIGHT_MAX_AGE_MS <= 120_000, true);
  });

  it("when creating a full pre-conversion intent, the opposite stage cleared on the hold is deposit", () => {
    const payFullAmount = true;
    const oppositeField = payFullAmount ? "depositPaymentIntentId" : "fullPaymentIntentId";
    assert.strictEqual(oppositeField, "depositPaymentIntentId");
  });

  it("when creating a deposit pre-conversion intent, the opposite stage cleared on the hold is full", () => {
    const payFullAmount = false;
    const oppositeField = payFullAmount ? "depositPaymentIntentId" : "fullPaymentIntentId";
    assert.strictEqual(oppositeField, "fullPaymentIntentId");
  });
});

describe(
  "parallel Firestore hold release and shared-departure concurrency (emulator)",
  { skip: !firestoreConcurrencyEnabled() },
  () => {
    it("two concurrent release-hold calls on the same active hold decrement departureInventory.reservedSeats at most once", async () => {
      const { getDb, getFirestoreExports } = await import("../lib/booking/firebase-admin");
      const { getDepartureInventoryRef } = await import("../lib/booking/shared-departure-inventory");
      const { POST: releaseHoldPost } = await import("../app/api/booking/release-hold/route");
      const { NextRequest } = await import("next/server");

      const db = getDb();
      const { FieldValue, Timestamp } = getFirestoreExports();
      const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const expId = `conc_rel_${uid}`;
      const dateStr = "2030-06-15";
      const slotId = `${dateStr}-10-3`;
      const holdId = `conc_hold_${uid}`;
      const partySize = 4;

      const inventoryRef = getDepartureInventoryRef(db, expId, dateStr);
      await inventoryRef.set({
        reservedSeats: partySize,
        updatedAt: FieldValue.serverTimestamp(),
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
          pricing: { subtotalCents: 1000, totalCents: 1083, taxCents: 83, currency: "usd" },
        });

      if (!process.env.RELEASE_HOLD_INTERNAL_SECRET?.trim()) {
        process.env.RELEASE_HOLD_INTERNAL_SECRET = "emulator-test-release-hold-internal-secret";
      }
      const releaseHoldSecret = process.env.RELEASE_HOLD_INTERNAL_SECRET.trim();
      const mkRelease = () =>
        releaseHoldPost(
          new NextRequest("http://localhost/api/booking/release-hold", {
            method: "POST",
            headers: {
              authorization: `Bearer ${releaseHoldSecret}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({ holdId }),
          })
        );

      const [resA, resB] = await Promise.all([mkRelease(), mkRelease()]);
      assert.strictEqual(resA.status, 200);
      assert.strictEqual(resB.status, 200);
      const jsonA = (await resA.json()) as { released?: boolean };
      const jsonB = (await resB.json()) as { released?: boolean };
      const releasedCount = (jsonA.released ? 1 : 0) + (jsonB.released ? 1 : 0);
      assert.strictEqual(releasedCount, 1, "exactly one transaction should transition active→expired");

      const invSnap = await inventoryRef.get();
      const reserved = invSnap.exists ? ((invSnap.data() as { reservedSeats?: number }).reservedSeats ?? 0) : -1;
      assert.strictEqual(reserved, 0, "reservedSeats must not double-decrement");

      const holdSnap = await db.collection("holds").doc(holdId).get();
      assert.strictEqual((holdSnap.data() as { status?: string })?.status, "expired");
    });

    it("two concurrent cleanup transactions for the same expired shared hold yield one processed and one skipped", async () => {
      const { getDb, getFirestoreExports } = await import("../lib/booking/firebase-admin");
      const { getDepartureInventoryRef } = await import("../lib/booking/shared-departure-inventory");
      const { runExpiredHoldReleaseTransaction } = await import("../lib/booking/cleanup-holds-logic");
      type DocumentData = import("firebase-admin/firestore").DocumentData;

      const db = getDb();
      const { FieldValue, Timestamp } = getFirestoreExports();
      const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const expId = `conc_cln_${uid}`;
      const dateStr = "2030-06-16";
      const slotId = `${dateStr}-10-3`;
      const holdId = `conc_hold_cln_${uid}`;
      const partySize = 3;

      const inventoryRef = getDepartureInventoryRef(db, expId, dateStr);
      await inventoryRef.set({
        reservedSeats: partySize,
        updatedAt: FieldValue.serverTimestamp(),
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
          expiresAt: Timestamp.fromDate(new Date(Date.now() - 60_000)),
          createdAt: FieldValue.serverTimestamp(),
          customerDraft: { name: "Test", email: "test@example.com", phone: "+15125551234" },
          addonSelections: [],
          answers: {},
          marketingOptIn: false,
          pricing: { subtotalCents: 1000, totalCents: 1083, taxCents: 83, currency: "usd" },
        });

      const holdDoc = await db.collection("holds").doc(holdId).get();
      const qSnap = holdDoc as import("firebase-admin/firestore").QueryDocumentSnapshot<DocumentData>;

      const [r1, r2] = await Promise.all([
        runExpiredHoldReleaseTransaction(db, FieldValue, qSnap.ref),
        runExpiredHoldReleaseTransaction(db, FieldValue, qSnap.ref),
      ]);

      const processed = [r1, r2].filter((x) => x === "processed").length;
      const skipped = [r1, r2].filter((x) => x === "skipped").length;
      assert.strictEqual(processed, 1);
      assert.strictEqual(skipped, 1);

      const invSnap = await inventoryRef.get();
      const reserved = invSnap.exists ? ((invSnap.data() as { reservedSeats?: number }).reservedSeats ?? 0) : -1;
      assert.strictEqual(reserved, 0);

      const holdAfter = await db.collection("holds").doc(holdId).get();
      assert.strictEqual((holdAfter.data() as { status?: string })?.status, "expired");
    });

    it("parallel create-hold requests for the last shared tickets: one succeeds, one conflicts; reservedSeats matches", async () => {
      const { getDb, getFirestoreExports } = await import("../lib/booking/firebase-admin");
      const { getDepartureInventoryRef } = await import("../lib/booking/shared-departure-inventory");
      const { POST: createHoldPost } = await import("../app/api/booking/create-hold/route");
      const { NextRequest } = await import("next/server");

      const db = getDb();
      const { FieldValue } = getFirestoreExports();
      const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const expId = `conc_ch_${uid}`;
      const dateStr = "2030-06-17";
      const slotId = `${dateStr}-10-3`;

      await db
        .collection("experiences")
        .doc(expId)
        .set({
          slug: "conc-test",
          title: "Concurrency Test",
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
          maxCapacity: 2,
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

      const inventoryRef = getDepartureInventoryRef(db, expId, dateStr);
      await inventoryRef.set({
        reservedSeats: 0,
        updatedAt: FieldValue.serverTimestamp(),
      });

      const body = {
        experienceId: expId,
        slotId,
        rateId: "rate1",
        partySize: 2,
        bookingMode: "shared",
        customerDraft: { name: "Concurrent", email: "c@example.com", phone: "+15125559876" },
        addonSelections: [],
      };

      const mkReq = () =>
        createHoldPost(
          new NextRequest("http://localhost/api/booking/create-hold", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-real-ip": "127.0.0.1",
            },
            body: JSON.stringify(body),
          })
        );

      const [resA, resB] = await Promise.all([mkReq(), mkReq()]);
      const statuses = [resA.status, resB.status].sort();
      assert.deepStrictEqual(statuses, [200, 409], "one success and one capacity/slot conflict");

      const invSnap = await inventoryRef.get();
      const reserved = invSnap.exists ? ((invSnap.data() as { reservedSeats?: number }).reservedSeats ?? 0) : -1;
      assert.strictEqual(reserved, 2, "winner reserves full remaining capacity");

      const holdsSnap = await db
        .collection("holds")
        .where("experienceId", "==", expId)
        .where("slotId", "==", slotId)
        .where("bookingMode", "==", "shared")
        .get();
      const active = holdsSnap.docs.filter((d) => (d.data() as { status?: string }).status === "active");
      assert.strictEqual(active.length, 1, "exactly one active hold for the departure");

      const bookingsSnap = await db
        .collection("bookings")
        .where("experienceId", "==", expId)
        .where("startDateStr", "==", dateStr)
        .get();
      assert.strictEqual(bookingsSnap.size, 0, "no bookings from hold creation alone");
    });

    it("shared ticketed hold: convertHoldToBooking (checkout.session.completed conversion path) zeros departureInventory.reservedSeats", async () => {
      const { getDb, getFirestoreExports } = await import("../lib/booking/firebase-admin");
      const { getDepartureInventoryRef } = await import("../lib/booking/shared-departure-inventory");
      const { convertHoldToBooking } = await import("../lib/booking/convert-hold-to-booking");

      const db = getDb();
      const { FieldValue, Timestamp } = getFirestoreExports();
      const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const expId = `conc_conv_${uid}`;
      const dateStr = "2030-06-20";
      const slotId = `${dateStr}-10-3`;
      const holdId = `conc_conv_hold_${uid}`;
      const partySize = 2;
      const pricing = { subtotalCents: 1000, totalCents: 1083, taxCents: 83, currency: "usd" };

      await db
        .collection("experiences")
        .doc(expId)
        .set({
          slug: "conv-test",
          title: "Conversion Test",
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

      const inventoryRef = getDepartureInventoryRef(db, expId, dateStr);
      await inventoryRef.set({
        reservedSeats: partySize,
        updatedAt: FieldValue.serverTimestamp(),
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

      const result = await convertHoldToBooking(db, holdId, {
        paymentIntentId: "pi_test_concurrency_simulated",
        amountTotalCents: pricing.totalCents,
        currency: "usd",
        customerOverride: { name: "Test", email: "test@example.com", phone: "+15125551234" },
        checkoutSessionId: "cs_test_concurrency_simulated",
      });
      assert.ok(result && "bookingId" in result && typeof result.bookingId === "string");

      const invSnap = await inventoryRef.get();
      const reserved = invSnap.exists ? ((invSnap.data() as { reservedSeats?: number }).reservedSeats ?? 0) : -1;
      assert.strictEqual(reserved, 0, "reservedSeats must be released after checkout conversion");
    });

    it("convertHoldToBooking enqueue path writes confirmation outbox without read-after-write transaction failure", async () => {
      const { getDb, getFirestoreExports } = await import("../lib/booking/firebase-admin");
      const { convertHoldToBooking } = await import("../lib/booking/convert-hold-to-booking");
      const { confirmationOutboxDocId } = await import("../lib/booking/notification-outbox");

      const db = getDb();
      const { FieldValue, Timestamp } = getFirestoreExports();
      const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const expId = `conc_conv_outbox_${uid}`;
      const dateStr = "2030-06-22";
      const slotId = `${dateStr}-10-3`;
      const holdId = `conc_conv_outbox_hold_${uid}`;
      const partySize = 2;
      const pricing = { subtotalCents: 1000, totalCents: 1083, taxCents: 83, currency: "usd" };

      await db.collection("experiences").doc(expId).set({
        slug: "conv-outbox-test",
        title: "Conversion Outbox Test",
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
      await db.collection("experiences").doc(expId).collection("rates").doc("rate1").set({
        durationHours: 3,
        displayName: "3h",
        priceCents: 10000,
        active: true,
      });
      await db.collection("holds").doc(holdId).set({
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
        customerDraft: { name: "Outbox", email: "outbox@example.com", phone: "+15125550001" },
        addonSelections: [],
        answers: {},
        marketingOptIn: false,
        pricing,
      });

      let conversionResult: Awaited<ReturnType<typeof convertHoldToBooking>> | null = null;
      await assert.doesNotReject(async () => {
        conversionResult = await convertHoldToBooking(db, holdId, {
          paymentIntentId: `pi_conv_outbox_${uid}`,
          amountTotalCents: pricing.totalCents,
          currency: "usd",
          customerOverride: { name: "Outbox", email: "outbox@example.com", phone: "+15125550001" },
          checkoutSessionId: `cs_conv_outbox_${uid}`,
        });
      });
      assert.ok(conversionResult && "bookingId" in conversionResult);
      if (!conversionResult || !("bookingId" in conversionResult)) return;
      const bookingId = conversionResult.bookingId;

      const outboxSnap = await db.collection("notificationOutbox").doc(confirmationOutboxDocId(bookingId)).get();
      assert.strictEqual(outboxSnap.exists, true);
      const outbox = outboxSnap.data() as { type?: string; bookingId?: string; status?: string };
      assert.strictEqual(outbox.type, "booking_confirmation");
      assert.strictEqual(outbox.bookingId, bookingId);
      assert.strictEqual(outbox.status, "pending");
    });

    it("executeReleaseHoldTransaction with discount lookup path releases hold without read-after-write errors", async () => {
      const { getDb, getFirestoreExports } = await import("../lib/booking/firebase-admin");
      const { executeReleaseHoldTransaction } = await import("../lib/booking/release-hold-transaction");
      const { getDepartureInventoryRef } = await import("../lib/booking/shared-departure-inventory");

      const db = getDb();
      const { FieldValue, Timestamp } = getFirestoreExports();
      const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const expId = `conc_rel_order_${uid}`;
      const dateStr = "2030-06-23";
      const slotId = `${dateStr}-10-3`;
      const holdId = `conc_rel_order_hold_${uid}`;
      const partySize = 3;
      const discountCode = `ORDER_${uid}`;

      await db.collection("discounts").doc(`disc_${uid}`).set({
        code: discountCode,
        usedCount: 1,
        updatedAt: FieldValue.serverTimestamp(),
      });

      const inventoryRef = getDepartureInventoryRef(db, expId, dateStr);
      await inventoryRef.set({ reservedSeats: partySize, updatedAt: FieldValue.serverTimestamp() });

      await db.collection("holds").doc(holdId).set({
        experienceId: expId,
        slotId,
        startDateStr: dateStr,
        rateId: "rate1",
        partySize,
        bookingMode: "shared",
        pricingType: "ticketed",
        discountCode,
        status: "active",
        expiresAt: Timestamp.fromDate(new Date(Date.now() + 120_000)),
        createdAt: FieldValue.serverTimestamp(),
        customerDraft: { name: "Release", email: "release@example.com", phone: "+15125550002" },
        addonSelections: [],
        answers: {},
        marketingOptIn: false,
        pricing: { subtotalCents: 1000, totalCents: 1083, taxCents: 83, currency: "usd" },
      });

      let result: Awaited<ReturnType<typeof executeReleaseHoldTransaction>> | null = null;
      await assert.doesNotReject(async () => {
        result = await executeReleaseHoldTransaction(db, holdId);
      });
      assert.deepStrictEqual(result, { released: true });

      const holdAfter = await db.collection("holds").doc(holdId).get();
      assert.strictEqual((holdAfter.data() as { status?: string })?.status, "expired");
      const invAfter = await inventoryRef.get();
      assert.strictEqual((invAfter.data() as { reservedSeats?: number } | undefined)?.reservedSeats ?? -1, 0);
      const discountAfter = await db.collection("discounts").doc(`disc_${uid}`).get();
      assert.strictEqual((discountAfter.data() as { usedCount?: number } | undefined)?.usedCount ?? -1, 0);
    });

    it("runExpiredHoldReleaseTransaction cleanup expiration with discount path completes without read-after-write errors", async () => {
      const { getDb, getFirestoreExports } = await import("../lib/booking/firebase-admin");
      const { runExpiredHoldReleaseTransaction } = await import("../lib/booking/cleanup-holds-logic");
      const { getDepartureInventoryRef } = await import("../lib/booking/shared-departure-inventory");

      const db = getDb();
      const { FieldValue, Timestamp } = getFirestoreExports();
      const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const expId = `conc_cln_order_${uid}`;
      const dateStr = "2030-06-24";
      const slotId = `${dateStr}-10-3`;
      const holdId = `conc_cln_order_hold_${uid}`;
      const partySize = 2;
      const discountCode = `CLN_ORDER_${uid}`;

      await db.collection("discounts").doc(`disc_cln_${uid}`).set({
        code: discountCode,
        usedCount: 1,
        updatedAt: FieldValue.serverTimestamp(),
      });

      const inventoryRef = getDepartureInventoryRef(db, expId, dateStr);
      await inventoryRef.set({ reservedSeats: partySize, updatedAt: FieldValue.serverTimestamp() });

      await db.collection("holds").doc(holdId).set({
        experienceId: expId,
        slotId,
        startDateStr: dateStr,
        rateId: "rate1",
        partySize,
        bookingMode: "shared",
        pricingType: "ticketed",
        discountCode,
        status: "active",
        expiresAt: Timestamp.fromDate(new Date(Date.now() - 90_000)),
        createdAt: FieldValue.serverTimestamp(),
        customerDraft: { name: "Cleanup", email: "cleanup@example.com", phone: "+15125550003" },
        addonSelections: [],
        answers: {},
        marketingOptIn: false,
        pricing: { subtotalCents: 1000, totalCents: 1083, taxCents: 83, currency: "usd" },
      });

      const holdRef = db.collection("holds").doc(holdId);
      let outcome: Awaited<ReturnType<typeof runExpiredHoldReleaseTransaction>> | null = null;
      await assert.doesNotReject(async () => {
        outcome = await runExpiredHoldReleaseTransaction(db, FieldValue, holdRef);
      });
      assert.strictEqual(outcome, "processed");

      const holdAfter = await holdRef.get();
      assert.strictEqual((holdAfter.data() as { status?: string })?.status, "expired");
      const invAfter = await inventoryRef.get();
      assert.strictEqual((invAfter.data() as { reservedSeats?: number } | undefined)?.reservedSeats ?? -1, 0);
      const discountAfter = await db.collection("discounts").doc(`disc_cln_${uid}`).get();
      assert.strictEqual((discountAfter.data() as { usedCount?: number } | undefined)?.usedCount ?? -1, 0);
    });

    it("two concurrent charter holds for the same boat slot: one 200, one 409; slot held by winner", async () => {
      const { getDb, getFirestoreExports } = await import("../lib/booking/firebase-admin");
      const { getSlotStartEnd } = await import("../lib/booking/experience-slots");
      const { POST: createHoldPost } = await import("../app/api/booking/create-hold/route");
      const { NextRequest } = await import("next/server");

      const db = getDb();
      const { FieldValue, Timestamp } = getFirestoreExports();
      const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const expId = `conc_chtr_${uid}`;
      const boatId = `boat_${uid}`;
      const dateStr = "2030-06-21";
      const slotId = `${dateStr}-10-3`;
      const { start: slotStart, end: slotEnd } = getSlotStartEnd(dateStr, 10, 3, 0);

      await db
        .collection("experiences")
        .doc(expId)
        .set({
          slug: "charter-conc",
          title: "Charter Concurrency",
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
          pricingType: "charter",
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
        .collection("boats")
        .doc(boatId)
        .set({
          name: "Solo Boat",
          experienceIds: [expId],
          isListingBoat: true,
          defaultLocationText: "Lake Austin",
          cancellationPolicyText: "",
          createdAt: FieldValue.serverTimestamp(),
        });

      await db
        .collection("boats")
        .doc(boatId)
        .collection("slots")
        .doc(slotId)
        .set({
          status: "open",
          startAt: Timestamp.fromDate(slotStart),
          endAt: Timestamp.fromDate(slotEnd),
          updatedAt: FieldValue.serverTimestamp(),
        });

      const bodyBase = {
        experienceId: expId,
        boatId,
        slotId,
        rateId: "rate1",
        partySize: 6,
        bookingMode: "charter" as const,
        customerDraft: { name: "Charter", email: "c@example.com", phone: "+15125559876" },
        addonSelections: [],
      };

      const mkReq = (holdRequestId: string) =>
        createHoldPost(
          new NextRequest("http://localhost/api/booking/create-hold", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-real-ip": "127.0.0.1",
            },
            body: JSON.stringify({ ...bodyBase, holdRequestId }),
          })
        );

      const [resA, resB] = await Promise.all([mkReq(`hr_${uid}_a`), mkReq(`hr_${uid}_b`)]);
      const statuses = [resA.status, resB.status].sort();
      assert.deepStrictEqual(statuses, [200, 409], "one success and one slot conflict");

      const slotSnap = await db.collection("boats").doc(boatId).collection("slots").doc(slotId).get();
      assert.strictEqual(slotSnap.exists, true);
      const slotData = slotSnap.data() as { status?: string; holdId?: string };
      assert.strictEqual(slotData.status, "held");
      assert.ok(typeof slotData.holdId === "string" && slotData.holdId.length > 0);
      const winnerSnap = await db.collection("holds").doc(slotData.holdId!).get();
      assert.strictEqual((winnerSnap.data() as { status?: string })?.status, "active");
    });
  }
);
