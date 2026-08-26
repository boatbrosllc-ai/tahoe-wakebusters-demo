import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { MARKETPLACE_EVENTS_COLLECTION } from "@/lib/integrations/gmail/constants";
import { gmailGetMessage } from "@/lib/integrations/gmail/client";
import { getGmailAccessToken } from "@/lib/integrations/gmail/token-store";
import { gmailMessageToInput } from "@/lib/integrations/marketplaces/process-message";
import { parseMarketplaceMessage } from "@/lib/integrations/marketplaces/parse-message";
import { inspectMarketplaceEventOverlap } from "@/lib/integrations/marketplaces/inspect-overlap";
import { requireFeatureResponse } from "@/lib/plan";

function isoFromUnknown(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? new Date(ms).toISOString() : value;
  }
  if (value && typeof value === "object" && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

export async function GET(request: NextRequest, context: {
  params: Promise<{ id: string }> }) {
  // PLAN_FEATURE_GATE
  {
    const planDenied = requireFeatureResponse("marketplaceSync");
    if (planDenied) return planDenied;
  }

  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;
  const { id } = await context.params;
  if (!id?.trim()) return NextResponse.json({ error: "Event id is required" }, { status: 400 });

  const db = getDb();
  const eventSnap = await db.collection(MARKETPLACE_EVENTS_COLLECTION).doc(id).get();
  if (!eventSnap.exists) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  const stored = eventSnap.data() as Record<string, unknown>;
  const gmailMessageId = typeof stored.gmailMessageId === "string" ? stored.gmailMessageId.trim() : "";
  if (!gmailMessageId) {
    return NextResponse.json({ error: "Event has no Gmail message id" }, { status: 400 });
  }

  try {
    const access = await getGmailAccessToken();
    const message = await gmailGetMessage(access, gmailMessageId);
    const parsed = parseMarketplaceMessage(gmailMessageToInput(message));
    if (!parsed.ok) {
      return NextResponse.json({
        id: eventSnap.id,
        status: stored.status ?? null,
        detail: stored.detail ?? parsed.error,
        subject: stored.subject ?? null,
        incoming: {
          provider: stored.provider ?? parsed.provider ?? null,
          externalBookingId: stored.externalBookingId ?? parsed.externalBookingId ?? null,
          listingName: stored.listingName ?? null,
          customerName: stored.customerName ?? null,
          customerEmail: null,
          partySize: stored.passengerCount ?? null,
          experienceTitle: null,
          experienceSlug: null,
          boatName: null,
          boatId: null,
          boatResolved: false,
          startAt: isoFromUnknown(stored.startAt),
          endAt: isoFromUnknown(stored.endAt),
          durationHours: stored.durationHours ?? null,
          slotId: null,
          details: stored.details ?? null,
          emailExcerpt: stored.emailExcerpt ?? null,
        },
        overlaps: [],
        inspectError: parsed.error,
      });
    }

    const inspection = await inspectMarketplaceEventOverlap(parsed.event);
    const { Timestamp } = getFirestoreExports();
    await eventSnap.ref.set(
      {
        customerName: inspection.incoming.customerName,
        startAt: inspection.incoming.startAt,
        endAt: inspection.incoming.endAt,
        durationHours: inspection.incoming.durationHours,
        passengerCount: inspection.incoming.partySize,
        totalCents: inspection.incoming.totalCents,
        details: inspection.incoming.details,
        emailExcerpt: inspection.incoming.emailExcerpt,
        lastInspectedAt: Timestamp.now(),
      },
      { merge: true }
    );

    return NextResponse.json({
      id: eventSnap.id,
      status: stored.status ?? null,
      detail: stored.detail ?? null,
      subject: stored.subject ?? parsed.event.sourceSubject ?? null,
      bookingId: stored.bookingId ?? null,
      ...inspection,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
