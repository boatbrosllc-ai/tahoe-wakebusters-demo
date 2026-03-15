/**
 * Backfill missing boatId on legacy bookings.
 * Run after deploying the slots API change that no longer assigns bookings without boatId to the first boat.
 *
 * GET: Strictly read-only (dry-run report). Never mutates. Returns list of bookings that would be updated.
 * POST: Apply updates only when body includes explicit action flag (applyUpdates: true). Logs operator action for audit.
 *
 * Requires admin session. Use to drive unresolved count to zero; monitor via X-Unresolved-Booking-Count from /api/booking/slots.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";

/** GET is strictly read-only: always dry-run, no mutating behavior. */
export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;
  return runBackfill(true);
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;
  const body = await request.json().catch(() => ({})) as { applyUpdates?: boolean };
  const applyUpdates = body.applyUpdates === true;
  if (!applyUpdates) {
    return NextResponse.json(
      { error: "Actual updates require POST with body { applyUpdates: true }. Use GET for a dry-run report." },
      { status: 400 }
    );
  }
  return runBackfill(false, request);
}

async function runBackfill(dryRun: boolean, request?: NextRequest) {
  const db = getDb();
  const limit = 500;

  const allBookingsSnap = await db
    .collection("bookings")
    .where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN))
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

  const results: { bookingId: string; experienceId?: string; slotId?: string; inferredBoatId?: string; updated?: boolean }[] = [];
  const updatedIds: string[] = [];

  for (const b of missingBoatId) {
    if (!b.experienceId || !b.slotId) {
      results.push({ bookingId: b.id, experienceId: b.experienceId, slotId: b.slotId });
      continue;
    }

    const boatsSnap = await db
      .collection("boats")
      .where("isListingBoat", "==", true)
      .where("active", "==", true)
      .where("experienceIds", "array-contains", b.experienceId)
      .get();

    let inferredBoatId: string | undefined;
    for (const boatDoc of boatsSnap.docs) {
      const slotRef = boatDoc.ref.collection("slots").doc(b.slotId);
      const slotSnap = await slotRef.get();
      if (slotSnap.exists) {
        if (inferredBoatId) {
          inferredBoatId = undefined;
          break;
        }
        inferredBoatId = boatDoc.id;
      }
    }

    if (inferredBoatId && !dryRun) {
      await db.collection("bookings").doc(b.id).update({ boatId: inferredBoatId });
      results.push({ bookingId: b.id, experienceId: b.experienceId, slotId: b.slotId, inferredBoatId, updated: true });
      updatedIds.push(b.id);
    } else {
      results.push({ bookingId: b.id, experienceId: b.experienceId, slotId: b.slotId, inferredBoatId: inferredBoatId ?? undefined });
    }
  }

  if (!dryRun && updatedIds.length > 0 && request) {
    console.log("[backfill-booking-boat-ids] operator action: applied updates", {
      action: "backfill_booking_boat_ids",
      updatedCount: updatedIds.length,
      bookingIds: updatedIds,
      at: new Date().toISOString(),
    });
  }

  return NextResponse.json({
    dryRun,
    totalWithMissingBoatId: missingBoatId.length,
    results,
    hint: dryRun
      ? "GET is read-only. To apply updates, use POST with body { applyUpdates: true }."
      : "Monitor X-Unresolved-Booking-Count from GET /api/booking/slots until zero.",
  });
}
