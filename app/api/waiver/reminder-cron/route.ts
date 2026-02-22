import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { getRequestById, getTemplateById, updateRequest } from "@/lib/waiver/firestore";
import { waiverEmailBrevo } from "@/lib/waiver/email-brevo";
import { getFirestoreExports } from "@/lib/booking/firebase-admin";
import { parseSlotId, getSlotStartEnd } from "@/lib/booking/experience-slots";
import { formatBookingTime } from "@/lib/booking/format-booking-datetime";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 503 });
  }

  const db = getDb();
  const { Timestamp } = getFirestoreExports();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const snap = await db
    .collection("waiverRequests")
    .where("status", "==", "pending")
    .limit(100)
    .get();

  let sent = 0;
  for (const doc of snap.docs) {
    const full = await getRequestById(doc.id);
    if (!full || full.status !== "pending" || full.sent?.reminder1SentAt != null) continue;
    const createdAtMs =
      typeof (full.createdAt as { seconds?: number })?.seconds === "number"
        ? (full.createdAt as { seconds: number }).seconds * 1000
        : 0;
    if (createdAtMs >= sevenDaysAgo.getTime()) continue;

    let toEmail = full.signerEmail;
    let toName = full.signerName ?? "Guest";
    let experienceName = "Your trip";
    let tripDate = "";
    let startTime: string | undefined;
    let endTime: string | undefined;
    let partySize: number | undefined;

    const bookingSnap = await db.collection("bookings").doc(full.bookingId).get();
    if (bookingSnap.exists) {
      const booking = bookingSnap.data() as {
        experienceId?: string;
        slotId?: string;
        startDateStr?: string;
        partySize?: number;
        customer?: { name?: string; email?: string };
      };
      toEmail = toEmail ?? booking.customer?.email?.trim();
      toName = (toName || booking.customer?.name || "Guest").trim();
      tripDate = booking.startDateStr ?? "";
      partySize = booking.partySize;
      const parsed = booking.slotId ? parseSlotId(booking.slotId) : null;
      if (parsed) {
        tripDate = parsed.dateStr;
        const { start, end } = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute ?? 0);
        startTime = formatBookingTime(start);
        endTime = formatBookingTime(end);
      }
      if (booking.experienceId) {
        const expSnap = await db.collection("experiences").doc(booking.experienceId).get();
        if (expSnap.exists) {
          experienceName = (expSnap.data() as { title?: string })?.title ?? booking.experienceId;
        }
      }
    }

    if (!toEmail) continue;

    const template = full.templateId ? await getTemplateById(full.templateId) : null;
    if (template?.sendWaiverReminder === false) continue;

    try {
      await waiverEmailBrevo.sendWaiverReminder({
        to: toEmail,
        name: toName,
        signingUrl: full.signingUrl,
        bookingSummary: { experienceName, tripDate, startTime, endTime, partySize },
      });
      const now = Timestamp.now();
      await updateRequest(doc.id, {
        sent: {
          ...full.sent,
          lastSentAt: now,
          reminder1SentAt: now,
        },
      });
      sent++;
    } catch (err) {
      console.error("[waiver/reminder-cron] send failed for", doc.id, err);
    }
  }

  return NextResponse.json({ sent });
}
