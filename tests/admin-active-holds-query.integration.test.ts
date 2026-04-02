/**
 * Firestore emulator: paginated active-hold collection for admin boat/experience PATCH
 * (force-deactivate / pricing-day) must return every hold, not a single limited query.
 */
import { describe, it } from "node:test";
import assert from "node:assert";

function firestoreEnabled(): boolean {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST?.trim());
}

describe(
  "admin active holds query (Firestore emulator)",
  { skip: !firestoreEnabled() },
  () => {
    it("collectAllActiveHoldDocsForBoat returns all holds beyond a single query page", async () => {
      const { getDb, getFirestoreExports } = await import("../lib/booking/firebase-admin");
      const { collectAllActiveHoldDocsForBoat } = await import("../lib/booking/admin-active-holds-query");

      const db = getDb();
      const { Timestamp } = getFirestoreExports();
      const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const boatId = `boat_holds_${uid}`;
      const n = 105;
      const batch = db.batch();
      for (let i = 0; i < n; i++) {
        const ref = db.collection("holds").doc(`h_boat_${uid}_${i}`);
        batch.set(ref, {
          boatId,
          experienceId: `exp_${uid}`,
          status: "active",
          expiresAt: Timestamp.fromDate(new Date(Date.now() + 120_000)),
        });
      }
      await batch.commit();

      const docs = await collectAllActiveHoldDocsForBoat(db, boatId);
      assert.strictEqual(docs.length, n, "must aggregate every active hold for the boat across pages");
    });

    it("collectAllActiveHoldDocsForExperience returns holds for experience id variants", async () => {
      const { getDb, getFirestoreExports } = await import("../lib/booking/firebase-admin");
      const { collectAllActiveHoldDocsForExperience } = await import("../lib/booking/admin-active-holds-query");

      const db = getDb();
      const { Timestamp } = getFirestoreExports();
      const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const expId = `exp_holds_${uid}`;
      const batch = db.batch();
      for (let i = 0; i < 12; i++) {
        const ref = db.collection("holds").doc(`h_exp_${uid}_${i}`);
        batch.set(ref, {
          experienceId: expId,
          status: "active",
          expiresAt: Timestamp.fromDate(new Date(Date.now() + 120_000)),
        });
      }
      await batch.commit();

      const docs = await collectAllActiveHoldDocsForExperience(db, [expId]);
      assert.strictEqual(docs.length, 12);
    });
  }
);
