/**
 * Classify Firestore / gRPC errors that are typically recoverable (timeouts, overload, backend unavailable).
 * Used by create-hold to return 503 instead of 500 so clients can retry with backoff.
 */

function normalizeMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * True when the failure is likely transient infrastructure (retry may succeed).
 * Conservative: prefers known gRPC / Firestore codes and common network signals.
 */
export function isTransientFirestoreFailure(err: unknown): boolean {
  if (err == null) return false;
  const e = err as {
    code?: number | string;
    message?: string;
    status?: number;
    details?: string;
  };
  const msg = normalizeMessage(err).toLowerCase();
  const code = e.code;

  if (typeof code === "number") {
    // gRPC: 4 DEADLINE_EXCEEDED, 8 RESOURCE_EXHAUSTED, 10 ABORTED, 14 UNAVAILABLE, 13 INTERNAL (sometimes transient)
    if ([4, 8, 10, 14].includes(code)) return true;
  }
  if (typeof code === "string") {
    const u = code.toUpperCase().replace(/-/g, "_");
    if (
      [
        "UNAVAILABLE",
        "DEADLINE_EXCEEDED",
        "RESOURCE_EXHAUSTED",
        "ABORTED",
        "DEADLINE EXCEEDED",
      ].includes(u) ||
      u === "4" ||
      u === "8" ||
      u === "10" ||
      u === "14"
    ) {
      return true;
    }
  }

  if (typeof e.status === "number" && (e.status === 503 || e.status === 429)) return true;

  // Avoid matching user-facing copy like "Slot no longer available" — require infra-shaped phrases.
  if (
    msg.includes("deadline exceeded") ||
    msg.includes("deadline_exceeded") ||
    msg.includes("resource_exhausted") ||
    msg.includes("aborted") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("enetunreach") ||
    msg.includes("socket hang up") ||
    msg.includes("network error") ||
    msg.includes("trying to connect") ||
    msg.includes("backend error") ||
    msg.includes("statuscode 503") ||
    msg.includes(" status code 503") ||
    msg.includes("tcp ") ||
    (msg.includes("tls") && msg.includes("handshake"))
  ) {
    return true;
  }

  return false;
}
