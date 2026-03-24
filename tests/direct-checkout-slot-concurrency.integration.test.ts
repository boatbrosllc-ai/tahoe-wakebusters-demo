/**
 * Mirrors the Firestore transaction shape used by `create-checkout-session-direct`: the slot document
 * is read and updated in a single transaction so concurrent requests for the same slot serialize.
 *
 * Requires `FIRESTORE_EMULATOR_HOST` (CI runs tests inside `firebase emulators:exec --only firestore`).
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { getSlotStartEnd, parseSlotId } from "../lib/booking/experience-slots";

function firestoreConcurrencyEnabled(): boolean {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST?.trim());
}

describe(
  "direct checkout slot document transaction isolation",
  { skip: !firestoreConcurrencyEnabled() },
  () => {
    it("two concurrent transactions cannot both mark the same open slot as held", async () => {
      const { getDb, getFirestoreExports } = await import("../lib/booking/firebase-admin");
      const db = getDb();
      const { FieldValue, Timestamp } = getFirestoreExports();
      const uid = `dc_slot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const slotId = "2030-06-15-10-3";
      const slotRef = db.collection("experiences").doc(uid).collection("slots").doc(slotId);
      const parsed = parseSlotId(slotId);
      assert.ok(parsed);
      const { start, end } = getSlotStartEnd(
        parsed.dateStr,
        parsed.startHour,
        parsed.durationHours,
        parsed.startMinute ?? 0
      );
      await slotRef.set({
        startAt: Timestamp.fromDate(start),
        endAt: Timestamp.fromDate(end),
        status: "open",
        updatedAt: FieldValue.serverTimestamp(),
      });

      const holdA = `hold_a_${uid}`;
      const holdB = `hold_b_${uid}`;

      const [r1, r2] = await Promise.allSettled([
        db.runTransaction(async (tx) => {
          const s = await tx.get(slotRef);
          if (!s.exists) throw new Error("no slot");
          const st = s.data() as { status?: string };
          if (st.status !== "open") throw new Error("slot_not_open");
          tx.update(slotRef, {
            status: "held",
            holdId: holdA,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }),
        db.runTransaction(async (tx) => {
          const s = await tx.get(slotRef);
          if (!s.exists) throw new Error("no slot");
          const st = s.data() as { status?: string };
          if (st.status !== "open") throw new Error("slot_not_open");
          tx.update(slotRef, {
            status: "held",
            holdId: holdB,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }),
      ]);

      const fulfilled = [r1, r2].filter((r) => r.status === "fulfilled");
      const rejected = [r1, r2].filter((r) => r.status === "rejected");
      assert.strictEqual(
        fulfilled.length,
        1,
        `expected exactly one successful transaction, got ${fulfilled.length}: ${JSON.stringify([r1, r2])}`
      );
      assert.strictEqual(rejected.length, 1, "expected exactly one failed transaction");

      const final = await slotRef.get();
      const held = final.data() as { holdId?: string; status?: string };
      assert.strictEqual(held.status, "held");
      assert.ok(held.holdId === holdA || held.holdId === holdB);
    });
  }
);
