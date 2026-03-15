/**
 * Shared hold resume: whether the request has an active discount to apply.
 * When false, the create-hold route must clear discount fields (discountCode, discountCents, stripeCouponId)
 * so resuming a previously discounted hold without a discount does not retain stale amounts in payment creation.
 * Extracted so it can be unit-tested without importing server-only or Firebase.
 */
export function sharedHoldResumeHasActiveDiscount(
  discountCodeApplied: string | undefined,
  discountCents: number
): boolean {
  return !!(discountCodeApplied && discountCents > 0);
}
