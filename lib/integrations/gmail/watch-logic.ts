const RENEW_LEAD_MS = 24 * 60 * 60 * 1000;

export function shouldRenewGmailWatch(
  expirationMs: number | undefined,
  nowMs: number,
  leadMs = RENEW_LEAD_MS
): boolean {
  if (!expirationMs) return true;
  return expirationMs - nowMs <= leadMs;
}
