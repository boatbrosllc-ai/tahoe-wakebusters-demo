import {
  FINANCIAL_CHANNEL_LABELS,
  FINANCIAL_CHANNEL_ORDER,
  financialChannelFromBooking,
  type FinancialChannelId,
  type MarketplaceSourceFields,
} from "@/lib/admin/marketplace-source";
import {
  getCentralCalendarDayBounds,
  getDateStrInSlotTimezone,
  parseSlotIdRelaxed,
} from "@/lib/booking/experience-slots";
import { payoutCentsFromMarketplaceFields } from "@/lib/integrations/marketplaces/money";
import {
  bookingCountsTowardActiveRevenueTotals,
  totalSummaryAttributedRevenueCents,
} from "@/lib/booking/summary-revenue";
import type { Booking } from "@/lib/booking/types";

export type FinancialsChannelAgg = {
  id: FinancialChannelId;
  revenueCents: number;
  bookingCount: number;
  missingPayoutCount: number;
};

export type FinancialsChannelRow = FinancialsChannelAgg & {
  label: string;
  share: number;
};

/** Display/reporting amount: Stripe-attributed total, else marketplace owner payout from the saved email. */
export function attributedFinancialsRevenueCents(booking: Booking): number {
  const base = totalSummaryAttributedRevenueCents(booking);
  if (base > 0) return base;
  if (financialChannelFromBooking(booking) === "direct") return 0;
  return (
    payoutCentsFromMarketplaceFields({
      totalCents: booking.pricing?.totalCents,
      details: booking.marketplaceDetails,
      excerpt: booking.marketplaceEmailExcerpt,
      notes: booking.specialNotes,
    }) ?? 0
  );
}

export function bookingCountedInRevenueSummaries(booking: Booking): boolean {
  return booking.summaryCountersApplied === true;
}

export function bookingTripDateStr(booking: { startDateStr?: string | null; slotId?: string | null }): string | null {
  const raw = typeof booking.startDateStr === "string" ? booking.startDateStr.trim() : "";
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  return parseSlotIdRelaxed(booking.slotId ?? "")?.dateStr ?? null;
}

export function isoDateStrInRange(dateStr: string, fromStr?: string | null, toStr?: string | null): boolean {
  if (fromStr && dateStr < fromStr) return false;
  if (toStr && dateStr > toStr) return false;
  return true;
}

/**
 * Inclusive America/Chicago bounds for a YYYY-MM-DD financials query param.
 * Date-only strings must not use `new Date("YYYY-MM-DD")` (UTC midnight), which drops
 * same-day Central-time marketplace syncs from a "through today" range.
 */
export function parseFinancialsDayBound(raw: string | null | undefined, bound: "start" | "end"): Date | null {
  if (!raw) return null;
  const dateStr = raw.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const { dayStart, dayEnd } = getCentralCalendarDayBounds(dateStr);
  return bound === "start" ? dayStart : dayEnd;
}

/** Marketplace trips count if the charter day or the ingest/created day falls in the selected range. */
export function marketplaceBookingInSelectedRange(
  booking: { startDateStr?: string | null; slotId?: string | null },
  createdAt: Date | null,
  fromDate: Date | null,
  toDateEnd: Date | null,
  fromStr: string | null,
  toStr: string | null
): boolean {
  const trip = bookingTripDateStr(booking);
  if (trip && isoDateStrInRange(trip, fromStr, toStr)) return true;
  if (createdAt && isoDateStrInRange(getDateStrInSlotTimezone(createdAt), fromStr, toStr)) return true;
  if (!fromDate && !toDateEnd) return true;
  if (!createdAt) return false;
  if (fromDate && createdAt < fromDate) return false;
  if (toDateEnd && createdAt > toDateEnd) return false;
  return true;
}

export function createChannelAggMap(): Map<FinancialChannelId, FinancialsChannelAgg> {
  const map = new Map<FinancialChannelId, FinancialsChannelAgg>();
  for (const id of FINANCIAL_CHANNEL_ORDER) {
    map.set(id, { id, revenueCents: 0, bookingCount: 0, missingPayoutCount: 0 });
  }
  return map;
}

export function ingestFinancialsChannel(
  map: Map<FinancialChannelId, FinancialsChannelAgg>,
  booking: Booking & MarketplaceSourceFields
): void {
  if (!bookingCountsTowardActiveRevenueTotals(booking)) return;
  const channel = financialChannelFromBooking(booking);
  const attributed = attributedFinancialsRevenueCents(booking);
  const cur = map.get(channel) ?? { id: channel, revenueCents: 0, bookingCount: 0, missingPayoutCount: 0 };
  cur.revenueCents += attributed;
  cur.bookingCount += 1;
  if (channel !== "direct" && attributed <= 0) cur.missingPayoutCount += 1;
  map.set(channel, cur);
}

export function finalizeFinancialsChannels(
  map: Map<FinancialChannelId, FinancialsChannelAgg>,
  scopedRevenueCents: number
): FinancialsChannelRow[] {
  const denom = scopedRevenueCents > 0 ? scopedRevenueCents : 0;
  return FINANCIAL_CHANNEL_ORDER.map((id) => {
    const agg = map.get(id) ?? { id, revenueCents: 0, bookingCount: 0, missingPayoutCount: 0 };
    return {
      ...agg,
      label: FINANCIAL_CHANNEL_LABELS[id],
      share: denom > 0 ? agg.revenueCents / denom : 0,
    };
  });
}

export type MarketplaceFinancialRow = {
  id: string;
  createdAt: string;
  startDateStr: string | null;
  customerName: string;
  customerEmail: string;
  experienceId: string;
  experienceName: string;
  channel: Exclude<FinancialChannelId, "direct">;
  payoutCents: number;
};

export function marketplaceFinancialRowFromBooking(
  id: string,
  booking: Booking & MarketplaceSourceFields,
  createdAtIso: string
): MarketplaceFinancialRow | null {
  if (!bookingCountsTowardActiveRevenueTotals(booking)) return null;
  const channel = financialChannelFromBooking(booking);
  if (channel === "direct") return null;
  const eid = typeof booking.experienceId === "string" ? booking.experienceId.trim() : "";
  return {
    id,
    createdAt: createdAtIso,
    startDateStr: typeof booking.startDateStr === "string" ? booking.startDateStr : null,
    customerName: booking.customer?.name ?? "",
    customerEmail: booking.customer?.email ?? "",
    experienceId: eid,
    experienceName: eid || "—",
    channel,
    payoutCents: attributedFinancialsRevenueCents(booking),
  };
}

export function marketplaceTotalsFromChannels(rows: FinancialsChannelRow[]): {
  marketplaceRevenueCents: number;
  marketplaceBookingCount: number;
  marketplaceMissingPayoutCount: number;
  directRevenueCents: number;
  directBookingCount: number;
} {
  let marketplaceRevenueCents = 0;
  let marketplaceBookingCount = 0;
  let marketplaceMissingPayoutCount = 0;
  let directRevenueCents = 0;
  let directBookingCount = 0;
  for (const row of rows) {
    if (row.id === "direct") {
      directRevenueCents += row.revenueCents;
      directBookingCount += row.bookingCount;
    } else {
      marketplaceRevenueCents += row.revenueCents;
      marketplaceBookingCount += row.bookingCount;
      marketplaceMissingPayoutCount += row.missingPayoutCount;
    }
  }
  return {
    marketplaceRevenueCents,
    marketplaceBookingCount,
    marketplaceMissingPayoutCount,
    directRevenueCents,
    directBookingCount,
  };
}
