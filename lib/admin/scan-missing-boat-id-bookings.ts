/**
 * Shared logic for counting slot-taken bookings that need a boatId for per-boat occupancy
 * (matches GET /api/admin/dashboard recentBookingsMissingBoatId).
 */
import type { Firestore } from "firebase-admin/firestore";
import type { Booking, Experience } from "@/lib/booking/types";
import { BOOKING_STATUSES_SLOT_TAKEN, bookingRequiresBoatIdForOccupancyAlert } from "@/lib/booking/types";

const SAMPLE_LIMIT = 500;

export type MissingBoatIdScanResult = {
  count: number;
  bookingIds: string[];
};

export async function scanRecentBookingsMissingBoatId(db: Firestore): Promise<MissingBoatIdScanResult> {
  const [experiencesSnap, bookingsSnap] = await Promise.all([
    db.collection("experiences").get(),
    db.collection("bookings").orderBy("createdAt", "desc").limit(SAMPLE_LIMIT).get(),
  ]);

  const experiencePricingType = new Map<string, Experience["pricingType"]>();
  experiencesSnap.docs.forEach((doc) => {
    const data = doc.data() as Experience;
    experiencePricingType.set(doc.id, data.pricingType);
    if (typeof data.slug === "string" && data.slug.trim()) {
      experiencePricingType.set(data.slug.trim(), data.pricingType);
    }
  });

  let count = 0;
  const bookingIds: string[] = [];
  for (const d of bookingsSnap.docs) {
    const b = d.data() as Booking;
    const st = b.status as string | undefined;
    const bid = typeof b.boatId === "string" ? b.boatId.trim() : "";
    const expKey = typeof b.experienceId === "string" ? b.experienceId.trim() : "";
    const pricingType = expKey ? experiencePricingType.get(expKey) : undefined;
    if (
      st &&
      BOOKING_STATUSES_SLOT_TAKEN.has(st as never) &&
      !bid &&
      bookingRequiresBoatIdForOccupancyAlert(b.bookingMode, pricingType)
    ) {
      count++;
      if (bookingIds.length < 50) bookingIds.push(d.id);
    }
  }
  return { count, bookingIds };
}
