/** Page size for ordered pendingRefund queries (due-time order). */
export const PENDING_REFUND_PROCESSOR_PAGE_SIZE = 40;
/** Max refund attempts per cron run. */
export const PENDING_REFUND_PROCESSOR_RUN_BUDGET = 40;

/**
 * Due when `nextRetryAt <= now`. Rows without `nextRetryAt` are excluded from the
 * ordered production query (`orderBy("nextRetryAt")`); backfill assigns a timestamp.
 */
export function isPendingRefundDueForProcessing(
  data: { nextRetryAt?: { toDate?: () => Date } },
  now: Date
): boolean {
  const next = data.nextRetryAt?.toDate?.();
  if (next == null) return false;
  return next <= now;
}
