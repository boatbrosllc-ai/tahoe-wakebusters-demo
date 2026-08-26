import type { Firestore, Query, QuerySnapshot } from "firebase-admin/firestore";
import { fetchBlockDocsOverlappingSlot, BlockCheckUnavailableError } from "@/lib/booking/blocks-overlap-queries";

export { BlockCheckUnavailableError };

/** Timestamp-like constructor (e.g. firebase-admin/firestore Timestamp) for fromDate. */
type TimestampConstructor = { fromDate(date: Date): unknown };

/**
 * Shared block-overlap check for create-hold and convert-hold-to-booking.
 * Returns true if any block overlaps [slotStart, slotEnd] for the experience variants and/or
 * the specific boatId. Boat-specific blocks apply on every trip type that uses that boat,
 * regardless of which experienceId was selected when the admin created the block.
 */
export async function hasOverlappingBlock(opts: {
  db: Firestore;
  Timestamp: TimestampConstructor;
  experienceId: string;
  experienceIdVariants?: string[];
  experienceSlug?: string;
  boatId?: string;
  slotStart: Date;
  slotEnd: Date;
  get?: (q: Query) => Promise<QuerySnapshot>;
  /** Block document ids to ignore (e.g. matching guest placeholders being converted). */
  ignoreBlockIds?: string[];
}): Promise<boolean> {
  const { docs } = await fetchBlockDocsOverlappingSlot(opts);
  const ignore = new Set((opts.ignoreBlockIds ?? []).filter(Boolean));
  return docs.some((d) => !ignore.has(d.id));
}
