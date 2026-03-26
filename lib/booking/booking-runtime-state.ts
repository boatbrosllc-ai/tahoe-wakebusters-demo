/**
 * Mutable process-level flags set from `instrumentation.ts` at startup.
 * Booking handlers may return 503 when these indicate misconfiguration.
 */

export let bookingReady = true;

export let isLegacyFallbackSafe = true;
export let legacyBookingBacklogCount = 0;
export let legacyBookingBacklogThresholdExceeded = false;
export let disableBoatSupplementScanEffective = process.env.DISABLE_BOAT_SUPPLEMENT_SCAN === "true";

export function setBookingReadyForProductionStartup(value: boolean): void {
  bookingReady = value;
}

export function setLegacyFallbackSafeForProductionStartup(value: boolean): void {
  isLegacyFallbackSafe = value;
}

export function setLegacyBookingBacklogStateForProductionStartup(
  count: number,
  thresholdExceeded: boolean
): void {
  legacyBookingBacklogCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  legacyBookingBacklogThresholdExceeded = thresholdExceeded === true;
}

export function setDisableBoatSupplementScanEffectiveForProductionStartup(value: boolean): void {
  disableBoatSupplementScanEffective = value === true;
}
