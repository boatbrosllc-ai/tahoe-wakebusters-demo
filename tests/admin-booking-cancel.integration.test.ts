/**
 * Emulator-backed regression: admin cancel Firestore phase must not interleave reads after writes
 * (same ordering as POST /api/admin/bookings/[id]/cancel slot reset + shared departure inventory).
 *
 * Full HTTP + admin session is not exercised here; this suite validates the transaction helpers.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function firestoreEnabled(): boolean {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST?.trim());
}

describe("POST /api/admin/bookings/[id]/cancel (source wiring)", () => {
  it("pre-reads departure inventory then slot batch, and uses releaseCapacityWithPreRead for shared ticketed", () => {
    const src = readFileSync(
      join(__dirname, "../app/api/admin/bookings/[id]/cancel/route.ts"),
      "utf8"
    );
    assert.match(src, /releaseCapacityWithPreRead/);
    assert.match(src, /expIdForInventory/);
    assert.match(src, /Firestore read-before-write rule/);
  });
});

describe(
  "admin cancel transaction ordering (Firestore emulator)",
  { skip: !firestoreEnabled() },
  () => {
    it("listing-style booking: multi-ref slot reset opens all slot docs", async () => {
      const { getDb, getFirestoreExports } = await import("../lib/booking/firebase-admin");
      const { resetBookingSlotsToOpenInTransaction } = await import("../lib/booking/slot-reset");

      const db = getDb();
      const { FieldValue, Timestamp } = getFirestoreExports();
      const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const expId = `exp_cancel_${uid}`;
      const boatId = `boat_${uid}`;
      const dateStr = "2032-08-10";
      const slotId = `${dateStr}-10-3`;
      const bookingId = `bk_list_${uid}`;

      await db
        .collection("experiences")
        .doc(expId)
        .set({
          slug: `slug-${uid}`,
          title: "Cancel test",
          pricingType: "charter",
          active: true,
          createdAt: FieldValue.serverTimestamp(),
        });

      const slotPathRefs = [
        db.collection("boats").doc(boatId).collection("slots").doc(slotId),
        db.collection("experiences").doc(expId).collection("slots").doc(slotId),
      ];

      for (const ref of slotPathRefs) {
        await ref.set({
          status: "booked",
          bookingId,
          updatedAt: Timestamp.now(),
        });
      }

      await db.runTransaction(async (tx) => {
        const result = await resetBookingSlotsToOpenInTransaction(
          db,
          tx,
          bookingId,
          {
            slotId,
            experienceId: expId,
            boatId,
            customer: { name: "T", email: "t@example.com" },
            partySize: 2,
            status: "paid",
            pricing: { totalCents: 100, currency: "usd" },
          } as import("../lib/booking/types").Booking,
          `slug-${uid}`
        );
        assert.strictEqual(result.updated, 2);
      });

      for (const ref of slotPathRefs) {
        const s = await ref.get();
        assert.strictEqual(s.exists, true);
        assert.strictEqual((s.data() as { status?: string }).status, "open");
      }
    });

    it("shared ticketed: slot reset then departure inventory release (write-only) in one transaction", async () => {
      const { getDb, getFirestoreExports } = await import("../lib/booking/firebase-admin");
      const { resetBookingSlotsToOpenInTransaction } = await import("../lib/booking/slot-reset");
      const {
        getDepartureInventoryRef,
        releaseCapacityWithPreRead,
      } = await import("../lib/booking/shared-departure-inventory");

      const db = getDb();
      const { FieldValue, Timestamp } = getFirestoreExports();
      const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const expId = `exp_shared_cancel_${uid}`;
      const dateStr = "2032-09-15";
      const slotId = `${dateStr}-10-3`;
      const bookingId = `bk_shared_${uid}`;
      const partySize = 3;
      const initialReserved = 8;

      await db
        .collection("experiences")
        .doc(expId)
        .set({
          slug: `shared-${uid}`,
          title: "Shared cancel test",
          pricingType: "ticketed",
          active: true,
          maxCapacity: 20,
          createdAt: FieldValue.serverTimestamp(),
        });

      const slotRef = db.collection("experiences").doc(expId).collection("slots").doc(slotId);
      await slotRef.set({
        status: "booked",
        bookingId,
        updatedAt: Timestamp.now(),
      });

      const invRef = getDepartureInventoryRef(db, expId, dateStr);
      await invRef.set({
        reservedSeats: initialReserved,
        updatedAt: FieldValue.serverTimestamp(),
      });

      const departureInventoryPreRead = {
        current: null as { ref: FirebaseFirestore.DocumentReference; reserved: number } | null,
      };

      await db.runTransaction(async (tx) => {
        const invSnapPre = await tx.get(invRef);
        departureInventoryPreRead.current = {
          ref: invRef,
          reserved: invSnapPre.exists
            ? ((invSnapPre.data() as { reservedSeats?: number }).reservedSeats ?? 0)
            : 0,
        };
        await resetBookingSlotsToOpenInTransaction(
          db,
          tx,
          bookingId,
          {
            slotId,
            experienceId: expId,
            startDateStr: dateStr,
            bookingMode: "shared",
            customer: { name: "T", email: "t@example.com" },
            partySize,
            status: "paid",
            pricing: { totalCents: 100, currency: "usd" },
          } as import("../lib/booking/types").Booking,
          `shared-${uid}`
        );
        if (departureInventoryPreRead.current) {
          const inv = departureInventoryPreRead.current;
          releaseCapacityWithPreRead(tx, inv.ref, partySize, inv.reserved);
        }
      });

      const invSnap = await invRef.get();
      assert.strictEqual(
        (invSnap.data() as { reservedSeats?: number }).reservedSeats,
        initialReserved - partySize
      );
      const slotSnap = await slotRef.get();
      assert.strictEqual((slotSnap.data() as { status?: string }).status, "open");
    });
  }
);
