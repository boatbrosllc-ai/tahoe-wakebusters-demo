import type { DiscountAssignedToType } from "./types";
import { normalizeDiscountAssignedToType } from "./discount-assignment";

export const UNASSIGNED_DISCOUNT_OWNER_LABEL = "Unassigned";
export const DISCOUNT_REDEMPTION_PREVIEW_LIMIT = 25;

export type DiscountRedemptionRow = {
  bookingId: string;
  createdAt: string;
  customerEmail: string;
  customerName: string;
  experienceId: string;
  experienceName: string;
  status: string;
  discountCode: string;
  discountCents: number;
  netRevenueCents: number;
};

export type DiscountCatalogEntry = {
  code: string;
  assignedTo?: string | null;
  assignedToType?: string | null;
  active?: boolean;
  usedCount?: number;
  maxRedemptions?: number | null;
  description?: string | null;
};

export type MutableDiscountCodeAgg = {
  code: string;
  conversionCount: number;
  uniqueEmails: Set<string>;
  discountCents: number;
  netRevenueCents: number;
  redemptions: DiscountRedemptionRow[];
};

export type DiscountCodeReportRow = {
  code: string;
  assignedTo: string | null;
  assignedToType: DiscountAssignedToType | null;
  active: boolean | null;
  usedCount: number | null;
  maxRedemptions: number | null;
  description: string | null;
  conversionCount: number;
  uniqueCustomerCount: number;
  discountCents: number;
  netRevenueCents: number;
  averageBookingCents: number;
  /** 0–1 share of scoped attributed revenue. */
  shareOfRevenue: number;
  redemptions: DiscountRedemptionRow[];
};

export type DiscountOwnerReportRow = {
  assignedTo: string;
  assignedToType: DiscountAssignedToType | null;
  conversionCount: number;
  uniqueCustomerCount: number;
  discountCents: number;
  netRevenueCents: number;
  codeCount: number;
  codes: string[];
};

export type DiscountFinancialsReport = {
  totalDiscountGivenCents: number;
  discountedBookingCount: number;
  discountedRevenueCents: number;
  byCode: DiscountCodeReportRow[];
  byOwner: DiscountOwnerReportRow[];
};

export function normalizeDiscountCodeKey(code: string | null | undefined): string {
  return typeof code === "string" ? code.trim().toUpperCase() : "";
}

export function tryDiscountRedemptionFromBooking(
  bookingId: string,
  booking: {
    discountCode?: string | null;
    discountCents?: number | null;
    customer?: { email?: string; name?: string };
    experienceId?: string;
    status?: string;
  },
  createdAt: string,
  netRevenueCents: number,
  experienceName?: string
): DiscountRedemptionRow | null {
  const code = normalizeDiscountCodeKey(booking.discountCode);
  if (!code) return null;
  return {
    bookingId,
    createdAt,
    customerEmail: booking.customer?.email ?? "",
    customerName: booking.customer?.name ?? "",
    experienceId: booking.experienceId ?? "",
    experienceName: experienceName || booking.experienceId || "—",
    status: booking.status ?? "",
    discountCode: code,
    discountCents:
      typeof booking.discountCents === "number" && Number.isFinite(booking.discountCents) && booking.discountCents > 0
        ? Math.floor(booking.discountCents)
        : 0,
    netRevenueCents: Math.max(0, Math.floor(netRevenueCents) || 0),
  };
}

export function createDiscountAggMap(): Map<string, MutableDiscountCodeAgg> {
  return new Map();
}

/** Record a slot-taken booking that used a discount code. */
export function ingestDiscountedBooking(
  map: Map<string, MutableDiscountCodeAgg>,
  row: DiscountRedemptionRow
): void {
  const code = normalizeDiscountCodeKey(row.discountCode);
  if (!code) return;
  let agg = map.get(code);
  if (!agg) {
    agg = {
      code,
      conversionCount: 0,
      uniqueEmails: new Set(),
      discountCents: 0,
      netRevenueCents: 0,
      redemptions: [],
    };
    map.set(code, agg);
  }
  agg.conversionCount += 1;
  const email = row.customerEmail.trim().toLowerCase();
  if (email) agg.uniqueEmails.add(email);
  agg.discountCents += Math.max(0, Math.floor(row.discountCents) || 0);
  agg.netRevenueCents += Math.max(0, Math.floor(row.netRevenueCents) || 0);
  agg.redemptions.push({ ...row, discountCode: code });
}

