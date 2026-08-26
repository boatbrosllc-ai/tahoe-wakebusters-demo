import { NextRequest, NextResponse } from "next/server";
import { getAdminPrincipalFromSessionCookie, requireAdminSession } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import type { Booking } from "@/lib/booking/types";
import { getActiveTeamMember } from "@/lib/admin/team-store";
import { normalizeCaptainEmail, readAssignedCaptain } from "@/lib/admin/assigned-captain";
import { notifyCaptainTrip } from "@/lib/booking/captain-notify";
import { writeAdminAuditLog } from "@/lib/booking/admin-audit-log";
import { requireFeatureResponse } from "@/lib/plan";

/**
 * POST /api/admin/bookings/[id]/assign-captain
 * Victoria or an operator assigns (or clears) a captain. Sends confirmation / unassign email.
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

  let body: { captainEmail?: string | null; resend?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const nextEmail = normalizeCaptainEmail(body.captainEmail);
  const resend = body.resend === true;

  try {
    const db = getDb();
    const { Timestamp, FieldValue } = getFirestoreExports();
    const bookingRef = db.collection("bookings").doc(bookingId);
    const snap = await bookingRef.get();
    if (!snap.exists) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    const booking = { ...(snap.data() as Booking), id: bookingId };
    const previous = readAssignedCaptain(booking);

    if (!nextEmail) {
      if (!previous) {
        return NextResponse.json({ ok: true, assignedCaptain: null, unchanged: true });
      }
      await bookingRef.update({
        captainEmail: FieldValue.delete(),
        assignedCaptain: FieldValue.delete(),
      });
      void writeAdminAuditLog("captain_unassigned", {
        bookingId,
        previousEmail: previous.email,
        by: principal.email,
      });
      try {
        await notifyCaptainTrip({
          bookingId,
          booking,
          toEmail: previous.email,
          captainName: previous.name,
          kind: "unassigned",
          assignedByName: principal.displayName || principal.email,
        });
      } catch (err) {
        console.error("[assign-captain] unassign email failed", bookingId, err);
      }
      return NextResponse.json({ ok: true, assignedCaptain: null });
    }

    const captain = await getActiveTeamMember(nextEmail);
    if (!captain || captain.role !== "captain") {
      return NextResponse.json({ error: "That person is not an active captain." }, { status: 400 });
    }

    const sameCaptain = previous?.email === captain.email;
    const assignedAt = Timestamp.now();
    const assignedCaptain = {
      email: captain.email,
      name: captain.name,
      assignedAt: sameCaptain && previous?.assignedAt ? previous.assignedAt : assignedAt,
      assignedBy: principal.email,
    };

    if (!sameCaptain) {
      await bookingRef.update({
        captainEmail: captain.email,
        assignedCaptain: {
          email: captain.email,
          name: captain.name,
          assignedAt,
          assignedBy: principal.email,
        },
      });
      if (previous) {
        void writeAdminAuditLog("captain_reassigned", {
          bookingId,
          previousEmail: previous.email,
          email: captain.email,
          by: principal.email,
        });
        try {
          await notifyCaptainTrip({
            bookingId,
            booking,
            toEmail: previous.email,
            captainName: previous.name,
            kind: "unassigned",
            assignedByName: principal.displayName || principal.email,
          });
        } catch (err) {
          console.error("[assign-captain] previous captain email failed", bookingId, err);
        }
      } else {
        void writeAdminAuditLog("captain_assigned", {
          bookingId,
          email: captain.email,
          by: principal.email,
        });
      }
    } else {
      void writeAdminAuditLog(resend ? "captain_assignment_resent" : "captain_assigned", {
        bookingId,
        email: captain.email,
        by: principal.email,
      });
    }

    const updatedBooking: Booking = {
      ...booking,
      captainEmail: captain.email,
      assignedCaptain: {
        email: captain.email,
        name: captain.name,
        assignedAt,
        assignedBy: principal.email,
      },
    };

    let emailError: string | null = null;
    try {
      await notifyCaptainTrip({
        bookingId,
        booking: updatedBooking,
        toEmail: captain.email,
        captainName: captain.name,
        kind: "assigned",
        assignedByName: principal.displayName || principal.email,
      });
    } catch (err) {
      emailError = err instanceof Error ? err.message : String(err);
      console.error("[assign-captain] confirmation email failed", bookingId, err);
    }

    return NextResponse.json({
      ok: true,
      assignedCaptain: {
        email: captain.email,
        name: captain.name,
        assignedAt:
          typeof assignedCaptain.assignedAt === "string"
            ? assignedCaptain.assignedAt
            : assignedAt.toDate().toISOString(),
        assignedBy: principal.email,
      },
      emailSent: !emailError,
      ...(emailError ? { emailError } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
