/**
 * Shared create-hold HTTP error contract: 503 payloads and client retry policy.
 */

export type CreateHold503Code =
  | "rate_limit_unavailable"
  | "firebase_config_unavailable"
  | "firestore_transient"
  | "block_check_unavailable";

/** 503 codes where bounded client retry is appropriate. */
const RETRYABLE_503_CODES = new Set<string>([
  "rate_limit_unavailable",
  "firestore_transient",
  "block_check_unavailable",
]);

export function isRetryableCreateHold503Code(code: string | undefined): boolean {
  return typeof code === "string" && RETRYABLE_503_CODES.has(code);
}

export function createHold503Payload(
  incidentId: string,
  code: CreateHold503Code,
  error: string
): { error: string; code: CreateHold503Code; incidentId: string } {
  return { error, code, incidentId };
}
