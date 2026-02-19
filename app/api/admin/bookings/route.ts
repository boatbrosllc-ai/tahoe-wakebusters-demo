import { NextRequest, NextResponse } from "next/server";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import type { Booking, AddonSelection } from "@/lib/booking/types";
import { parseSlotId, getSlotStartEnd, buildSlotId } from "@/lib/booking/experience-slots";
import { formatBookingTimeSafe } from "@/lib/booking/format-booking-datetime";

function toDate(ts: { seconds?: number; nanoseconds?: number; toDate?: () => Date }): string | null {
  if (ts.toDate) return ts.toDate().toISOString();
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000).toISOString();
  return null;
}

/** Parse slotId (handles "2026-2-27-11-6" and "2026-02-27-11-6") for trip date and times. */
function parseSlotIdForDisplay(slotId: string | null | undefined): { dateStr: string; startHour: number; startMinute: number; durationHours: number } | null {
  if (!slotId || typeof slotId !== "string") return null;
  const trimmed = slotId.trim();
  if (!trimmed) return null;
  let parsed = parseSlotId(trimmed);
  if (parsed) return parsed;
  const cleaned = trimmed.replace(/\s/g, "");
  if (/^\d{4}-\d{1,2}-\d{1,2}-\d{1,2}-\d{1,2}$/.test(cleaned)) {
    const parts = cleaned.split("-");
    const normalized = `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}-${parts[3]}-${parts[4]}`;
    return parseSlotId(normalized);
  }
  if (/^\d{4}-\d{1,2}-\d{1,2}-\d{1,2}-\d{1,2}-\d{1,2}$/.test(cleaned)) {
    const parts = cleaned.split("-");
    const normalized = `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}-${parts[3]}-${parts[4]}-${parts[5]}`;
    return parseSlotId(normalized);
  }
  return null;
}

