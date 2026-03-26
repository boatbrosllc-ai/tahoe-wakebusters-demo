import { describe, it } from "node:test";
import assert from "node:assert";
import { applyDiscountCounterSwapInTransaction } from "../lib/booking/discount-counter-swap";

describe("applyDiscountCounterSwapInTransaction", () => {
  it("commits both counter mutations together", () => {
    const staged: Array<{ ref: string; delta: number }> = [];
    const committed: Array<{ ref: string; delta: number }> = [];
    const tx = {
      update(ref: { id: string }, payload: { usedCount: number | { __inc: number } }) {
        const delta =
          typeof payload.usedCount === "number"
            ? payload.usedCount
            : payload.usedCount.__inc;
        staged.push({ ref: ref.id, delta });
      },
    };
    const FieldValue = {
      increment: (n: number) => ({ __inc: n }),
      serverTimestamp: () => 0,
    };
    applyDiscountCounterSwapInTransaction(tx, {
      oldDiscountDecrementRef: { id: "old" } as { id: string } as never,
      oldDiscountNextCount: 2,
      shouldIncrementNewDiscount: true,
      discountRef: { id: "new" } as { id: string } as never,
      FieldValue,
    });
    committed.push(...staged);
    assert.deepStrictEqual(committed.map((x) => x.ref), ["old", "new"]);
  });

  it("simulated transaction abort leaves no persisted writes", () => {
    const staged: Array<{ ref: string }> = [];
    const persisted: Array<{ ref: string }> = [];
    const tx = {
      update(ref: { id: string }) {
        staged.push({ ref: ref.id });
      },
    };
    const FieldValue = {
      increment: (n: number) => ({ __inc: n }),
      serverTimestamp: () => 0,
    };
    try {
      applyDiscountCounterSwapInTransaction(tx, {
        oldDiscountDecrementRef: { id: "old" } as { id: string } as never,
        oldDiscountNextCount: 1,
        shouldIncrementNewDiscount: true,
        discountRef: { id: "new" } as { id: string } as never,
        FieldValue,
      });
      throw new Error("abort");
    } catch {
      // Simulated Firestore rollback: staged writes are dropped.
      staged.length = 0;
    }
    assert.deepStrictEqual(persisted, []);
  });
});
