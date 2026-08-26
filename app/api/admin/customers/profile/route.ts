import { NextRequest, NextResponse } from "next/server";
import type { CollectionReference, DocumentData, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import type { Booking } from "@/lib/booking/types";
import { parseSlotIdRelaxed } from "@/lib/booking/experience-slots";
import { bookingCountsTowardActiveRevenueTotals, totalSummaryAttributedRevenueCents } from "@/lib/booking/summary-revenue";
import { isValidBookingEmail } from "@/lib/booking/validate-email";
import { requireFeatureResponse } from "@/lib/plan";
import {
  CRM_PROFILE_ACTIVITY_LIMIT,
  CRM_PROFILE_BOOKING_LIMIT,
  activityTitleForEmailLog,
  customerKindFromBookingCount,
  emailLookupVariants,
  normalizeCustomerEmail,
  sortActivityNewestFirst,
  type CustomerActivityItem,
  type CustomerKind,
} from "@/lib/admin/customer-crm";

function toDateIso(ts: { seconds?: number; toDate?: () => Date } | null | undefined): string | null {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate().toISOString();
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000).toISOString();
  return null;
}

async function queryByEmailField(
  collection: CollectionReference,
  field: string,
  variants: string[],
  limit: number
): Promise<QueryDocumentSnapshot<DocumentData>[]> {
  if (variants.length === 0) return [];
  const snaps = await Promise.all(
    variants.map((v) => collection.where(field, "==", v).limit(limit).get())
  );
  const seen = new Set<string>();
  const docs: QueryDocumentSnapshot<DocumentData>[] = [];
  for (const snap of snaps) {
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      docs.push(d);
    }
  }
  return docs;
}

export type CustomerProfileBooking = {
  id: string;
  experienceName: string;
  boatName: string | null;
  tripDate: string | null;
  partySize: number | null;
  status: string;
  totalSpentCents: number;
  createdAt: string | null;
  specialNotes: string | null;
  howDidYouHear: string | null;
  discountCode: string | null;
};