/** Normalize to YYYY-MM-DD so range comparison works (e.g. "2026-2-18" -> "2026-02-18"). */
function normalizeTripDateStr(s: string | null | undefined): string | null {
  if (!s || typeof s !== "string") return null;
  const trimmed = s.trim();
  const match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return null;
  const [, y, m, d] = match;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** Addon with display name for admin list/detail */
export type AddonWithName = { addonId: string; name: string; qty: number };

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const db = getDb();
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") ?? "100", 10) || 100, 500);
    const statusFilter = request.nextUrl.searchParams.get("status"); // paid | canceled | refunded
    const experienceIdParam = request.nextUrl.searchParams.get("experienceId"); // filter by experience (e.g. for calendar)
    const fromParam = request.nextUrl.searchParams.get("from"); // booking date (createdAt)
    const toParam = request.nextUrl.searchParams.get("to"); // booking date (createdAt)
    const fromTripParam = request.nextUrl.searchParams.get("fromTripDate"); // trip date (startDate from slotId)
    const toTripParam = request.nextUrl.searchParams.get("toTripDate"); // trip date

    const fromDateVal = fromParam ? new Date(fromParam) : null;
    const toDateVal = toParam ? new Date(toParam) : null;
    const fromTripDate = fromTripParam && /^\d{4}-\d{2}-\d{2}$/.test(fromTripParam) ? fromTripParam : null;
    const toTripDate = toTripParam && /^\d{4}-\d{2}-\d{2}$/.test(toTripParam) ? toTripParam : null;
    if (fromDateVal && isNaN(fromDateVal.getTime())) return NextResponse.json({ error: "Invalid from date" }, { status: 400 });
    if (toDateVal && isNaN(toDateVal.getTime())) return NextResponse.json({ error: "Invalid to date" }, { status: 400 });

    let docs: QueryDocumentSnapshot[];
    if (fromTripDate && toTripDate) {
      const tripLimit = Math.min(limit, 500);
      const tripDateInRange = (b: Booking) => {
        const startDateStr = (b as { startDateStr?: string }).startDateStr;
        const parsed = parseSlotIdForDisplay(b.slotId);
        const tripDateNorm = normalizeTripDateStr(startDateStr ?? parsed?.dateStr ?? null);
        if (!tripDateNorm) return false;
        return tripDateNorm >= fromTripDate && tripDateNorm <= toTripDate;
      };
      let byTripDocs: QueryDocumentSnapshot[] = [];
      try {
        const byTripSnap = await db
          .collection("bookings")
          .where("startDateStr", ">=", fromTripDate)
          .where("startDateStr", "<=", toTripDate)
          .limit(tripLimit)
          .get();
        byTripDocs = byTripSnap.docs;
      } catch {
        // Index may be missing; fall back to createdAt + in-memory filter
      }
      const createdAtSnap = await db.collection("bookings").orderBy("createdAt", "desc").limit(2000).get();
      const fromCreatedAt = createdAtSnap.docs.filter((d) => tripDateInRange(d.data() as Booking));
      const merged = new Map<string, QueryDocumentSnapshot>();
      byTripDocs.forEach((d) => merged.set(d.id, d));
      fromCreatedAt.forEach((d) => {
        if (!merged.has(d.id)) merged.set(d.id, d);
      });
      docs = Array.from(merged.values());
    } else {
      const snap = await db.collection("bookings").orderBy("createdAt", "desc").limit(2000).get();
      docs = snap.docs;
    }

    if (statusFilter) docs = docs.filter((d) => (d.data() as Booking).status === statusFilter);
    if (experienceIdParam) docs = docs.filter((d) => (d.data() as Booking).experienceId === experienceIdParam);
    if (fromDateVal || toDateVal) {
      docs = docs.filter((d) => {
        const b = d.data() as Booking;
        const createdAt = b.createdAt
          ? (typeof (b.createdAt as { toDate?: () => Date }).toDate === "function"
            ? (b.createdAt as { toDate: () => Date }).toDate()
            : typeof (b.createdAt as { seconds?: number }).seconds === "number"
              ? new Date((b.createdAt as { seconds: number }).seconds * 1000)
              : null)
          : null;
        if (!createdAt) return false;
        if (fromDateVal && createdAt < fromDateVal) return false;
        if (toDateVal) {
          const endOfDay = new Date(toDateVal);
          endOfDay.setHours(23, 59, 59, 999);
          if (createdAt > endOfDay) return false;
        }
        return true;
      });
    }
    docs = docs.slice(0, limit);
    const experienceIds = new Set<string>();
    const boatIds = new Set<string>();
    docs.forEach((d) => {
      const b = d.data() as Booking;
      if (b.experienceId) experienceIds.add(b.experienceId);
      if (b.boatId) boatIds.add(b.boatId);
    });

    const experienceNames = new Map<string, string>();
    const experienceAddons = new Map<string, Map<string, string>>(); // experienceId -> addonId -> name
    await Promise.all(
      Array.from(experienceIds).map(async (id) => {
        const expSnap = await db.collection("experiences").doc(id).get();
        if (expSnap.exists) {
          const data = expSnap.data() as { title?: string };
          experienceNames.set(id, data.title ?? id);
        }
        const addonsSnap = await db.collection("experiences").doc(id).collection("addons").get();
        const addonMap = new Map<string, string>();
        addonsSnap.docs.forEach((ad) => {
          const a = ad.data() as { name?: string };
          addonMap.set(ad.id, a.name ?? ad.id);
        });
        experienceAddons.set(id, addonMap);
      })
    );

    const boatNames = new Map<string, string>();
    await Promise.all(
      Array.from(boatIds).map(async (id) => {
        const boatSnap = await db.collection("boats").doc(id).get();
        if (boatSnap.exists) {
          const data = boatSnap.data() as { name?: string };
          boatNames.set(id, data.name ?? id);
        }
      })
    );

    let list = docs.map((d) => {
      const b = d.data() as Booking & { startDateStr?: string };
      const createdAt = b.createdAt ? toDate(b.createdAt as { seconds?: number; toDate?: () => Date }) : null;
      const parsed = parseSlotIdForDisplay(b.slotId);
      const rawTripDate = b.startDateStr ?? parsed?.dateStr ?? null;
      const startDate = normalizeTripDateStr(rawTripDate);
      let startTime: string | null = null;
      let endTime: string | null = null;
      let durationHours: number | null = null;
      if (parsed) {
        durationHours = parsed.durationHours;
        const { start, end } = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute ?? 0);
        startTime = formatBookingTimeSafe(start);
        endTime = formatBookingTimeSafe(end);
      }
      const addonMap = b.experienceId ? experienceAddons.get(b.experienceId) : undefined;
      const addonsWithNames: AddonWithName[] = (b.addonSelections ?? []).map((sel: AddonSelection) => ({
        addonId: sel.addonId,
        name: addonMap?.get(sel.addonId) ?? sel.addonId,
        qty: sel.qty ?? 1,
      }));

      const bWithExt = b as Booking & { card?: { brand?: string; last4?: string; expMonth?: number; expYear?: number }; finalChargeAt?: { seconds?: number; toDate?: () => Date } | string };
      const finalChargeAt = bWithExt.finalChargeAt;
      let finalChargeAtStr: string | null = null;
      if (finalChargeAt) {
        if (typeof finalChargeAt === "string") finalChargeAtStr = finalChargeAt;
        else if (typeof finalChargeAt.toDate === "function") finalChargeAtStr = finalChargeAt.toDate().toISOString();
        else if (typeof (finalChargeAt as { seconds?: number }).seconds === "number") finalChargeAtStr = new Date((finalChargeAt as { seconds: number }).seconds * 1000).toISOString();
      }
      const bWaiver = (b as { waiver?: { requestId: string; status: string; templateId: string; templateVersion: number } }).waiver;
      return {
        id: d.id,
        experienceId: b.experienceId,
        experienceName: b.experienceId ? experienceNames.get(b.experienceId) ?? "—" : "—",
        boatId: b.boatId ?? null,
        boatName: b.boatId ? boatNames.get(b.boatId) ?? b.boatId : null,
        customer: b.customer,
        partySize: b.partySize ?? null,
        petsCount: b.petsCount ?? 0,
        specialNotes: b.specialNotes ?? null,
        answers: b.answers ?? {},
        addonSelections: b.addonSelections ?? [],
        addonsWithNames,
        durationHours,
        slotId: b.slotId ?? null,
        rateId: b.rateId ?? null,
        pricing: b.pricing,
        status: b.status,
        stripe: b.stripe ?? undefined,
        card: bWithExt.card ?? undefined,
        finalChargeAt: finalChargeAtStr,
        createdAt,
        startDate,
        startTime,
        endTime,
        waiver: bWaiver ?? undefined,
      };
    });

    if (fromTripDate || toTripDate) {
      list = list.filter((item) => {
        const raw = item.startDate ?? item.createdAt?.slice(0, 10);
        const tripDate = normalizeTripDateStr(raw);
        if (!tripDate) return false;
        if (fromTripDate && tripDate < fromTripDate) return false;
        if (toTripDate && tripDate > toTripDate) return false;
        return true;
      });
    }
    if (experienceIdParam) {
      list = list.filter((item) => item.experienceId === experienceIdParam);
    }

    return NextResponse.json(list);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebaseConfig ? 503 : 500 }
    );
  }
}

