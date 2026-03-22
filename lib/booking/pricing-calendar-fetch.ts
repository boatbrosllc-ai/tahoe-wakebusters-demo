/**
 * Load merged pricing calendar overrides (hourly rate per date) for one or more boat types.
 * Used so listing-boat flows apply the same overrides as admin pricing-calendar.
 */

import type { Firestore } from "firebase-admin/firestore";
import type { DocumentSnapshot } from "firebase-admin/firestore";

const COLLECTION = "pricingCalendar";

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
  const snaps = await fetchPricingCalendarSnapsForBoatTypes(db, boatTypes);
  return mergePricingCalendarRates(snaps);
}
