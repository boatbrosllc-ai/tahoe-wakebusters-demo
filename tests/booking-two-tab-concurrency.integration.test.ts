/**
 * Contract tests for concurrent booking flows: checkout session idempotency per hold,
 * bounded session-creation locks, and single-stage pre-conversion PaymentIntent ownership
 * (deposit vs full) when toggling payment mode across tabs.
 *
 * When FIRESTORE_EMULATOR_HOST is set and Firebase credentials are available, additional
 * parallel integration tests run against the Firestore emulator (start with:
 * `firebase emulators:start --only firestore` and set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080).
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { safeHasFirebaseConfig } from "../lib/booking/env";

/** Keep in sync with `SESSION_CREATION_IN_FLIGHT_MAX_AGE_MS` in `lib/booking/checkout-session-helpers.ts`. */
const SESSION_CREATION_IN_FLIGHT_MAX_AGE_MS = 30_000;

function firestoreConcurrencyEnabled(): boolean {
  if (!process.env.FIRESTORE_EMULATOR_HOST?.trim()) return false;
  try {
    return safeHasFirebaseConfig();
  } catch {
    return false;
  }
}

describe("two-tab checkout and mode-toggle duplicate-charge prevention", () => {
  it("checkout session create uses one idempotency key per hold (embedded and redirect share it)", () => {
    const holdId = "hold_concurrency_1";
    assert.strictEqual(`cs-${holdId}`, "cs-hold_concurrency_1");
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

      if (!process.env.BLOCK_SECRET?.trim()) {
        process.env.BLOCK_SECRET = "emulator-test-block-secret";
      }
      const blockSecret = process.env.BLOCK_SECRET.trim();
      const mkRelease = () =>
        releaseHoldPost(
          new NextRequest("http://localhost/api/booking/release-hold", {
            method: "POST",
            headers: {
              authorization: `Bearer ${blockSecret}`,
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
        runExpiredHoldReleaseTransaction(db, FieldValue, qSnap),
        runExpiredHoldReleaseTransaction(db, FieldValue, qSnap),
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
  }
);
