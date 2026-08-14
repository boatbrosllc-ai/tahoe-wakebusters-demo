import { brand } from "@/content/brand";
/**
 * ${brand.companyName} — fixed charter windows (Cabo / America/Mazatlan).
 *
 * Guest flow: package → date → window (half AM/PM) or full day + optional extension → checkout.
 * No free-form clock times; no boat picker (single boat).
 *
 * Inventory (one boat):
 *   - AM half + PM half can both sell the same calendar day
 *   - Full day (8h+) blocks AM and PM that day (even when base full ends at 2:00 and PM starts at 2:00)
 *   - Extensions (+1/+2/+3h) only on full-day packages
 */

import {
  FOUNDING_ANGLER_RATE_ACTIVE,
  formatUsdFromCents,
  getActiveCatalogRateCents,
} from "@/content/catalog-pricing";
import { buildSlotId, getSlotStartEnd, type ParsedSlotId } from "@/lib/booking/experience-slots";
import { intervalsOverlapMs } from "@/lib/booking/booking-interval";

export type NsfHalfWindowId = "am" | "pm";
export type NsfWindowId = NsfHalfWindowId | "full";
export type NsfExtensionHours = 0 | 1 | 2 | 3;

/** Extra hour offshore (USD cents) — charged via longer full-day rates (9/10/11h). */
export const NSF_EXTENSION_HOUR_CENTS = FOUNDING_ANGLER_RATE_ACTIVE ? 25_000 : 30_000; // $250 / $300

export type NsfCharterWindow = {
  id: NsfWindowId;
  /** Guest-facing name */
  label: string;
  /** Short calendar / chip label */
  shortLabel: string;
  arriveLabel: string;
  departLabel: string;
  returnLabel: string;
  startHour: number;
  startMinute: number;
  /** Base fishing hours (before full-day extensions) */
  baseDurationHours: number;
  /** Experience slug this window books */
  experienceSlug: "pontoon" | "watersports";
};

/** Half-day AM · arrive 5:15 · depart 6:00 · ~5h · back ~11:00 */
export const NSF_WINDOW_AM: NsfCharterWindow = {
  id: "am",
  label: "Morning",
  shortLabel: "Morning",
  arriveLabel: "Arrive 5:15 AM",
  departLabel: "Departs 6:00 AM",
  returnLabel: "Back ~11:00 AM",
  startHour: 6,
  startMinute: 0,
  baseDurationHours: 5,
  experienceSlug: "pontoon",
};

/** Half-day PM · arrive 1:30 · depart 2:00 · ~5h · back ~7:00 (crew break after AM) */
export const NSF_WINDOW_PM: NsfCharterWindow = {
  id: "pm",
  label: "Afternoon",
  shortLabel: "Afternoon",
  arriveLabel: "Arrive 1:30 PM",
  departLabel: "Departs 2:00 PM",
  returnLabel: "Back ~7:00 PM",
  startHour: 14,
  startMinute: 0,
  baseDurationHours: 5,
  experienceSlug: "pontoon",
};

/** Full day · arrive 5:15 · depart 6:00 · 8h · back ~2:00 (+ optional extensions) */
export const NSF_WINDOW_FULL: NsfCharterWindow = {
  id: "full",
  label: "Full day",
  shortLabel: "Full day",
  arriveLabel: "Arrive 5:15 AM",
  departLabel: "Departs 6:00 AM",
  returnLabel: "Back ~2:00 PM",
  startHour: 6,
  startMinute: 0,
  baseDurationHours: 8,
  experienceSlug: "watersports",
};

export const NSF_HALF_WINDOWS: NsfCharterWindow[] = [NSF_WINDOW_AM, NSF_WINDOW_PM];

/** Paid full-day extensions only (base 8h is implied by the Full day card). */
export const NSF_PAID_EXTENSION_OPTIONS: {
  hours: Exclude<NsfExtensionHours, 0>;
  label: string;
  endLabel: string;
}[] = [
  { hours: 1, label: "+1 hour", endLabel: "Until ~3:00 PM" },
  { hours: 2, label: "+2 hours", endLabel: "Until ~4:00 PM" },
  { hours: 3, label: "+3 hours", endLabel: "Until ~5:00 PM" },
];

/** @deprecated Prefer NSF_PAID_EXTENSION_OPTIONS — kept for any callers expecting the 0h row. */
export const NSF_EXTENSION_OPTIONS: {
  hours: NsfExtensionHours;
  label: string;
  endLabel: string;
}[] = [
  { hours: 0, label: "Standard full day (8 hours)", endLabel: "Back ~2:00 PM" },
  ...NSF_PAID_EXTENSION_OPTIONS.map((o) => ({
    hours: o.hours as NsfExtensionHours,
    label: `${o.label} (${o.endLabel.toLowerCase()})`,
    endLabel: o.endLabel.replace("Until", "Back"),
  })),
];

export function isNsfHalfDayBundle(bundleId: string | null | undefined): boolean {
  return bundleId === "nasty";
}

