import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { parseSlotId, getSlotStartEnd } from "@/lib/booking/experience-slots";
import { formatBookingTime } from "@/lib/booking/format-booking-datetime";
import { getTokenById, getRequestById, getTemplateById, getGroupTokenById, isTokenValid } from "@/lib/waiver/firestore";
import type { WaiverValidateResponse } from "@/lib/waiver/types";
import { sanitizeTermsHtml } from "@/lib/waiver/sanitize-terms-html";

async function buildBookingSummary(bookingId: string): Promise<{ experienceName: string; tripDate: string; startTime?: string; endTime?: string; partySize?: number }> {
  const db = getDb();
  const bookingSnap = await db.collection("bookings").doc(bookingId).get();
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
      const { start, end } = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute ?? 0);
      startTime = formatBookingTime(start);
      endTime = formatBookingTime(end);
    }
    if (booking.experienceId) {
      const expSnap = await db.collection("experiences").doc(booking.experienceId).get();
      if (expSnap.exists) {
        const data = expSnap.data() as { title?: string };
        experienceName = data.title ?? booking.experienceId;
      }
    }
  }
  return { experienceName, tripDate, startTime, endTime, partySize };
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim();
  const group = request.nextUrl.searchParams.get("group")?.trim();

  if (group) {
    try {
      const groupDoc = await getGroupTokenById(group);
      if (!groupDoc) {
        return NextResponse.json({ valid: false, error: "This group link is invalid or has expired." }, { status: 404 });
      }
      const template = await getTemplateById(groupDoc.templateId);
      if (!template) {
        return NextResponse.json({ valid: false, error: "Template not found" }, { status: 404 });
      }
      const bookingSummary = await buildBookingSummary(groupDoc.bookingId);
      const response: WaiverValidateResponse = {
        valid: true,
        waiverRequestId: "",
        isGroupSigning: true,
        groupToken: group,
        bookingSummary: { ...bookingSummary, partySize: bookingSummary.partySize ?? groupDoc.partySize },
        template: {
          title: template.title,
          termsHtml: sanitizeTermsHtml(template.termsHtml),
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

  if (!token) {
    return NextResponse.json({ valid: false, error: "Token or group link is required" }, { status: 400 });
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

    const bookingSummary = await buildBookingSummary(req.bookingId);

    const response: WaiverValidateResponse = {
      valid: true,
      waiverRequestId: req.id,
      bookingSummary: {
        ...bookingSummary,
        partySize: bookingSummary.partySize,
      },
      template: {
        title: template.title,
        termsHtml: sanitizeTermsHtml(template.termsHtml),
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
