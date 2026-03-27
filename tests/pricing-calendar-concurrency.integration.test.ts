import { describe, it } from "node:test";
import assert from "node:assert";

function firestoreEnabled(): boolean {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST?.trim());
}

describe(
  "pricing calendar concurrent updates",
  { skip: !firestoreEnabled() },
  () => {
    it("overlapping writes keep all date overrides", async () => {
      const { getDb } = await import("../lib/booking/firebase-admin");
      const { applyPricingCalendarDateUpdates } = await import("../app/api/admin/pricing-calendar/route");

      const db = getDb();
      const boatType = `wake-conc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const ref = db.collection("pricingCalendar").doc(boatType);

      await Promise.all([
        applyPricingCalendarDateUpdates({
          boatType,
          dates: ["2030-08-01", "2030-08-02"],
          reset: false,
          hourlyRateCents: 15000,
        }),
        applyPricingCalendarDateUpdates({
          boatType,
          dates: ["2030-08-02", "2030-08-03"],
          reset: false,
          hourlyRateCents: 17500,
        }),
      ]);

      const snap = await ref.get();
      assert.strictEqual(snap.exists, true);
      const rates = (snap.data()?.rates ?? {}) as Record<string, number>;
      assert.strictEqual(typeof rates["2030-08-01"], "number");
      assert.strictEqual(typeof rates["2030-08-02"], "number");
      assert.strictEqual(typeof rates["2030-08-03"], "number");
    });
  }
);
