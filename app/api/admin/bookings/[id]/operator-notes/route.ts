import { NextRequest, NextResponse } from "next/server";
import { getAdminPrincipalFromSessionCookie, requireAdminSession } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import type { Booking } from "@/lib/booking/types";
import { writeAdminAuditLog } from "@/lib/booking/admin-audit-log";
import { notifyCaptainTrip } from "@/lib/booking/captain-notify";
import { readAssignedCaptain } from "@/lib/admin/assigned-captain";
import { requireFeatureResponse } from "@/lib/plan";
import {
  MAX_OPERATOR_NOTES_LENGTH,
  appendOperatorNote,
  newOperatorNoteId,
  pickOperatorNotesApiFields,
  readOperatorNotesLog,
  sanitizeOperatorNotes,
} from "@/lib/admin/operator-notes";

/**
 * POST /api/admin/bookings/[id]/operator-notes
 * Victoria or an operator appends a note the assigned captain sees on their calendar.
 * Optional notifyCaptain emails the current captain the new update.
 */
export async function POST(
  request: NextRequest,
  {
  params }: { params: Promise<{ id: string }> }
) {
  // PLAN_FEATURE_GATE
  {
    const planDenied = requireFeatureResponse("teamOps");
    if (planDenied) return planDenied;
  }

  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const principal = await getAdminPrincipalFromSessionCookie(request.headers.get("cookie"));
  if (!principal || (principal.role !== "super_admin" && principal.role !== "operator")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: bookingId } = await params;
  if (!bookingId) return NextResponse.json({ error: "Booking id required" }, { status: 400 });

  let body: { operatorNotes?: unknown; notifyCaptain?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.operatorNotes === "string" && body.operatorNotes.length > MAX_OPERATOR_NOTES_LENGTH) {
    return NextResponse.json(
      { error: `Note must be ${MAX_OPERATOR_NOTES_LENGTH} characters or fewer.` },
      { status: 400 }
    );
  }

  const notes = sanitizeOperatorNotes(body.operatorNotes);
  if (!notes) {
    return NextResponse.json({ error: "Enter a note to add." }, { status: 400 });
  }
  const notifyCaptain = body.notifyCaptain === true;

  try {
    const db = getDb();
    const { Timestamp } = getFirestoreExports();
    const bookingRef = db.collection("bookings").doc(bookingId);
    const snap = await bookingRef.get();
    if (!snap.exists) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    const booking = { ...(snap.data() as Booking), id: bookingId };
    const updatedAt = Timestamp.now();
    const at = updatedAt.toDate().toISOString();
    const nextLog = appendOperatorNote(
      readOperatorNotesLog(booking),
      notes,
      principal.email,
      at,
      newOperatorNoteId(),
      principal.displayName
    );

    await bookingRef.update({
      operatorNotes: notes,
      operatorNotesUpdatedAt: updatedAt,
      operatorNotesBy: principal.email,
      operatorNotesLog: nextLog,
    });

    void writeAdminAuditLog("operator_notes_saved", {
      bookingId,
      by: principal.email,
      length: notes.length,
      logCount: nextLog.length,
      notifiedCaptain: notifyCaptain,
    });

    const updatedBooking: Booking = {
      ...booking,
      operatorNotes: notes,
      operatorNotesUpdatedAt: updatedAt,
      operatorNotesBy: principal.email,
      operatorNotesLog: nextLog,
    };

    const assigned = readAssignedCaptain(updatedBooking);
    let emailSent = false;
    let emailError: string | null = null;
    if (notifyCaptain && assigned) {
      try {
        await notifyCaptainTrip({
          bookingId,
          booking: updatedBooking,
          toEmail: assigned.email,
          captainName: assigned.name,
          kind: "notes",
          assignedByName: principal.displayName || principal.email,
        });
        emailSent = true;
      } catch (err) {
        emailError = err instanceof Error ? err.message : String(err);
        console.error("[operator-notes] captain email failed", bookingId, err);
      }
    }

    return NextResponse.json({
      ok: true,
      ...pickOperatorNotesApiFields(updatedBooking),
      emailSent,
      ...(emailError ? { emailError } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
