/**
 * Deterministic Stripe idempotency keys for booking flows.
 * Include `holdPaymentAttemptVersion` so resumed holds (incremented version) get fresh Stripe objects
 * instead of replaying a previous idempotency response.
 */

export function buildPaymentIntentIdempotencyKey(params: {
  holdId: string;
  payFullAmount: boolean;
  chargeCents: number;
  holdPaymentAttemptVersion: number;
}): string {
  const stage = params.payFullAmount ? "full" : "deposit";
  return `pi-${params.holdId}-${stage}-${params.chargeCents}-v${params.holdPaymentAttemptVersion}`;
}

export function buildCheckoutSessionIdempotencyKey(params: {
  holdId: string;
  embedded: boolean;
  holdPaymentAttemptVersion: number;
}): string {
  const mode = params.embedded ? "emb" : "redir";
  return `cs-${params.holdId}-${mode}-v${params.holdPaymentAttemptVersion}`;
}

/** Matches `pendingRefunds` document id and `process-pending-refunds` Stripe idempotency key. */
export function buildAdminCancelRefundIdempotencyKey(pendingRefundDocId: string): string {
  return pendingRefundDocId;
}