export function finalizeDiscountFinancialsReport(
  map: Map<string, MutableDiscountCodeAgg>,
  catalog: DiscountCatalogEntry[],
  scopedAttributedRevenueCents: number,
  options?: { includeUnusedActiveCodes?: boolean; redemptionPreviewLimit?: number }
): DiscountFinancialsReport {
  const includeUnusedActiveCodes = options?.includeUnusedActiveCodes !== false;
  const redemptionPreviewLimit = options?.redemptionPreviewLimit ?? DISCOUNT_REDEMPTION_PREVIEW_LIMIT;
  const catalogByCode = new Map<string, DiscountCatalogEntry>();
  for (let i = 0; i < catalog.length; i++) {
    const entry = catalog[i];
    const code = normalizeDiscountCodeKey(entry.code);
    if (!code || catalogByCode.has(code)) continue;
    catalogByCode.set(code, { ...entry, code });
  }

  const codes = Array.from(new Set(Array.from(map.keys()).concat(Array.from(catalogByCode.keys()))));
  const byCode: DiscountCodeReportRow[] = [];
  const scopedRevenue = Math.max(0, scopedAttributedRevenueCents);

  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    const agg = map.get(code);
    const cat = catalogByCode.get(code);
    const conversionCount = agg?.conversionCount ?? 0;
    const active = typeof cat?.active === "boolean" ? cat.active : null;
    if (conversionCount === 0 && !includeUnusedActiveCodes) continue;
    if (conversionCount === 0 && includeUnusedActiveCodes && active !== true && !agg) continue;

    const discountCents = agg?.discountCents ?? 0;
    const netRevenueCents = agg?.netRevenueCents ?? 0;
    const uniqueCustomerCount = agg?.uniqueEmails.size ?? 0;
    const assignedTo = cat?.assignedTo?.trim() ? cat.assignedTo.trim() : null;
    const assignedToType = normalizeDiscountAssignedToType(cat?.assignedToType ?? undefined) ?? null;
    const redemptions = (agg?.redemptions ?? [])
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, redemptionPreviewLimit);

    byCode.push({
      code,
      assignedTo,
      assignedToType,
      active,
      usedCount: typeof cat?.usedCount === "number" ? cat.usedCount : null,
      maxRedemptions: typeof cat?.maxRedemptions === "number" ? cat.maxRedemptions : null,
      description: cat?.description?.trim() ? cat.description.trim() : null,
      conversionCount,
      uniqueCustomerCount,
      discountCents,
      netRevenueCents,
      averageBookingCents: conversionCount > 0 ? Math.round(netRevenueCents / conversionCount) : 0,
      shareOfRevenue: scopedRevenue > 0 ? netRevenueCents / scopedRevenue : 0,
      redemptions,
    });
  }

  byCode.sort((a, b) => b.netRevenueCents - a.netRevenueCents || b.conversionCount - a.conversionCount || a.code.localeCompare(b.code));

  const ownerMap = new Map<
    string,
    {
      assignedTo: string;
      assignedToType: DiscountAssignedToType | null;
      conversionCount: number;
      uniqueEmails: Set<string>;
      discountCents: number;
      netRevenueCents: number;
      codes: Set<string>;
    }
  >();

  for (const row of byCode) {
    if (row.conversionCount === 0) continue;
    const assignedTo = row.assignedTo || UNASSIGNED_DISCOUNT_OWNER_LABEL;
    const ownerKey = `${assignedTo.toLowerCase()}::${row.assignedToType ?? ""}`;
    let owner = ownerMap.get(ownerKey);
    if (!owner) {
      owner = {
        assignedTo,
        assignedToType: row.assignedToType,
        conversionCount: 0,
        uniqueEmails: new Set(),
        discountCents: 0,
        netRevenueCents: 0,
        codes: new Set(),
      };
      ownerMap.set(ownerKey, owner);
    }
    owner.conversionCount += row.conversionCount;
    owner.discountCents += row.discountCents;
    owner.netRevenueCents += row.netRevenueCents;
    owner.codes.add(row.code);
    const agg = map.get(row.code);
    if (agg) {
      Array.from(agg.uniqueEmails).forEach((email) => owner.uniqueEmails.add(email));
    }
  }

  const byOwner: DiscountOwnerReportRow[] = Array.from(ownerMap.values())
    .map((o) => ({
      assignedTo: o.assignedTo,
      assignedToType: o.assignedToType,
      conversionCount: o.conversionCount,
      uniqueCustomerCount: o.uniqueEmails.size,
      discountCents: o.discountCents,
      netRevenueCents: o.netRevenueCents,
      codeCount: o.codes.size,
      codes: Array.from(o.codes).sort(),
    }))
    .sort((a, b) => b.netRevenueCents - a.netRevenueCents || b.conversionCount - a.conversionCount || a.assignedTo.localeCompare(b.assignedTo));

  const converted = byCode.filter((r) => r.conversionCount > 0);
  return {
    totalDiscountGivenCents: converted.reduce((s, r) => s + r.discountCents, 0),
    discountedBookingCount: converted.reduce((s, r) => s + r.conversionCount, 0),
    discountedRevenueCents: converted.reduce((s, r) => s + r.netRevenueCents, 0),
    byCode,
    byOwner,
  };
}
