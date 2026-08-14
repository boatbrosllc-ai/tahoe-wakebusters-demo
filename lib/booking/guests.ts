/**
 * Guest CRM records in the customer Firestore project.
 * Bookings and leads remain source events; this collection is the durable contact.
 */

import type { Firestore } from "firebase-admin/firestore";
import { getFirestoreExports } from "@/lib/booking/firebase-admin";

export const GUESTS_COLLECTION = "guests";

export function guestDocId(email: string): string {
  return email.trim().toLowerCase();
}

export type UpsertGuestInput = {
  email: string;
  name?: string;
  phone?: string;
  source: string;
  bookingId?: string;
  marketingOptIn?: boolean;
};

export async function upsertGuestRecord(db: Firestore, input: UpsertGuestInput): Promise<string | null> {
  const email = input.email.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const { FieldValue, Timestamp } = getFirestoreExports();
  const id = guestDocId(email);
  const ref = db.collection(GUESTS_COLLECTION).doc(id);
  const name = input.name?.trim() || "";
  const phone = input.phone?.trim() || "";
  const patch: Record<string, unknown> = {
    email,
    updatedAt: Timestamp.now(),
    sources: FieldValue.arrayUnion(input.source),
  };
  if (name) patch.name = name;
  if (phone) patch.phone = phone;
  if (input.bookingId?.trim()) {
    patch.lastBookingId = input.bookingId.trim();
    patch.bookingIds = FieldValue.arrayUnion(input.bookingId.trim());
  }
  if (input.marketingOptIn === true) patch.marketingOptIn = true;

  await ref.set(
    {
      ...patch,
      createdAt: Timestamp.now(),
    },
    { merge: true }
  );
  return id;
}
