/**
 * Mutable process-level flags set from `instrumentation.ts` at startup.
 * Booking handlers may return 503 when these indicate misconfiguration.
 */

export let bookingReady = true;

export let isLegacyFallbackSafe = true;

export function setBookingReadyForProductionStartup(value: boolean): void {
  bookingReady = value;
}

export function setLegacyFallbackSafeForProductionStartup(value: boolean): void {
  isLegacyFallbackSafe = value;
}
