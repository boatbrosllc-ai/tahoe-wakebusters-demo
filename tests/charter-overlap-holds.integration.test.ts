/**
 * Overlapping charter holds on the same boat/day with different slot document ids must not both succeed
 * (assertNoOverlappingActiveSameDaySlots used by create-hold / create-checkout-session-direct).
 *
 * Slots API: pre-existing `open` slot documents must still participate in interval/block overlap so a
 * shorter later start overlapped by a longer booking is not returned as open.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { getSlotStartEnd, parseSlotId } from "../lib/booking/experience-slots";
import {
  assertNoOverlappingActiveSameDaySlots,
  transactionGetQueryOrDoc,
} from "../lib/booking/same-day-active-slot-overlap";
import { SlotConflictError } from "../lib/booking/slot-conflict-errors";

function firestoreConcurrencyEnabled(): boolean {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST?.trim());
}

describe(
  "overlapping charter holds (different slot ids, same boat/day)",
  { skip: !firestoreConcurrencyEnabled() },
  () => {
    it("second overlapping hold is rejected after the first slot is held with an active hold doc", async () => {
      const { getDb, getFirestoreExports } = await import("../lib/booking/firebase-admin");
      const db = getDb();
      const { FieldValue, Timestamp } = getFirestoreExports();
      const uid = `ov_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const boatId = `boat_${uid}`;
      const experienceId = `exp_${uid}`;
      const dateStr = "2030-07-01";
      const slotIdA = `${dateStr}-10-3`;
      const slotIdB = `${dateStr}-10h30-3`;
      const parsedA = parseSlotId(slotIdA);
      const parsedB = parseSlotId(slotIdB);
      assert.ok(parsedA && parsedB);
      const { start: startA, end: endA } = getSlotStartEnd(
        parsedA.dateStr,
        parsedA.startHour,
        parsedA.durationHours,
        parsedA.startMinute ?? 0
      );
      const { start: startB, end: endB } = getSlotStartEnd(
        parsedB.dateStr,
        parsedB.startHour,
        parsedB.durationHours,
        parsedB.startMinute ?? 0
      );
      const slotsRef = db.collection("boats").doc(boatId).collection("slots");
      const holdA = `hold_a_${uid}`;
      await slotsRef.doc(slotIdA).set({
        startAt: Timestamp.fromDate(startA),
        endAt: Timestamp.fromDate(endA),
        status: "open",
        updatedAt: FieldValue.serverTimestamp(),
      });
      await slotsRef.doc(slotIdB).set({
        startAt: Timestamp.fromDate(startB),
        endAt: Timestamp.fromDate(endB),
        status: "open",
        updatedAt: FieldValue.serverTimestamp(),
      });

      const now = new Date();
      const exp = new Date(now.getTime() + 60 * 60 * 1000);
      await db.runTransaction(async (tx) => {
        await assertNoOverlappingActiveSameDaySlots({
          db,
          Timestamp,
          get: (refOrQuery) => transactionGetQueryOrDoc(tx, refOrQuery),
          experienceId,
          boatId,
          useBoatSlots: true,
          parsed: parsedA,
          slotStart: startA,
          slotEnd: endA,
          now,
        });
        tx.set(db.collection("holds").doc(holdA), {
          status: "active",
          expiresAt: Timestamp.fromDate(exp),
        });
        tx.update(slotsRef.doc(slotIdA), {
          status: "held",
          holdId: holdA,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

      await assert.rejects(
        () =>
          db.runTransaction(async (tx) => {
            await assertNoOverlappingActiveSameDaySlots({
              db,
              Timestamp,
              get: (refOrQuery) => transactionGetQueryOrDoc(tx, refOrQuery),
              experienceId,
              boatId,
              useBoatSlots: true,
              parsed: parsedB,
              slotStart: startB,
              slotEnd: endB,
              now: new Date(),
            });
          }),
        (err: unknown) => err instanceof SlotConflictError
      );
    });
  }
);

describe(
  "GET /api/booking/slots charter grid — open slot docs vs overlapping bookings (emulator)",
  { skip: !firestoreConcurrencyEnabled() },
  () => {
    it("later overlapping open slot doc is booked when a longer charter booking covers the interval", async () => {
      const { getDb, getFirestoreExports } = await import("../lib/booking/firebase-admin");
      const { GET: slotsGet } = await import("../app/api/booking/slots/route");
      const { NextRequest } = await import("next/server");

      const db = getDb();
      const { FieldValue, Timestamp } = getFirestoreExports();
      const uid = `slotov_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const experienceId = `exp_${uid}`;
      const boatId = `boat_${uid}`;
      const bookingId = `bk_${uid}`;
      const dateStr = "2030-07-01";
      const slotIdLong = `${dateStr}-7-3`;
      const slotIdLater = `${dateStr}-9-2`;

      const parsedLong = parseSlotId(slotIdLong);
      const parsedLater = parseSlotId(slotIdLater);
      assert.ok(parsedLong && parsedLater);
      const { start: startLong, end: endLong } = getSlotStartEnd(
        parsedLong.dateStr,
        parsedLong.startHour,
        parsedLong.durationHours,
        parsedLong.startMinute ?? 0
      );
      const { start: startLater, end: endLater } = getSlotStartEnd(
        parsedLater.dateStr,
        parsedLater.startHour,
        parsedLater.durationHours,
        parsedLater.startMinute ?? 0
      );

      await db
        .collection("experiences")
        .doc(experienceId)
        .set({
          slug: "lake-austin-pontoon",
          title: "Charter slots overlap regression",
          pricingType: "charter",
          active: true,
          seasonal: { enabled: false },
          createdAt: FieldValue.serverTimestamp(),
        });

      await db
        .collection("experiences")
        .doc(experienceId)
        .collection("rates")
        .doc("r2")
        .set({ durationHours: 2, active: true });
      await db
        .collection("experiences")
        .doc(experienceId)
        .collection("rates")
        .doc("r3")
        .set({ durationHours: 3, active: true });

      await db.collection("boats").doc(boatId).set({
        isListingBoat: true,
        active: true,
        experienceIds: [experienceId],
        boatType: "pontoon",
      });

      await db.collection("bookings").doc(bookingId).set({
        experienceId,
        boatId,
        slotId: slotIdLong,
        status: "paid",
        startDateStr: dateStr,
      });

      const slotsRef = db.collection("boats").doc(boatId).collection("slots");
      await slotsRef.doc(slotIdLater).set({
        startAt: Timestamp.fromDate(startLater),
        endAt: Timestamp.fromDate(endLater),
        status: "open",
        updatedAt: FieldValue.serverTimestamp(),
      });

      const url = new URL("http://localhost/api/booking/slots");
      url.searchParams.set("experienceId", experienceId);
      url.searchParams.set("startDate", dateStr);
      url.searchParams.set("endDate", dateStr);
      const res = await slotsGet(new NextRequest(url));
      assert.strictEqual(res.status, 200, await res.text());
      const body = (await res.json()) as {
        slots: Array<{
          id: string;
          status: string;
          bookingId?: string | null;
          bookingDurationHours?: number;
        }>;
      };
      const longRow = body.slots.find((s) => s.id === slotIdLong);
      const laterRow = body.slots.find((s) => s.id === slotIdLater);
      assert.ok(longRow, "canonical long booking row present");
      assert.ok(laterRow, "later grid row present");
      assert.strictEqual(longRow.status, "booked");
      assert.notStrictEqual(laterRow.status, "open", "later overlapping slot must not remain open from stale slot doc");
      assert.strictEqual(laterRow.status, "booked");
      assert.strictEqual(laterRow.bookingId, bookingId);
      assert.strictEqual(laterRow.bookingDurationHours, 3, "shorter row should inherit canonical trip duration for UI");
      const overlaps =
        startLater.getTime() < endLong.getTime() && endLater.getTime() > startLong.getTime();
      assert.strictEqual(overlaps, true, "fixtures must use overlapping charter intervals");
    });
  }
);
