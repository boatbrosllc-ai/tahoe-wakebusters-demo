import type { Firestore } from "firebase-admin/firestore";
import type { Booking } from "@/lib/booking/types";
import { buildExternalKey, type MarketplaceProvider } from "./types";
import { marketplaceEventAmountCents, marketplaceEventGuestName } from "./event-display";

const PROVIDERS = new Set(["boatsetter", "getmyboat", "viator"]);

function asProvider(value: unknown): MarketplaceProvider | null {
  return typeof value === "string" && PROVIDERS.has(value) ? (value as MarketplaceProvider) : null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Attach guest name and payout for the admin inbox, using stored event fields then linked bookings. */
export async function hydrateMarketplaceInboxEvents(
  db: Firestore,
  events: Array<Record<string, unknown> & { id: string }>
): Promise<Array<Record<string, unknown> & { id: string; customerName: string | null; totalCents: number | null }>> {
  const bookingById = new Map<string, Booking>();
  const ids = Array.from(
    new Set(
      events
        .map((e) => (typeof e.bookingId === "string" ? e.bookingId.trim() : ""))
        .filter(Boolean)
    )
  );
  for (const group of chunk(ids, 30)) {
    const snaps = await db.getAll(...group.map((id) => db.collection("bookings").doc(id)));
    for (const snap of snaps) {
      if (snap.exists) bookingById.set(snap.id, snap.data() as Booking);
    }
  }

  const missingKeys = new Set<string>();
  for (const event of events) {
    const booking = typeof event.bookingId === "string" ? bookingById.get(event.bookingId) : undefined;
    const name = marketplaceEventGuestName(event, booking);
    const cents = marketplaceEventAmountCents(event, booking);
    if (name && cents) continue;
    const provider = asProvider(event.provider);
    const externalId = typeof event.externalBookingId === "string" ? event.externalBookingId.trim() : "";
    if (!provider || !externalId) continue;
    missingKeys.add(buildExternalKey(provider, externalId));
  }

  const bookingByKey = new Map<string, Booking>();
  await Promise.all(
    Array.from(missingKeys).map(async (key) => {
      const snap = await db.collection("bookings").where("externalKey", "==", key).limit(1).get();
      if (snap.empty) return;
      bookingByKey.set(key, snap.docs[0].data() as Booking);
    })
  );

  return events.map((event) => {
    const provider = asProvider(event.provider);
    const externalId = typeof event.externalBookingId === "string" ? event.externalBookingId.trim() : "";
    const fromId = typeof event.bookingId === "string" ? bookingById.get(event.bookingId) : undefined;
    const fromKey =
      provider && externalId ? bookingByKey.get(buildExternalKey(provider, externalId)) : undefined;
    const booking = fromId ?? fromKey;
    return {
      ...event,
      customerName: marketplaceEventGuestName(event, booking),
      totalCents: marketplaceEventAmountCents(event, booking),
    };
  });
}