/** Manual booking (e.g. from GetMyBoat, Viator, phone). Creates a booking doc with synthetic slotId; does not update slot/boat. */
export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json().catch(() => ({}));
    const experienceId = typeof body.experienceId === "string" ? body.experienceId.trim() : "";
    const tripDate = typeof body.tripDate === "string" ? body.tripDate.trim() : "";
    const startHour = typeof body.startHour === "number" ? body.startHour : parseInt(String(body.startHour), 10);
    const durationHours = typeof body.durationHours === "number" ? body.durationHours : parseInt(String(body.durationHours), 10);
    const customer = body.customer && typeof body.customer === "object"
      ? {
          name: typeof body.customer.name === "string" ? body.customer.name.trim() : "",
          email: typeof body.customer.email === "string" ? body.customer.email.trim() : "",
          phone: typeof body.customer.phone === "string" ? body.customer.phone.trim() : "",
        }
      : { name: "", email: "", phone: "" };
    const partySize = typeof body.partySize === "number" ? body.partySize : parseInt(String(body.partySize), 10) || 1;
    const totalCents = typeof body.totalCents === "number" ? body.totalCents : Math.round(parseFloat(String(body.totalCents || 0)) * 100);
    const source = typeof body.source === "string" ? body.source.trim() : "";
    const externalReference = typeof body.externalReference === "string" ? body.externalReference.trim() : "";
    const specialNotes = typeof body.specialNotes === "string" ? body.specialNotes.trim() : "";
    let boatId: string | undefined = typeof body.boatId === "string" ? body.boatId.trim() || undefined : undefined;

    const billingAddress = body.billingAddress && typeof body.billingAddress === "object"
      ? {
          line1: typeof body.billingAddress.line1 === "string" ? body.billingAddress.line1.trim() : undefined,
          line2: typeof body.billingAddress.line2 === "string" ? body.billingAddress.line2.trim() : undefined,
          city: typeof body.billingAddress.city === "string" ? body.billingAddress.city.trim() : undefined,
          state: typeof body.billingAddress.state === "string" ? body.billingAddress.state.trim() : undefined,
          zip: typeof body.billingAddress.zip === "string" ? body.billingAddress.zip.trim() : undefined,
          country: typeof body.billingAddress.country === "string" ? body.billingAddress.country.trim() : undefined,
        }
      : undefined;
    const hasBilling = billingAddress && Object.values(billingAddress).some(Boolean);

    const cardInput = body.card && typeof body.card === "object" ? body.card as { last4?: string; brand?: string; expMonth?: number; expYear?: number } : undefined;
    const cardDisplay = cardInput
      ? {
          last4: typeof cardInput.last4 === "string" ? cardInput.last4.replace(/\D/g, "").slice(-4) : undefined,
          brand: typeof cardInput.brand === "string" ? cardInput.brand.trim() : undefined,
          expMonth: typeof cardInput.expMonth === "number" && cardInput.expMonth >= 1 && cardInput.expMonth <= 12 ? cardInput.expMonth : undefined,
          expYear: typeof cardInput.expYear === "number" && cardInput.expYear >= 2000 ? cardInput.expYear : undefined,
        }
      : undefined;
    const hasCard = cardDisplay && (cardDisplay.last4 || cardDisplay.brand);

    if (!experienceId) return NextResponse.json({ error: "experienceId is required" }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tripDate)) return NextResponse.json({ error: "tripDate must be YYYY-MM-DD" }, { status: 400 });
    if (!Number.isInteger(startHour) || startHour < 7 || startHour > 18) return NextResponse.json({ error: "startHour must be 7–18 (operating hours 7am–7pm)" }, { status: 400 });
    if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 12) return NextResponse.json({ error: "durationHours must be 1–12" }, { status: 400 });
    if (!customer.name || !customer.email) return NextResponse.json({ error: "customer name and email are required" }, { status: 400 });
    if (totalCents < 0) return NextResponse.json({ error: "totalCents must be >= 0" }, { status: 400 });

    const db = getDb();
    const { Timestamp } = getFirestoreExports();

    const expSnap = await db.collection("experiences").doc(experienceId).get();
    if (!expSnap.exists) return NextResponse.json({ error: "Experience not found" }, { status: 404 });

    if (boatId) {
      const boatSnap = await db.collection("boats").doc(boatId).get();
      const boatData = boatSnap.data() as { experienceIds?: string[] } | undefined;
      const assigned = boatData?.experienceIds?.includes(experienceId);
      if (!boatSnap.exists || !assigned) boatId = undefined;
    }

    const ratesSnap = await db.collection("experiences").doc(experienceId).collection("rates").orderBy("durationHours").limit(1).get();
    const firstRate = ratesSnap.docs[0];
    const rateId = firstRate?.id ?? "manual";
    const durationFromRate = firstRate ? (firstRate.data() as { durationHours?: number }).durationHours : durationHours;

    const slotId = buildSlotId(tripDate, startHour, durationHours);
    const noteParts = [source, externalReference ? `Ref: ${externalReference}` : "", specialNotes].filter(Boolean);
    const notes = noteParts.join(" — ");
    const pricing = {
      subtotalCents: totalCents,
      taxCents: 0,
      feesCents: 0,
      totalCents,
      currency: "usd",
    };

    const booking: Omit<Booking, "createdAt"> & { createdAt: ReturnType<typeof Timestamp.now> } = {
      ...(boatId && { boatId }),
      experienceId,
      slotId,
      startDateStr: tripDate,
      rateId,
      addonSelections: [],
      partySize: Number.isInteger(partySize) && partySize > 0 ? partySize : 1,
      petsCount: 0,
      answers: {},
      customer: { name: customer.name, email: customer.email, phone: customer.phone },
      specialNotes: notes || undefined,
      pricing,
      status: "paid",
      stripe: {},
      ...(hasBilling && billingAddress && { billingAddress }),
      ...(hasCard && cardDisplay && { card: cardDisplay }),
      createdAt: Timestamp.now(),
    };

    const ref = await db.collection("bookings").add(booking);
    const bookingId = ref.id;
    try {
      const { createWaiverForBooking, sendWaiverInviteAndMarkSent } = await import("@/lib/waiver/on-booking-created");
      const waiverResult = await createWaiverForBooking({
        bookingId,
        customerEmail: customer.email,
        customerName: customer.name,
      });
      if (waiverResult?.sendSeparateWaiverInvite) {
        await sendWaiverInviteAndMarkSent(waiverResult);
      }
    } catch (waiverErr) {
      console.error("[admin/bookings] waiver creation failed", waiverErr);
    }
    return NextResponse.json({ id: bookingId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebaseConfig ? 503 : 500 }
    );
  }
}
