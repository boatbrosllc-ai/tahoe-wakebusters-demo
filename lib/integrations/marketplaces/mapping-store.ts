import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { MARKETPLACE_MAPS_COLLECTION } from "@/lib/integrations/gmail/constants";
import type { MarketplaceListingMap } from "./types";
import { DEFAULT_MARKETPLACE_MAPPINGS, findListingMapping, mappingMatchKey } from "./mapping";
import type { ExternalBookingEvent } from "./types";

export async function loadMarketplaceMappings(): Promise<MarketplaceListingMap[]> {
  const db = getDb();
  const snap = await db.collection(MARKETPLACE_MAPS_COLLECTION).get();
  const stored: MarketplaceListingMap[] = snap.docs.map((d) => {
    const data = d.data() as MarketplaceListingMap;
    return {
      provider: data.provider,
      matchType: data.matchType,
      matchValue: data.matchValue,
      experienceSlug: data.experienceSlug,
      experienceId: data.experienceId,
      boatId: data.boatId,
      durationHours: data.durationHours,
      autoMapped: data.autoMapped === true,
    };
  });
  const byKey = new Map<string, MarketplaceListingMap>();
  for (const m of DEFAULT_MARKETPLACE_MAPPINGS) byKey.set(mappingMatchKey(m), m);
  for (const m of stored) byKey.set(mappingMatchKey(m), m);
  return Array.from(byKey.values());
}

export async function upsertMarketplaceMapping(map: MarketplaceListingMap): Promise<string> {
  const db = getDb();
  const { Timestamp } = getFirestoreExports();
  const id = mappingMatchKey(map).replace(/[^a-z0-9:_-]+/g, "_");
  await db.collection(MARKETPLACE_MAPS_COLLECTION).doc(id).set(
    {
      ...map,
      matchValue: map.matchValue,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
  return id;
}

export async function seedDefaultMarketplaceMappings(): Promise<number> {
  const db = getDb();
  const { Timestamp } = getFirestoreExports();
  let n = 0;
  for (const m of DEFAULT_MARKETPLACE_MAPPINGS) {
    const id = mappingMatchKey(m).replace(/[^a-z0-9:_-]+/g, "_");
    const ref = db.collection(MARKETPLACE_MAPS_COLLECTION).doc(id);
    const snap = await ref.get();
    if (snap.exists) continue;
    await ref.set({ ...m, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
    n++;
  }
  return n;
}

export function mappingForEvent(event: ExternalBookingEvent, maps: MarketplaceListingMap[]): MarketplaceListingMap | null {
  return findListingMapping(event, maps);
}
