/**
 * Shared vs private ticketed exclusivity: active opposite-mode holds for the same departure
 * must block (mirrors create-hold shared-ticketed scan + charter ticketed scan).
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { departureTimesMatch } from "../lib/booking/departure-match";
import { parseSlotIdRelaxed } from "../lib/booking/experience-slots";

function firestoreConcurrencyEnabled(): boolean {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST?.trim());
}

describe(
  "shared vs private ticketed hold exclusivity (emulator)",
  { skip: !firestoreConcurrencyEnabled() },
  () => {
    it("charter hold on same departure is visible to a shared-style scan", async () => {
      const { getDb, getFirestoreExports } = await import("../lib/booking/firebase-admin");
      const db = getDb();
      const { Timestamp } = getFirestoreExports();
      const uid = `sp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const experienceId = `exp_${uid}`;
      const dateStr = "2030-08-10";
      const slotId = `${dateStr}-10-3`;
      const parsed = parseSlotIdRelaxed(slotId);
      assert.ok(parsed);
      const holdId = `hold_charter_${uid}`;
      const exp = new Date(Date.now() + 60 * 60 * 1000);
      await db
        .collection("holds")
        .doc(holdId)
        .set({
          experienceId,
          startDateStr: dateStr,
          slotId,
          bookingMode: "charter",
          status: "active",
          expiresAt: Timestamp.fromDate(exp),
        });

      const snap = await db
        .collection("holds")
        .where("experienceId", "==", experienceId)
        .where("startDateStr", "==", dateStr)
        .get();

      let blocked = false;
      for (const d of snap.docs) {
        const h = d.data() as { status?: string; bookingMode?: string; expiresAt?: { toDate(): Date }; slotId?: string };
        if (h.status !== "active" || h.bookingMode !== "charter") continue;
        if (h.expiresAt && h.expiresAt.toDate() < new Date()) continue;
        if (departureTimesMatch(h.slotId, parsed)) {
          blocked = true;
          break;
        }
      }
      assert.strictEqual(blocked, true);
    });

    it("shared hold on same departure is visible to a charter-style boat scan", async () => {
      const { getDb, getFirestoreExports } = await import("../lib/booking/firebase-admin");
      const db = getDb();
      const { Timestamp } = getFirestoreExports();
      const uid = `sp2_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const boatId = `boat_${uid}`;
      const dateStr = "2030-08-11";
      const slotId = `${dateStr}-10-3`;
      const parsed = parseSlotIdRelaxed(slotId);
      assert.ok(parsed);
      const holdId = `hold_shared_${uid}`;
      const exp = new Date(Date.now() + 60 * 60 * 1000);
      await db
        .collection("holds")
        .doc(holdId)
        .set({
          boatId,
          startDateStr: dateStr,
          slotId,
          bookingMode: "shared",
          status: "active",
          expiresAt: Timestamp.fromDate(exp),
        });

      const snap = await db.collection("holds").where("boatId", "==", boatId).where("startDateStr", "==", dateStr).get();

      let blocked = false;
      for (const d of snap.docs) {
        const h = d.data() as { status?: string; bookingMode?: string; expiresAt?: { toDate(): Date }; slotId?: string };
        if (h.status !== "active" || h.bookingMode !== "shared") continue;
        if (h.expiresAt && h.expiresAt.toDate() < new Date()) continue;
        if (departureTimesMatch(h.slotId, parsed)) {
          blocked = true;
          break;
        }
      }
      assert.strictEqual(blocked, true);
    });
  }
);
