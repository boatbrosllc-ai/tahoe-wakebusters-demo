/**
 * Periodic scan: if recent bookings are missing boatId where required, notify staff once per UTC day.
 * Replaces per-request email from GET /api/booking/slots (customer reads must not send staff mail).
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { assertCronPostAuthorized } from "@/lib/booking/cron-auth";
import { operationalAlertDedupeDocId, writeOperationalAlertIfNewDocId } from "@/lib/booking/operational-alerts";
import { sendStaffInternalEmail } from "@/lib/booking/brevo";
import { scanRecentBookingsMissingBoatId } from "@/lib/admin/scan-missing-boat-id-bookings";

export async function POST(request: NextRequest) {
  const authErr = await assertCronPostAuthorized(request);
  if (authErr) return authErr;

  try {
    const db = getDb();
    const { count, bookingIds } = await scanRecentBookingsMissingBoatId(db);
    if (count === 0) {
      return NextResponse.json({ ok: true, count: 0, emailed: false });
    }

    const utcDay = new Date().toISOString().slice(0, 10);
    const docId = operationalAlertDedupeDocId(["cron_missing_booking_boat_id_digest", utcDay]);
    const alertInserted = await writeOperationalAlertIfNewDocId(docId, {
      type: "cron_missing_booking_boat_id_digest",
      source: "app/api/admin/cron/alert-missing-booking-boat-ids",
      count,
      utcDay,
      bookingIdsSample: bookingIds.slice(0, 25),
    });

    if (alertInserted) {
      await sendStaffInternalEmail({
        subject: `[Alert] Bookings missing boatId (${count} in last 500 by createdAt)`,
        htmlContent: `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:16px;">
<p><strong>Dashboard scan: bookings missing boatId</strong></p>
<p><strong>Count:</strong> ${String(count)} (of last 500 bookings by creation time, slot-taken statuses where boat is required)</p>
<p><strong>Sample IDs (up to 25):</strong> ${bookingIds
          .slice(0, 25)
          .map((id) => id.replace(/</g, "&lt;"))
          .join(", ")}</p>
<p>Use Admin → Backfill tools (/admin/backfill-tools) to run the boatId backfill (dry run first, then apply).</p>
</body></html>`,
        idempotencyKey: `cron_missing_boatid_${utcDay}`,
      });
    }

    return NextResponse.json({ ok: true, count, emailed: alertInserted });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron alert-missing-booking-boat-ids]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
