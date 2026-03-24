/**
 * When a booking is completed but a discount code exceeded its limit, record pending refund + durable outbox emails.
 * Call this from the code path that creates the `discount_limit_exceeded` pending refund (same transaction or immediately after).
 */

import type { Firestore } from "firebase-admin/firestore";
import { upsertPendingRefundRecord } from "@/lib/booking/pending-refund-idempotent";
import { addDiscountLimitExceededOutboxIfAbsent } from "@/lib/booking/notification-outbox";

export async function recordDiscountLimitExceededAndEnqueueOutbox(
  db: Firestore,
  params: {
    bookingId: string;
    holdId: string;
    paymentIntentId: string;
    customerEmail?: string;
  }
): Promise<void> {
  await upsertPendingRefundRecord(
    db,
    {
      reason: "discount_limit_exceeded",
      holdId: params.holdId,
      paymentIntentId: params.paymentIntentId,
    },
    {
      bookingId: params.bookingId,
      holdId: params.holdId,
      paymentIntentId: params.paymentIntentId,
      requiresReview: true,
      ...(params.customerEmail && { customerEmail: params.customerEmail }),
    }
  );
  await addDiscountLimitExceededOutboxIfAbsent(db, params.bookingId);
}
