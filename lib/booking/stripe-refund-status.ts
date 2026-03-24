/** Poll interval when Stripe refund exists but status is not yet terminal. */
export const PENDING_STRIPE_REFUND_POLL_MS = 60_000;

/** Stripe `refund.status` — terminal success only when `succeeded`. */
export function classifyStripeRefundStatus(
  status: string | undefined
): "terminal_success" | "terminal_failure" | "non_terminal" {
  switch (status) {
    case "succeeded":
      return "terminal_success";
    case "failed":
    case "canceled":
      return "terminal_failure";
    case "pending":
    case "requires_action":
    default:
      return "non_terminal";
  }
}
