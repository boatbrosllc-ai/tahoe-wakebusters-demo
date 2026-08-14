/**
 * Shared idempotent reconcile helpers for experience rates and addons.
 * Used by template seed and launch-packet seed.
 */
import type { CollectionReference, QueryDocumentSnapshot } from "firebase-admin/firestore";
import type { ExperienceAddon, ExperienceRate } from "@/lib/booking/types";

export type RateSeed = Omit<ExperienceRate, "active"> & { active: boolean };
export type AddonSeed = Omit<ExperienceAddon, "active"> & { active: boolean; catalogKey: string };

export async function reconcileRates(
  ratesRef: CollectionReference,
  desired: RateSeed[],
): Promise<void> {
  const existing = await ratesRef.get();
  const byHours = new Map<number, QueryDocumentSnapshot>();
  for (const doc of existing.docs) {
    const hours = (doc.data() as ExperienceRate).durationHours;
    if (typeof hours === "number" && !byHours.has(hours)) byHours.set(hours, doc);
  }

  const desiredHours = new Set(desired.map((r) => r.durationHours));

  for (const rate of desired) {
    const hit = byHours.get(rate.durationHours);
    if (hit) {
      await hit.ref.update({
        displayName: rate.displayName,
        priceCents: rate.priceCents,
        active: rate.active,
        ...(rate.priceHolidayCents != null ? { priceHolidayCents: rate.priceHolidayCents } : {}),
        ...(rate.priceWeekendCents != null ? { priceWeekendCents: rate.priceWeekendCents } : {}),
        ...(rate.priceFriSunCents != null ? { priceFriSunCents: rate.priceFriSunCents } : {}),
      });
    } else {
      await ratesRef.doc().set(rate);
    }
  }

  for (const [hours, doc] of Array.from(byHours.entries())) {
    if (!desiredHours.has(hours)) {
      await doc.ref.update({ active: false });
    }
  }
}

export async function reconcileAddons(
  addonsRef: CollectionReference,
  desired: AddonSeed[],
): Promise<void> {
  const existing = await addonsRef.get();
  const byKey = new Map<string, QueryDocumentSnapshot>();
  for (const doc of existing.docs) {
    const data = doc.data() as ExperienceAddon & { catalogKey?: string };
    const key = (data.catalogKey ?? data.name ?? "").toLowerCase().trim();
    if (key && !byKey.has(key)) byKey.set(key, doc);
  }

  for (const addon of desired) {
    const key = addon.catalogKey.toLowerCase();
    const nameKey = addon.name.toLowerCase();
    const hit = byKey.get(key) ?? byKey.get(nameKey);
    const payload = { ...addon, active: addon.active };
    if (hit) {
      await hit.ref.update(payload);
    } else {
      await addonsRef.doc().set(payload);
    }
  }
}
