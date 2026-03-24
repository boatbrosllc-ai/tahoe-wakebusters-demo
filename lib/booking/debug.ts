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

/** True when bookingLog/bookingWarn should emit in production (verbose logging). Increases log volume and PCI-DSS scope. */
function isBookingVerboseLogEnabled(): boolean {
  if (typeof process === "undefined") return false;
  const env = process.env as { NODE_ENV?: string; BOOKING_LOG_LEVEL?: string };
  return env.NODE_ENV !== "production" || env.BOOKING_LOG_LEVEL === "verbose";
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
  | "create-checkout-session"
  | "create-checkout-session-direct"
  | "complete-after-payment"
  | "convert-hold"
  | "stripe-webhook"
  | "run-final-charges"
  | "client"
  | "slot-availability"
  | "receipt"
  | "stripe-customer-index";

/** Log an info-level booking step. Suppressed in production unless BOOKING_LOG_LEVEL=verbose. */
export function bookingLog(
  step: BookingLogStep,
  message: string,
  data?: Record<string, unknown> | null
): void {
  if (!isBookingVerboseLogEnabled()) return;
  const tag = `${PREFIX}:${step}`;
  if (data != null && Object.keys(data).length > 0) {
    console.log(`${tag} ${message}`, data);
  } else {
    console.log(`${tag} ${message}`);
  }
}

/** Log a warning (e.g. recoverable or unexpected but handled). Suppressed in production unless BOOKING_LOG_LEVEL=verbose. */
export function bookingWarn(
  step: BookingLogStep,
  message: string,
  data?: Record<string, unknown> | null
): void {
  if (!isBookingVerboseLogEnabled()) return;
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

/**
 * Generate a short incident reference code for public error responses (e.g. 503).
 * Log this code server-side with full diagnostics; return only the code to the client
 * so support can correlate without exposing infrastructure details.
 */
export function generateIncidentCode(): string {
  const t = Date.now().toString(36).slice(-4);
  const r = Math.random().toString(36).slice(2, 6);
  return `INC-${t}-${r}`.toUpperCase();
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
