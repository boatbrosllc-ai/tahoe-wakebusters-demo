/**
 * Load merged pricing calendar overrides (hourly rate per date) for one or more boat types.
 * Used so listing-boat flows apply the same overrides as admin pricing-calendar.
 */

import type { Firestore } from "firebase-admin/firestore";
import type { DocumentSnapshot } from "firebase-admin/firestore";

const COLLECTION = "pricingCalendar";

/** Short-lived cache to cut duplicate Firestore reads during date-prices + create-hold (serverless-safe). */
const PRICING_CALENDAR_CACHE_TTL_MS = 60_000;
type CalendarCacheEntry = { merged: Record<string, number> | undefined; expiresAt: number };
const pricingCalendarMergedCache = new Map<string, CalendarCacheEntry>();

/** Merge `rates` from multiple pricingCalendar docs; later snapshots overwrite same date keys. */
export function mergePricingCalendarRates(snapshots: DocumentSnapshot[]): Record<string, number> | undefined {
  const merged: Record<string, number> = {};
  for (const snap of snapshots) {
    if (!snap.exists) continue;
    const rates = snap.data()?.rates as Record<string, number> | undefined;
    if (!rates || typeof rates !== "object") continue;
    for (const [dateStr, cents] of Object.entries(rates)) {
      if (typeof cents === "number" && Number.isFinite(cents)) merged[dateStr] = cents;
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

export async function fetchPricingCalendarSnapsForBoatTypes(
  db: Firestore,
  boatTypes: string[]
): Promise<DocumentSnapshot[]> {
  const unique = Array.from(new Set(boatTypes.map((t) => t.trim()).filter(Boolean)));
  if (unique.length === 0) return [];
  return Promise.all(unique.map((bt) => db.collection(COLLECTION).doc(bt).get()));
}

export async function fetchMergedPricingCalendarRatesForBoatTypes(
  db: Firestore,
  boatTypes: string[]
): Promise<Record<string, number> | undefined> {
  const uniqueSorted = Array.from(new Set(boatTypes.map((t) => t.trim()).filter(Boolean))).sort();
  if (uniqueSorted.length === 0) return undefined;
  const cacheKey = uniqueSorted.join("\0");
  const now = Date.now();
  const hit = pricingCalendarMergedCache.get(cacheKey);
  if (hit && hit.expiresAt > now) {
    return hit.merged;
  }
  const snaps = await fetchPricingCalendarSnapsForBoatTypes(db, uniqueSorted);
  const merged = mergePricingCalendarRates(snaps);
  pricingCalendarMergedCache.set(cacheKey, { merged, expiresAt: now + PRICING_CALENDAR_CACHE_TTL_MS });
  return merged;
}
