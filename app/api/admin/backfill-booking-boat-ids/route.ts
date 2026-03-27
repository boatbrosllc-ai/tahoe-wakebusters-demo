/**
 * Backfill missing boatId on legacy bookings.
 * Run after deploying the slots API change that no longer assigns bookings without boatId to the first boat.
 *
 * GET: Strictly read-only (dry-run report). Never mutates. Returns list of bookings that would be updated.
 * POST: Apply updates when body includes { applyUpdates: true } or { dryRun: false }.
 *
 * Requires admin session. Use to drive unresolved count to zero; monitor via X-Unresolved-Booking-Count from /api/booking/slots.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";
import {
  inferListingBoatIdFromSlotDoc,
  resolveExperienceDocAndSlug,
} from "@/lib/booking/listing-boat-resolution";
import { writeAdminAuditLog } from "@/lib/booking/admin-audit-log";

/** GET is strictly read-only: always dry-run, no mutating behavior. */
export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;
  return runBackfill(true);
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;
  const body = (await request.json().catch(() => ({}))) as { applyUpdates?: boolean; dryRun?: boolean; verifyOnly?: boolean };
  const verifyOnly = body.verifyOnly === true || body.dryRun === true;
  const applyUpdates = (body.applyUpdates === true || body.dryRun === false) && !verifyOnly;
  if (!applyUpdates && !verifyOnly) {
    return NextResponse.json(
      {
        error: "Use POST { verifyOnly: true } for preview or POST { applyUpdates: true } to write updates.",
      },
      { status: 400 }
    );
  }
  return runBackfill(!applyUpdates, request);
}

async function runBackfill(dryRun: boolean, request?: NextRequest) {
  const db = getDb();
  const limit = 500;

  const allBookingsSnap = await db
    .collection("bookings")
    .where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN))
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  const missingBoatId: { id: string; experienceId?: string; slotId?: string }[] = [];
  for (const doc of allBookingsSnap.docs) {
    const d = doc.data() as { boatId?: string; experienceId?: string; slotId?: string; slot_id?: string };
    const boatId = typeof d.boatId === "string" ? d.boatId.trim() : "";
    if (!boatId) {
      const slotId = d.slotId ?? d.slot_id;
      missingBoatId.push({
        id: doc.id,
        experienceId: d.experienceId,
        slotId: typeof slotId === "string" ? slotId : undefined,
      });
    }
  }

  const results: { bookingId: string; experienceId?: string; slotId?: string; beforeBoatId?: string | null; inferredBoatId?: string; outcome: "updated" | "skipped" | "failed"; error?: string }[] =
    [];
  const updatedIds: string[] = [];

  for (const b of missingBoatId) {
    if (!b.experienceId || !b.slotId) {
      results.push({ bookingId: b.id, experienceId: b.experienceId, slotId: b.slotId, beforeBoatId: null, outcome: "skipped" });
      continue;
    }

    const resolved = await resolveExperienceDocAndSlug(db, b.experienceId);
    const expDocId = resolved?.docId ?? b.experienceId;
    const expSlug = resolved?.slug ?? "";

    const inferredBoatId = await inferListingBoatIdFromSlotDoc(db, expDocId, expSlug, b.slotId, {
      bookingId: b.id,
    });

    if (inferredBoatId && !dryRun) {
      try {
        await db.collection("bookings").doc(b.id).update({ boatId: inferredBoatId });
        results.push({ bookingId: b.id, experienceId: b.experienceId, slotId: b.slotId, beforeBoatId: null, inferredBoatId, outcome: "updated" });
        updatedIds.push(b.id);
      } catch (err) {
        results.push({
          bookingId: b.id,
          experienceId: b.experienceId,
          slotId: b.slotId,
          beforeBoatId: null,
          inferredBoatId,
          outcome: "failed",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      results.push({
        bookingId: b.id,
        experienceId: b.experienceId,
        slotId: b.slotId,
        beforeBoatId: null,
        inferredBoatId: inferredBoatId ?? undefined,
        outcome: "skipped",
      });
    }
  }

  if (!dryRun && updatedIds.length > 0 && request) {
    console.log("[backfill-booking-boat-ids] operator action: applied updates", {
      action: "backfill_booking_boat_ids",
      updatedCount: updatedIds.length,
      bookingIds: updatedIds,
      at: new Date().toISOString(),
    });
    void writeAdminAuditLog("backfill_booking_boat_ids", {
      updatedCount: updatedIds.length,
      bookingIds: updatedIds.slice(0, 30),
    });
  }

  return NextResponse.json({
    dryRun,
    totalWithMissingBoatId: missingBoatId.length,
    results,
    hint: dryRun
      ? "GET is read-only. To apply updates, use POST with body { applyUpdates: true } or { dryRun: false }."
      : "Monitor X-Unresolved-Booking-Count from GET /api/booking/slots until zero.",
  });
}
