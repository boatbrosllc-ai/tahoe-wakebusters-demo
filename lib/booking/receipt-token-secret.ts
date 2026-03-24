/**
 * Receipt signing uses RECEIPT_TOKEN_SECRET only (no fallback) so a leaked manage secret cannot forge receipts.
 */

export function getReceiptTokenSecretOnly(): string | null {
  const dedicated = process.env.RECEIPT_TOKEN_SECRET?.trim();
  return dedicated || null;
}

export function hasReceiptTokenSecretConfigured(): boolean {
  return getReceiptTokenSecretOnly() != null;
}

/**
 * Fail fast in staging/production: receipt links and claim tokens require RECEIPT_TOKEN_SECRET.
 * Development may omit it for local testing.
 */
export function assertReceiptTokenSecretConfigured(): void {
  if (process.env.NODE_ENV === "development") return;
  if (!hasReceiptTokenSecretConfigured()) {
    throw new Error(
      "RECEIPT_TOKEN_SECRET is required in non-development environments. Without it, success pages and receipt claim tokens cannot work."
    );
  }
}

/** Production: both secrets must be set and must differ. */
export function isReceiptAndManageSecretsDistinctInProduction(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const r = process.env.RECEIPT_TOKEN_SECRET?.trim();
  const m = process.env.MANAGE_BOOKING_SECRET?.trim();
  if (!r || !m) return false;
  return r !== m;
}
