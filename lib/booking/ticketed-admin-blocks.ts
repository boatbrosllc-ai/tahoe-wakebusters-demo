/**
 * Ticketed listings: admin blocks may hold back N tickets (partial) instead of closing the whole departure.
 * Legacy blocks without `ticketsBlocked` still fully block overlapping departures.
 */

import type { Firestore, Query, QueryDocumentSnapshot, QuerySnapshot } from "firebase-admin/firestore";
import { fetchBlockDocsOverlappingSlot } from "@/lib/booking/blocks-overlap-queries";

export type TicketedBlockRowLike = {
  startAt?: { toDate?: () => Date };
  endAt?: { toDate?: () => Date };
  /** When set to a positive integer, holds back that many tickets for overlapping departures. */
  ticketsBlocked?: number | null;
};

export type TicketedAdminBlockImpact = {
  /** True when any overlapping block is a legacy/full block (no positive ticketsBlocked). */
  fullBlock: boolean;
  /** Sum of ticketsBlocked from partial overlapping blocks (ignored when fullBlock). */
  ticketsBlocked: number;
};

export function parseAdminTicketsBlockedInput(raw: unknown): number | undefined | null {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

export function intervalOverlapsMs(
  slotStartMs: number,
  slotEndMs: number,
  blockStartMs: number,
  blockEndMs: number,
): boolean {
  return slotStartMs < blockEndMs && slotEndMs > blockStartMs;
}

export function resolveTicketedAdminBlockImpactFromDocs(
  docs: Array<{ data(): TicketedBlockRowLike }>,
  slotStartMs: number,
  slotEndMs: number,
): TicketedAdminBlockImpact {
  let fullBlock = false;
  let ticketsBlocked = 0;
  for (const doc of docs) {
    const b = doc.data();
    const blockStart = b.startAt?.toDate?.()?.getTime();
    const blockEnd = b.endAt?.toDate?.()?.getTime();
    if (blockStart == null || blockEnd == null) continue;
    if (!intervalOverlapsMs(slotStartMs, slotEndMs, blockStart, blockEnd)) continue;
    const tb =
      typeof b.ticketsBlocked === "number" && Number.isFinite(b.ticketsBlocked)
        ? Math.max(0, Math.floor(b.ticketsBlocked))
        : 0;
    if (tb > 0) {
      ticketsBlocked += tb;
    } else {
      fullBlock = true;
    }
  }
  return { fullBlock, ticketsBlocked };
}

type TimestampConstructor = { fromDate(date: Date): unknown };

/** Fetch overlapping blocks and compute ticketed departure impact. */
export async function getTicketedAdminBlockImpact(opts: {
  db: Firestore;
  Timestamp: TimestampConstructor;
  experienceId: string;
  experienceIdVariants?: string[];
  experienceSlug?: string;
  boatId?: string;
  slotStart: Date;
  slotEnd: Date;
  get?: (q: Query) => Promise<QuerySnapshot>;
}): Promise<TicketedAdminBlockImpact> {
  const { docs } = await fetchBlockDocsOverlappingSlot(opts);
  return resolveTicketedAdminBlockImpactFromDocs(
    docs as QueryDocumentSnapshot[],
    opts.slotStart.getTime(),
    opts.slotEnd.getTime(),
  );
}

/** Effective tickets available after admin holdbacks (full block => 0). */
export function ticketedAvailableAfterAdminBlocks(
  total: number,
  sold: number,
  onHold: number,
  impact: TicketedAdminBlockImpact,
): number {
  if (impact.fullBlock) return 0;
  return Math.max(0, total - sold - onHold - impact.ticketsBlocked);
}
