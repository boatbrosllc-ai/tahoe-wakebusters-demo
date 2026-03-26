import type { firestore as FirestoreTypes } from "firebase-admin";

export type FirestoreTxLike = Pick<FirestoreTypes.Transaction, "update">;

export function applyDiscountCounterSwapInTransaction(
  tx: FirestoreTxLike,
  args: {
    oldDiscountDecrementRef: FirestoreTypes.DocumentReference | null;
    oldDiscountNextCount: number | null;
    shouldIncrementNewDiscount: boolean;
    discountRef: FirestoreTypes.DocumentReference | null;
    FieldValue: { increment: (n: number) => unknown; serverTimestamp: () => unknown };
  }
) {
  const {
    oldDiscountDecrementRef,
    oldDiscountNextCount,
    shouldIncrementNewDiscount,
    discountRef,
    FieldValue,
  } = args;
  // Invariant: old-code decrement + new-code increment MUST happen in this same transaction callback.
  // If the transaction aborts, Firestore rolls both back, preventing permanent usedCount drift.
  if (oldDiscountDecrementRef && oldDiscountNextCount != null) {
    tx.update(oldDiscountDecrementRef, {
      usedCount: oldDiscountNextCount,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  if (shouldIncrementNewDiscount && discountRef) {
    tx.update(discountRef, {
      usedCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}
