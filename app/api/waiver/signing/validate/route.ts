import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { parseSlotId, getSlotStartEnd } from "@/lib/booking/experience-slots";
import { getTokenById, getRequestById, getTemplateById, isTokenValid } from "@/lib/waiver/firestore";
import type { WaiverValidateResponse } from "@/lib/waiver/types";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ valid: false, error: "Token is required" }, { status: 400 });
  }

  try {
    const tokenDoc = await getTokenById(token);
    if (!tokenDoc) {
      return NextResponse.json({ valid: false, error: "Invalid or expired link" }, { status: 404 });
    }
    if (!isTokenValid(tokenDoc)) {
      return NextResponse.json({ valid: false, error: "This signing link has expired or already been used" }, { status: 400 });
    }

    const req = await getRequestById(tokenDoc.waiverRequestId);
    if (!req || req.status !== "pending") {
      return NextResponse.json({ valid: false, error: "Waiver request not found or no longer pending" }, { status: 404 });
    }

    const template = await getTemplateById(req.templateId);
    if (!template) {
      return NextResponse.json({ valid: false, error: "Template not found" }, { status: 404 });
    }

    const db = getDb();
    const bookingSnap = await db.collection("bookings").doc(req.bookingId).get();
    let experienceName = "Your trip";
    let tripDate = "";
    let startTime: string | undefined;
    let endTime: string | undefined;
    let partySize: number | undefined;

    if (bookingSnap.exists) {
      const booking = bookingSnap.data() as { experienceId?: string; slotId?: string; startDateStr?: string; partySize?: number };
      tripDate = booking.startDateStr ?? "";
      partySize = booking.partySize;

      const parsed = booking.slotId ? parseSlotId(booking.slotId) : null;
      if (parsed) {
        tripDate = parsed.dateStr;
        const { start, end } = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours);
        startTime = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        endTime = end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      }
      if (booking.experienceId) {
        const expSnap = await db.collection("experiences").doc(booking.experienceId).get();
        if (expSnap.exists) {
          const data = expSnap.data() as { title?: string };
          experienceName = data.title ?? booking.experienceId;
        }
      }
    }

    const response: WaiverValidateResponse = {
      valid: true,
      waiverRequestId: req.id,
      bookingSummary: {
        experienceName,
        tripDate,
        startTime,
        endTime,
        partySize,
      },
      template: {
        title: template.title,
        termsHtml: template.termsHtml,
        requiredFields: template.requiredFields,
        clauses: template.clauses,
        signature: template.signature,
        version: template.version,
      },
    };
    return NextResponse.json(response);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ valid: false, error: message }, { status: 500 });
  }
}
