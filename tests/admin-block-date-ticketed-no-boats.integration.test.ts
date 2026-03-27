import { describe, it } from "node:test";
import assert from "node:assert";

function firestoreEnabled(): boolean {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST?.trim());
}

describe(
  "admin block-date ticketed no-listing-boats",
  { skip: !firestoreEnabled() },
  () => {
    it("creates and removes an experience-level block when no listing boats are assigned", async () => {
      const { getDb, getFirestoreExports } = await import("../lib/booking/firebase-admin");
      const { POST: blockDatePost } = await import("../app/api/admin/blocks/block-date/route");
      const { NextRequest } = await import("next/server");

      const db = getDb();
      const { FieldValue } = getFirestoreExports();
      const uid = `blk_nb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const experienceId = `exp_${uid}`;
      const date = "2030-07-15";

      await db.collection("experiences").doc(experienceId).set({
        slug: `ticketed-${uid}`,
        title: "Ticketed no boats",
        pricingType: "ticketed",
        active: true,
        createdAt: FieldValue.serverTimestamp(),
      });

      const prevSecret = process.env.BLOCK_SECRET;
      process.env.BLOCK_SECRET = "emulator-test-block-secret";

      const makeReq = (action: "block" | "unblock") =>
        blockDatePost(
          new NextRequest("http://localhost/api/admin/blocks/block-date", {
            method: "POST",
            headers: {
              authorization: `Bearer ${process.env.BLOCK_SECRET}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({ experienceId, date, action }),
          })
        );

      try {
        const blockRes = await makeReq("block");
        assert.strictEqual(blockRes.status, 200);
        const blockJson = (await blockRes.json()) as { blocksCreated?: number };
        assert.strictEqual(blockJson.blocksCreated, 1);

        const blocksSnap = await db.collection("blocks").where("experienceId", "==", experienceId).get();
        const docs = blocksSnap.docs.map((d) => d.data() as { boatId?: string | null });
        assert.strictEqual(docs.length, 1);
        assert.strictEqual(docs[0]?.boatId ?? undefined, null);

        const unblockRes = await makeReq("unblock");
        assert.strictEqual(unblockRes.status, 200);
        const unblockJson = (await unblockRes.json()) as { blocksDeleted?: number };
        assert.strictEqual(unblockJson.blocksDeleted, 1);

        const after = await db.collection("blocks").where("experienceId", "==", experienceId).get();
        assert.strictEqual(after.empty, true);
      } finally {
        if (prevSecret == null) delete process.env.BLOCK_SECRET;
        else process.env.BLOCK_SECRET = prevSecret;
      }
    });
  }
);
