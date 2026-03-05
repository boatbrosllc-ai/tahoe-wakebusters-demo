/**
 * Centralized debug logging for the booking flow.
 * All messages use the [booking:step] prefix so logs can be filtered (e.g. grep "[booking]").
 * Safe to call from both server and client; avoid logging full PII (use redacted summaries).
 */

const PREFIX = "[booking]";

/** True when debug logs should run: development, or NEXT_PUBLIC_BOOKING_DEBUG=1 in env. */
export function isBookingDebugEnabled(): boolean {
  if (typeof process === "undefined") return false;
  const env = process.env as { NODE_ENV?: string; NEXT_PUBLIC_BOOKING_DEBUG?: string };
  return env.NODE_ENV === "development" || env.NEXT_PUBLIC_BOOKING_DEBUG === "1";
}

/**
 * Verbose debug log for dev console. Only logs when isBookingDebugEnabled() is true.
 * Use for slots fetch, month change, date selection, etc. Filter in console by "[booking:client:debug]".
 */
export function bookingDebugLog(
  step: string,
  message: string,
  data?: Record<string, unknown> | null
): void {
  if (!isBookingDebugEnabled()) return;
  const tag = "[booking:client:debug]";
  if (data != null && Object.keys(data).length > 0) {
    console.log(`${tag} [${step}] ${message}`, data);
  } else {
    console.log(`${tag} [${step}] ${message}`);
  }
}

export type BookingLogStep =
  | "create-hold"
  | "create-payment-intent"
  | "complete-after-payment"
  | "convert-hold"
  | "stripe-webhook"
  | "client";

/** Log an info-level booking step (always on; use for flow tracing and debugging). */
export function bookingLog(
  step: BookingLogStep,
  message: string,
  data?: Record<string, unknown> | null
): void {
  const tag = `${PREFIX}:${step}`;
  if (data != null && Object.keys(data).length > 0) {
    console.log(`${tag} ${message}`, data);
  } else {
    console.log(`${tag} ${message}`);
  }
}

/** Log a warning (e.g. recoverable or unexpected but handled). */
export function bookingWarn(
  step: BookingLogStep,
  message: string,
  data?: Record<string, unknown> | null
): void {
  const tag = `${PREFIX}:${step}`;
  if (data != null && Object.keys(data).length > 0) {
    console.warn(`${tag} ${message}`, data);
  } else {
    console.warn(`${tag} ${message}`);
  }
}

/** Log an error (always use for failures so issues can be diagnosed). */
export function bookingError(
  step: BookingLogStep,
  message: string,
  error?: unknown,
  data?: Record<string, unknown> | null
): void {
  const tag = `${PREFIX}:${step}`;
  if (error != null) {
    console.error(`${tag} ${message}`, error, data ?? {});
  } else if (data != null && Object.keys(data).length > 0) {
    console.error(`${tag} ${message}`, data);
  } else {
    console.error(`${tag} ${message}`);
  }
}

/** Redact email for logs: show first 2 chars + domain (e.g. "ab***@example.com"). */
export function redactEmail(email: string): string {
  if (!email || email.length < 5) return "[redacted]";
  const at = email.indexOf("@");
  if (at < 0) return "[redacted]";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return local + "***" + domain;
  return local.slice(0, 2) + "***" + domain;
}
