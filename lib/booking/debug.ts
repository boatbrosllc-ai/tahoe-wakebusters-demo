/**
 * Centralized debug logging for the booking flow.
 * All messages use the [booking:step] prefix so logs can be filtered (e.g. grep "[booking]").
 * Safe to call from both server and client; avoid logging full PII (use redacted summaries).
 *
 * Log tiers (BOOKING_LOG_LEVEL):
 * - (default) bookingError always; bookingWarn on; bookingLog off
 * - quiet: bookingWarn suppressed (errors only)
 * - verbose: bookingLog on
 *
 * Client-only verbose UI debug: NEXT_PUBLIC_BOOKING_DEBUG=1 → bookingDebugLog
 */

const PREFIX = "[booking]";

/** True when client/debug UI logs should run (NEXT_PUBLIC_BOOKING_DEBUG only — not tied to NODE_ENV). */
export function isBookingDebugEnabled(): boolean {
  if (typeof process === "undefined") return false;
  const env = process.env as { NEXT_PUBLIC_BOOKING_DEBUG?: string };
  return env.NEXT_PUBLIC_BOOKING_DEBUG === "1";
}

function bookingLogLevel(): string {
  if (typeof process === "undefined") return "";
  const v = (process.env as { BOOKING_LOG_LEVEL?: string }).BOOKING_LOG_LEVEL?.trim().toLowerCase() ?? "";
  return v;
}

/** bookingWarn suppressed only when BOOKING_LOG_LEVEL=quiet */
function isBookingWarnEnabled(): boolean {
  return bookingLogLevel() !== "quiet";
}

/** bookingLog only when BOOKING_LOG_LEVEL=verbose */
function isBookingInfoVerboseEnabled(): boolean {
  return bookingLogLevel() === "verbose";
}

/**
 * Verbose debug log for dev console. Only logs when NEXT_PUBLIC_BOOKING_DEBUG=1.
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
  | "cleanup-holds"
  | "reconcile-rollback"
  | "transition-booking-status"
  | "release-hold"
  | "client"
  | "manage-pay-remaining"
  | "slot-availability"
  | "receipt"
  | "stripe-customer-index";

/** Log an info-level booking step. Emitted only when BOOKING_LOG_LEVEL=verbose. */
export function bookingLog(
  step: BookingLogStep,
  message: string,
  data?: Record<string, unknown> | null
): void {
  if (!isBookingInfoVerboseEnabled()) return;
  const tag = `${PREFIX}:${step}`;
  if (data != null && Object.keys(data).length > 0) {
    console.log(`${tag} ${message}`, data);
  } else {
    console.log(`${tag} ${message}`);
  }
}

/** Log a warning (e.g. recoverable or unexpected but handled). Suppressed when BOOKING_LOG_LEVEL=quiet. */
export function bookingWarn(
  step: BookingLogStep,
  message: string,
  data?: Record<string, unknown> | null
): void {
  if (!isBookingWarnEnabled()) return;
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
