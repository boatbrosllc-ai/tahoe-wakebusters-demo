import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { parseSlotId, getSlotStartEnd } from "@/lib/booking/experience-slots";
import { formatBookingTimeSafe } from "@/lib/booking/format-booking-datetime";
import {
  flagWaiverRequestForManualReview,
  getTokenById,
  getRequestById,
  getTemplateById,
  getGroupTokenById,
  isTokenValid,
} from "@/lib/waiver/firestore";
import { getWaiverQrLinkById } from "@/lib/waiver/waiver-qr-firestore";
import type { WaiverValidateResponse } from "@/lib/waiver/types";
import { toValidateTemplatePayload } from "@/lib/waiver/to-validate-template-payload";
import { requireFeatureResponse } from "@/lib/plan";

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
      startTime = formatBookingTimeSafe(start);
      endTime = formatBookingTimeSafe(end);
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
  // PLAN_FEATURE_GATE
  {
    const planDenied = requireFeatureResponse("waivers");
    if (planDenied) return planDenied;
  }

  const token = request.nextUrl.searchParams.get("token")?.trim();
  const group = request.nextUrl.searchParams.get("group")?.trim();
  const qr = request.nextUrl.searchParams.get("qr")?.trim();

  if (qr) {
    try {
      const link = await getWaiverQrLinkById(qr);
      if (!link || !link.active) {
        return NextResponse.json(
          { valid: false, error: "This QR code is no longer active. Ask staff for a current waiver link.", code: "qr_inactive" },
          { status: 404 }
        );
      }
      const template = await getTemplateById(link.templateId);
      if (!template) {
        return NextResponse.json({ valid: false, error: "Waiver template not found.", code: "template_missing" }, { status: 404 });
      }
      if (!template.isActive) {
        return NextResponse.json(
          {
            valid: false,
            error: "This waiver is not accepting signatures right now. Please ask staff for assistance.",
            code: "template_inactive",
          },
          { status: 403 }
        );
      }
      let templatePayload: WaiverValidateResponse["template"];
      try {
        templatePayload = toValidateTemplatePayload(template);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await getDb()
          .collection("waiverTemplates")
          .doc(link.templateId)
          .set({ adminReviewRequired: true, adminReviewError: message }, { merge: true });
        return NextResponse.json({ valid: false, error: message }, { status: 400 });
      }
      const response: WaiverValidateResponse = {
        valid: true,
        waiverRequestId: "",
        isQrLinkSigning: true,
        qrLinkId: link.id,
        bookingSummary: {
          experienceName: template.title,
          tripDate: "",
          partySize: undefined,
        },
        template: templatePayload,
      };
      return NextResponse.json(response);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ valid: false, error: message }, { status: 500 });
    }
  }

  if (group) {
    try {
      const groupDoc = await getGroupTokenById(group);
      if (!groupDoc) {
        return NextResponse.json({ valid: false, error: "This group link is invalid or has expired." }, { status: 404 });
      }
          const snapshot = groupDoc.templateSnapshot;
          let template: Awaited<ReturnType<typeof getTemplateById>> | typeof snapshot | null = null;
          if (snapshot) {
            if (snapshot.version !== groupDoc.templateVersion) {
              return NextResponse.json({ valid: false, error: "Waiver template version mismatch; please contact support." }, { status: 409 });
            }
            template = snapshot;
          } else {
            const resolved = await getTemplateById(groupDoc.templateId);
            if (!resolved || resolved.version !== groupDoc.templateVersion) {
              return NextResponse.json({ valid: false, error: "Waiver template version mismatch; please contact support." }, { status: 409 });
            }
            template = resolved;
          }
      const bookingSummary = await buildBookingSummary(groupDoc.bookingId);
          let templatePayload: WaiverValidateResponse["template"];
          try {
            templatePayload = toValidateTemplatePayload(template);
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            await getDb()
              .collection("waiverTemplates")
              .doc(groupDoc.templateId)
              .set(
                {
                  adminReviewRequired: true,
                  adminReviewError: message,
                },
                { merge: true }
              );
            return NextResponse.json({ valid: false, error: message }, { status: 400 });
          }
      const response: WaiverValidateResponse = {
        valid: true,
        waiverRequestId: "",
        isGroupSigning: true,
        groupToken: group,
        bookingSummary: { ...bookingSummary, partySize: bookingSummary.partySize ?? groupDoc.partySize },
            template: templatePayload,
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

    const templateFromSnapshot = req.templateSnapshot;
    if (templateFromSnapshot?.version != null && templateFromSnapshot.version !== req.templateVersion) {
      await flagWaiverRequestForManualReview(req.id, {
        reasonCode: "waiver_template_version_mismatch",
        reason: `Pinned template snapshot version (${templateFromSnapshot.version}) does not match request.templateVersion (${req.templateVersion}).`,
      });
      return NextResponse.json({ valid: false, error: "Waiver template version mismatch; please contact support." }, { status: 409 });
    }
    const template =
      templateFromSnapshot ??
      (await (async () => {
        const resolved = await getTemplateById(req.templateId);
        if (!resolved) return null;
        if (resolved.version !== req.templateVersion) return null;
        return resolved;
      })());
    if (!template) {
      await flagWaiverRequestForManualReview(req.id, {
        reasonCode: "waiver_template_version_drift_or_missing_snapshot",
        reason: "Could not resolve a pinned waiver template version for this request (template drift suspected).",
      });
      return NextResponse.json({ valid: false, error: "Waiver template version mismatch; please contact support." }, { status: 409 });
    }

    const bookingSummary = await buildBookingSummary(req.bookingId);

    let templatePayload: WaiverValidateResponse["template"];
    try {
      templatePayload = toValidateTemplatePayload(template);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await getDb()
        .collection("waiverTemplates")
        .doc(req.templateId)
        .set(
          {
            adminReviewRequired: true,
            adminReviewError: message,
          },
          { merge: true }
        );
      return NextResponse.json({ valid: false, error: message }, { status: 400 });
    }

    const response: WaiverValidateResponse = {
      valid: true,
      waiverRequestId: req.id,
      bookingSummary: {
        ...bookingSummary,
        partySize: bookingSummary.partySize,
      },
      template: templatePayload,
    };
    return NextResponse.json(response);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ valid: false, error: message }, { status: 500 });
  }
}
