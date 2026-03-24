/**
 * Overlapping charter holds on the same boat/day with different slot document ids must not both succeed
 * (assertNoOverlappingActiveSameDaySlots used by create-hold / create-checkout-session-direct).
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