export async function GET(request: NextRequest) {
  // PLAN_FEATURE_GATE
  {
    const planDenied = requireFeatureResponse("crm");
    if (planDenied) return planDenied;
  }

  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const emailParam = request.nextUrl.searchParams.get("email")?.trim() ?? "";
  const email = normalizeCustomerEmail(emailParam);
  if (!email || !isValidBookingEmail(email)) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }
  const variants = emailLookupVariants(emailParam || email);

  try {
    const db = getDb();
    const [bookingDocs, leadDocs, emailLogDocs] = await Promise.all([
      queryByEmailField(db.collection("bookings"), "customer.email", variants, CRM_PROFILE_BOOKING_LIMIT),
      queryByEmailField(db.collection("leads"), "email", variants, 50),
      queryByEmailField(db.collection("emailLog"), "to", variants, CRM_PROFILE_ACTIVITY_LIMIT),
    ]);

    const experienceIds = new Set<string>();
    const boatIds = new Set<string>();
    const bookingRows: Array<{
      id: string;
      booking: Booking;
      createdAt: string | null;
      experienceId: string | null;
      boatId: string | null;
    }> = [];

    for (const d of bookingDocs) {
      const b = d.data() as Booking;
      const createdAt = toDateIso(b.createdAt as { seconds?: number; toDate?: () => Date } | undefined);
      const experienceId = typeof b.experienceId === "string" && b.experienceId.trim() ? b.experienceId.trim() : null;
      const boatId = typeof b.boatId === "string" && b.boatId.trim() ? b.boatId.trim() : null;
      if (experienceId) experienceIds.add(experienceId);
      if (boatId) boatIds.add(boatId);
      bookingRows.push({ id: d.id, booking: b, createdAt, experienceId, boatId });
    }

    const experienceNames = new Map<string, string>();
    const boatNames = new Map<string, string>();
    await Promise.all([
      ...Array.from(experienceIds).map(async (id) => {
        const snap = await db.collection("experiences").doc(id).get();
        if (snap.exists) experienceNames.set(id, (snap.data() as { title?: string }).title ?? id);
      }),
      ...Array.from(boatIds).map(async (id) => {
        const snap = await db.collection("boats").doc(id).get();
        if (snap.exists) boatNames.set(id, (snap.data() as { name?: string }).name ?? id);
      }),
    ]);

    bookingRows.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

    const bookings: CustomerProfileBooking[] = bookingRows.map((row) => {
      const b = row.booking;
      const parsed = parseSlotIdRelaxed(b.slotId ?? "");
      const tripDate = (typeof b.startDateStr === "string" && b.startDateStr.trim()) || parsed?.dateStr || null;
      const howDidYouHear =
        typeof b.answers?.how_did_you_hear === "string" && b.answers.how_did_you_hear.trim()
          ? b.answers.how_did_you_hear.trim()
          : null;
      return {
        id: row.id,
        experienceName: row.experienceId ? experienceNames.get(row.experienceId) ?? row.experienceId : "—",
        boatName: row.boatId ? boatNames.get(row.boatId) ?? row.boatId : null,
        tripDate,
        partySize: typeof b.partySize === "number" ? b.partySize : null,
        status: b.status ?? "",
        totalSpentCents: bookingCountsTowardActiveRevenueTotals(b) ? totalSummaryAttributedRevenueCents(b) : 0,
        createdAt: row.createdAt,
        specialNotes: b.specialNotes?.trim() || b.answers?.comments?.trim() || null,
        howDidYouHear,
        discountCode: b.discountCode?.trim() || null,
      };
    });

    let name = "";
    let phone = "";
    let marketingOptIn = false;
    let lastBookingAt: string | null = null;
    let lastExperienceName: string | null = null;
    let totalSpentCents = 0;
    const activity: CustomerActivityItem[] = [];

    for (const row of bookingRows) {
      const b = row.booking;
      if (row.createdAt && (!lastBookingAt || row.createdAt > lastBookingAt)) {
        lastBookingAt = row.createdAt;
        lastExperienceName = row.experienceId ? experienceNames.get(row.experienceId) ?? row.experienceId : lastExperienceName;
        name = b.customer?.name?.trim() || name;
        phone = b.customer?.phone?.trim() || phone;
      } else {
        if (!name) name = b.customer?.name?.trim() || name;
        if (!phone) phone = b.customer?.phone?.trim() || phone;
      }
      if (b.marketingOptIn) marketingOptIn = true;
      if (bookingCountsTowardActiveRevenueTotals(b)) {
        totalSpentCents += totalSummaryAttributedRevenueCents(b);
      }
      if (row.createdAt) {
        activity.push({
          id: `booking-${row.id}`,
          type: "booking_created",
          at: row.createdAt,
          title: "Booking created",
          detail: row.experienceId ? experienceNames.get(row.experienceId) ?? row.experienceId : null,
          bookingId: row.id,
        });
      }
      const subscribedAt = toDateIso(b.brevoSubscribedAt as { seconds?: number; toDate?: () => Date } | undefined);
      if (subscribedAt) {
        activity.push({
          id: `brevo-${row.id}`,
          type: "marketing_opt_in",
          at: subscribedAt,
          title: "Joined marketing list",
          bookingId: row.id,
        });
      }
    }

    let leadSource: string | null = null;
    let leadCapturedAt: string | null = null;
    let leadInterest: string | null = null;
    let leadPage: string | null = null;
    let lastContactedAt: string | null = null;
    let leadMessage: string | null = null;

    const leadRows = leadDocs
      .map((d) => {
        const data = d.data() as {
          email?: string;
          name?: string;
          phone?: string;
          source?: string;
          page?: string;
          interest?: string;
          message?: string;
          createdAt?: { seconds?: number; toDate?: () => Date };
          lastContactedAt?: { seconds?: number; toDate?: () => Date };
        };
        return {
          id: d.id,
          at: toDateIso(data.createdAt),
          name: typeof data.name === "string" ? data.name.trim() : "",
          phone: typeof data.phone === "string" ? data.phone.trim() : "",
          source: typeof data.source === "string" ? data.source : "lead",
          page: typeof data.page === "string" ? data.page : "",
          interest: typeof data.interest === "string" ? data.interest : "",
          message: typeof data.message === "string" ? data.message.trim() : "",
          contactedAt: toDateIso(data.lastContactedAt),
        };
      })
      .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));

    for (const row of leadRows) {
      if (row.at && (!leadCapturedAt || row.at < leadCapturedAt)) {
        leadCapturedAt = row.at;
        leadSource = row.source;
      }
      if (row.page && !leadPage) leadPage = row.page;
      if (row.interest && !leadInterest) leadInterest = row.interest;
      if (row.message && !leadMessage) leadMessage = row.message;
      if (row.contactedAt && (!lastContactedAt || row.contactedAt > lastContactedAt)) {
        lastContactedAt = row.contactedAt;
      }
      if (!name && row.name) name = row.name;
      if (!phone && row.phone) phone = row.phone;
      marketingOptIn = true;
      activity.push({
        id: `lead-${row.id}`,
        type: "lead_captured",
        at: row.at ?? "",
        title: "Lead captured",
        detail: [row.source.replace(/_/g, " "), row.interest].filter(Boolean).join(" · "),
      });
    }

    for (const d of emailLogDocs) {
      const data = d.data() as {
        to?: string;
        templateId?: string;
        subject?: string;
        bookingId?: string | null;
        sentAt?: { seconds?: number; toDate?: () => Date };
        channel?: string;
        audience?: string;
      };
      if (data.audience === "staff") continue;
      const at = toDateIso(data.sentAt);
      const channel = data.channel === "sms" ? "sms" : "email";
      const templateId = typeof data.templateId === "string" ? data.templateId : "";
      activity.push({
        id: `log-${d.id}`,
        type: channel,
        at: at ?? "",
        title: activityTitleForEmailLog(templateId, channel),
        detail: typeof data.subject === "string" ? data.subject : null,
        bookingId: typeof data.bookingId === "string" ? data.bookingId : null,
        channel,
      });
    }

    const kind: CustomerKind = customerKindFromBookingCount(bookings.length);
    if (bookings.length === 0 && leadDocs.length === 0 && emailLogDocs.length === 0) {
      return NextResponse.json({ error: "No customer or lead found for this email" }, { status: 404 });
    }

    const displayEmail =
      bookingRows[0]?.booking.customer?.email?.trim() ||
      (typeof leadDocs[0]?.data()?.email === "string" ? String(leadDocs[0].data().email).trim() : email);

    return NextResponse.json({
      email: displayEmail,
      name,
      phone,
      kind,
      bookingCount: bookings.length,
      totalSpentCents,
      lastBookingAt,
      lastExperienceName,
      marketingOptIn,
      leadSource,
      leadCapturedAt,
      leadInterest,
      leadPage,
      lastContactedAt,
      leadMessage,
      bookings,
      activity: sortActivityNewestFirst(activity).filter((a) => a.at),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebaseConfig ? 503 : 500 }
    );
  }
}