export function isNsfFullDayBundle(bundleId: string | null | undefined): boolean {
  return bundleId === "nastier" || bundleId === "nastiest";
}

export function nsfWindowsForBundle(bundleId: string | null | undefined): NsfCharterWindow[] {
  if (isNsfHalfDayBundle(bundleId)) return NSF_HALF_WINDOWS;
  if (isNsfFullDayBundle(bundleId)) return [NSF_WINDOW_FULL];
  return [];
}

export function nsfDurationHours(window: NsfCharterWindow, extensionHours: NsfExtensionHours = 0): number {
  if (window.id !== "full") return window.baseDurationHours;
  return window.baseDurationHours + extensionHours;
}

export function nsfFullDayRateCents(extensionHours: NsfExtensionHours): number {
  return getActiveCatalogRateCents("full") + extensionHours * NSF_EXTENSION_HOUR_CENTS;
}

export function nsfExtensionPriceLabel(extensionHours: NsfExtensionHours): string | null {
  if (extensionHours <= 0) return null;
  return `+${formatUsdFromCents(extensionHours * NSF_EXTENSION_HOUR_CENTS)}`;
}

export function buildNsfSlotId(
  dateStr: string,
  window: NsfCharterWindow,
  extensionHours: NsfExtensionHours = 0
): string {
  return buildSlotId(
    dateStr,
    window.startHour,
    nsfDurationHours(window, extensionHours),
    window.startMinute || undefined
  );
}

export function parseNsfWindowFromSlot(parsed: ParsedSlotId | null): NsfWindowId | null {
  if (!parsed) return null;
  if (parsed.startHour === 14 && parsed.durationHours === 5) return "pm";
  if (parsed.startHour === 6 && parsed.durationHours === 5) return "am";
  if (parsed.startHour === 6 && parsed.durationHours >= 8) return "full";
  return null;
}

/** True when trip is full-day style (blocks both half-day windows that calendar day). */
export function isNsfFullDaySlot(parsed: Pick<ParsedSlotId, "startHour" | "durationHours">): boolean {
  return parsed.startHour === 6 && parsed.durationHours >= 8;
}

export function isNsfAmHalfSlot(parsed: Pick<ParsedSlotId, "startHour" | "durationHours">): boolean {
  return parsed.startHour === 6 && parsed.durationHours === 5;
}

export function isNsfPmHalfSlot(parsed: Pick<ParsedSlotId, "startHour" | "durationHours">): boolean {
  return parsed.startHour === 14 && parsed.durationHours === 5;
}

/**
 * NSF inventory conflict — includes policy that full day blocks PM even when
 * base full ends at 2:00 and PM starts at 2:00 (adjacent intervals).
 */
export function nsfCharterSlotsConflict(
  a: Pick<ParsedSlotId, "dateStr" | "startHour" | "durationHours"> & { startMinute?: number },
  b: Pick<ParsedSlotId, "dateStr" | "startHour" | "durationHours"> & { startMinute?: number }
): boolean {
  if (a.dateStr !== b.dateStr) return false;

  const aStart = getSlotStartEnd(a.dateStr, a.startHour, a.durationHours, a.startMinute ?? 0).start.getTime();
  const aEnd = getSlotStartEnd(a.dateStr, a.startHour, a.durationHours, a.startMinute ?? 0).end.getTime();
  const bStart = getSlotStartEnd(b.dateStr, b.startHour, b.durationHours, b.startMinute ?? 0).start.getTime();
  const bEnd = getSlotStartEnd(b.dateStr, b.startHour, b.durationHours, b.startMinute ?? 0).end.getTime();
  if (intervalsOverlapMs(aStart, aEnd, bStart, bEnd)) return true;

  const aFull = isNsfFullDaySlot(a);
  const bFull = isNsfFullDaySlot(b);
  const aPm = isNsfPmHalfSlot(a);
  const bPm = isNsfPmHalfSlot(b);
  const aAm = isNsfAmHalfSlot(a);
  const bAm = isNsfAmHalfSlot(b);

  // Full day occupies the whole fishing day (AM + PM windows).
  if (aFull && (bFull || bAm || bPm)) return true;
  if (bFull && (aAm || aPm)) return true;

  return false;
}

/** Allowed listing-boat start times for NSF (seed / admin). */
export const NSF_ALLOWED_START_TIMES = [
  { hour: 6, minute: 0 },
  { hour: 14, minute: 0 },
] as const;

export function nsfWindowSummaryLine(
  window: NsfCharterWindow,
  extensionHours: NsfExtensionHours = 0
): string {
  if (window.id === "full" && extensionHours > 0) {
    const opt = NSF_EXTENSION_OPTIONS.find((o) => o.hours === extensionHours);
    return `${window.label} · ${window.departLabel} · ${8 + extensionHours} hours · ${opt?.endLabel ?? ""}`.trim();
  }
  return `${window.label} · ${window.arriveLabel} · ${window.departLabel} · ${window.returnLabel}`;
}
