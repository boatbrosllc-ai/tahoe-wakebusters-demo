import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import {
  getRequestById,
  getTemplateById,
  updateRequest,
  getTokenById,
  isTokenValid,
} from "@/lib/waiver/firestore";
import { generateSigningToken, createTokenExpiresAt, getDefaultTokenExpiryDays } from "@/lib/waiver/tokens";
import { waiverEmailBrevo } from "@/lib/waiver/email-brevo";
import { getFirestoreExports } from "@/lib/booking/firebase-admin";
import { parseSlotId, getSlotStartEnd } from "@/lib/booking/experience-slots";
import { formatBookingTime } from "@/lib/booking/format-booking-datetime";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminSession(_request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const { id: requestId } = await params;
  if (!requestId) return NextResponse.json({ error: "Request id required" }, { status: 400 });

  try {
    const req = await getRequestById(requestId);
    if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });
    if (req.status !== "pending") {
      return NextResponse.json({ error: "Can only send invite for pending requests" }, { status: 400 });
    }

    const db = getDb();
    const { Timestamp } = getFirestoreExports();

    let tokenId = req.signingTokenId;
    let signingUrl = req.signingUrl;

    const existingToken = tokenId ? await getTokenById(tokenId) : null;
    if (!existingToken || !isTokenValid(existingToken)) {
      tokenId = generateSigningToken();
      const expiresAt = createTokenExpiresAt(getDefaultTokenExpiryDays());
      const baseUrl = (process.env.APP_BASE_URL ?? "").replace(/\/$/, "");
      signingUrl = `${baseUrl}/waiver/sign?token=${encodeURIComponent(tokenId)}`;
      await db.collection("waiverSigningTokens").doc(tokenId).set({
        waiverRequestId: req.id,
        bookingId: req.bookingId,
        expiresAt: Timestamp.fromDate(expiresAt),
        usedAt: null,
      });
      await updateRequest(requestId, { signingTokenId: tokenId, signingUrl });
    } else {
      signingUrl = req.signingUrl;
    }

    const bookingSnap = await db.collection("bookings").doc(req.bookingId).get();
    let experienceName = "Your trip";
    let tripDate = "";
    let startTime: string | undefined;
    let endTime: string | undefined;
    let partySize: number | undefined;
    let toEmail = req.signerEmail;
    let toName = req.signerName ?? "Guest";

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

    if (!toEmail) {
      return NextResponse.json({ error: "No guest email (set on request or from booking)" }, { status: 400 });
    }

    await waiverEmailBrevo.sendWaiverInvite({
      to: toEmail,
      name: toName,
      signingUrl,
      bookingSummary: { experienceName, tripDate, startTime, endTime, partySize },
    });

    const now = Timestamp.now();
    const sent = {
      ...req.sent,
      initialSentAt: req.sent.initialSentAt ?? now,
      lastSentAt: now,
      reminder1SentAt: req.sent.reminder1SentAt ?? null,
    };
    await updateRequest(requestId, { sent });

    return NextResponse.json({ success: true, signingUrl });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const isFirebase = /firebase|FIREBASE|config missing|credential/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebase && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebase ? 503 : 500 }
    );
  }
}
