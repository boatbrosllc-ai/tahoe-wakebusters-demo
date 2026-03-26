import { NextRequest, NextResponse } from "next/server";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import type { Booking, AddonSelection, Slot, Experience } from "@/lib/booking/types";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";
import { parseSlotIdRelaxed, parseSlotId, getSlotStartEnd, getCentralCalendarDayBounds, buildSlotId } from "@/lib/booking/experience-slots";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import { getMaxGuestsForExperience } from "@/lib/booking/experience-capacity";
import {
  addCalendarDaysToDateStr,
  bookingLookbackDaysFromMaxDuration,
  intervalsOverlapMs,
} from "@/lib/booking/booking-interval";
import { formatBookingTimeSafe } from "@/lib/booking/format-booking-datetime";
import { DEFAULT_CANCELLATION_POLICY } from "@/lib/booking/cancellation-policy";
import { addConfirmationOutboxInTransaction } from "@/lib/booking/notification-outbox";
import { hasOverlappingBlock, BlockCheckUnavailableError } from "@/lib/booking/has-overlapping-block";
import { fetchListingBoatsForExperience } from "@/lib/booking/listing-boat-resolution";
import { computePricing } from "@/lib/booking/pricing";
import { TAX_RATE } from "@/lib/booking/constants";
import {
  assertNoOverlappingActiveSameDaySlots,
  assertSlotAvailable,
  transactionGetQueryOrDoc,
  SlotConflictError,
} from "@/lib/booking/slot-availability";

function toDate(ts: { seconds?: number; nanoseconds?: number; toDate?: () => Date }): string | null {
  if (ts.toDate) return ts.toDate().toISOString();
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000).toISOString();
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
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10) || 50, 200);
    const cursorParam = request.nextUrl.searchParams.get("cursor");
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
    if (fromTripDate && toTripDate && fromTripDate > toTripDate) {
      return NextResponse.json({ error: "fromTripDate must be on or before toTripDate" }, { status: 400 });
    }
    const hasTripFilter = !!(fromTripDate || toTripDate);
    if (fromDateVal && isNaN(fromDateVal.getTime())) return NextResponse.json({ error: "Invalid from date" }, { status: 400 });
    if (toDateVal && isNaN(toDateVal.getTime())) return NextResponse.json({ error: "Invalid to date" }, { status: 400 });

    const { Timestamp } = getFirestoreExports();
    const endOfDay = (d: Date) => {
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);
      return end;
    };

    // Build variant set for experienceId filter (doc id + slug); use in-query when <= 10 for index support.
    let variantSet: Set<string> | null = null;
    let experienceIdInValues: string[] | null = null;
    if (experienceIdParam) {
      const expSnapForFilter = await db.collection("experiences").doc(experienceIdParam).get();
      const slug = (expSnapForFilter.exists && (expSnapForFilter.data() as { slug?: string })?.slug)
        ? String((expSnapForFilter.data() as { slug: string }).slug).trim()
        : "";
      variantSet = new Set(getExperienceIdVariants(experienceIdParam, slug));
      if (variantSet.size > 0 && variantSet.size <= 10) {
        experienceIdInValues = Array.from(variantSet);
      }
    }

    let query = db.collection("bookings") as FirebaseFirestore.Query;

    /** Trip filters use startDateStr; open-ended supported. When booking-date filters are also set, they are ANDed in memory after the trip query (see list filter below). */
    if (hasTripFilter) {
      if (experienceIdInValues) query = query.where("experienceId", "in", experienceIdInValues);
      if (statusFilter) query = query.where("status", "==", statusFilter);
      if (fromTripDate) query = query.where("startDateStr", ">=", fromTripDate);
      if (toTripDate) query = query.where("startDateStr", "<=", toTripDate);
      query = query.orderBy("startDateStr", "desc");
    } else {
      if (experienceIdInValues) query = query.where("experienceId", "in", experienceIdInValues);
      if (statusFilter) query = query.where("status", "==", statusFilter);
      query = query.orderBy("createdAt", "desc");
      if (fromDateVal) query = query.where("createdAt", ">=", Timestamp.fromDate(fromDateVal));
      if (toDateVal) query = query.where("createdAt", "<=", Timestamp.fromDate(endOfDay(toDateVal)));
    }

    if (cursorParam) {
      const cursorDoc = await db.collection("bookings").doc(cursorParam).get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    }

    // When experienceId filter has >10 variants we can't use Firestore "in"; apply in JS and fetch more.
    const fetchSize = variantSet && variantSet.size > 10 ? limit * 10 : limit;
    const snap = await query.limit(fetchSize).get();
    let docs = snap.docs;

    if (variantSet && variantSet.size > 10) {
      docs = docs.filter((d) => variantSet!.has((d.data() as Booking).experienceId ?? ""));
    }

    const hitLimit = snap.docs.length >= fetchSize;
    const headers = new Headers();
    if (hitLimit) headers.set("X-Results-Truncated", "true");

    let nextCursor: string | null = null;
    if (docs.length > limit) {
      docs = docs.slice(0, limit);
    }
    if (hitLimit && docs.length > 0) {
      nextCursor = docs[docs.length - 1].id;
    }

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
        const [expSnap, addonsSnap] = await Promise.all([
          db.collection("experiences").doc(id).get(),
          db.collection("experiences").doc(id).collection("addons").get(),
        ]);
        if (expSnap.exists) {
          const data = expSnap.data() as { title?: string };
          experienceNames.set(id, data.title ?? id);
        }
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
      const parsed = parseSlotIdRelaxed(b.slotId ?? "");
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

      const bWithExt = b as Booking & { card?: { brand?: string; last4?: string; expMonth?: number; expYear?: number }; finalChargeAt?: { seconds?: number; toDate?: () => Date } };
      const finalChargeAt = bWithExt.finalChargeAt;
      let finalChargeAtStr: string | null = null;
      if (finalChargeAt) {
        if (typeof finalChargeAt.toDate === "function") finalChargeAtStr = finalChargeAt.toDate().toISOString();
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

    if (hasTripFilter && (fromDateVal || toDateVal)) {
      list = list.filter((row) => {
        const ca = row.createdAt;
        if (!ca) return false;
        const created = new Date(ca);
        if (fromDateVal && created < fromDateVal) return false;
        if (toDateVal && created > endOfDay(toDateVal)) return false;
        return true;
      });
    }

    return NextResponse.json({ bookings: list, nextCursor }, { headers });
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
    const amountIncludesTax = body.amountIncludesTax === true;
    const confirmZeroDollarBooking = body.confirmZeroDollarBooking === true;
    const subtotalCentsRaw =
      typeof body.subtotalCents === "number"
        ? Math.max(0, Math.floor(body.subtotalCents))
        : typeof body.totalCents === "number"
          ? Math.max(0, Math.floor(body.totalCents))
          : Math.max(0, Math.round(parseFloat(String(body.totalCents ?? 0)) * 100));
    const subtotalCentsInput = amountIncludesTax
      ? Math.max(0, Math.floor(subtotalCentsRaw / (1 + TAX_RATE)))
      : subtotalCentsRaw;
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
    if (!Number.isInteger(startHour) || startHour < 7 || startHour > 19) return NextResponse.json({ error: "startHour must be 7–19 (last departure 7pm)" }, { status: 400 });
    if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 12) return NextResponse.json({ error: "durationHours must be 1–12" }, { status: 400 });
    if (!customer.name || !customer.email) return NextResponse.json({ error: "customer name and email are required" }, { status: 400 });
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customer.email)) return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    if (subtotalCentsInput < 0) return NextResponse.json({ error: "subtotal must be >= 0" }, { status: 400 });
    if (subtotalCentsInput === 0 && !confirmZeroDollarBooking) {
      return NextResponse.json(
        {
          error:
            "This booking has a $0 total. Confirm that a complimentary or zero-dollar booking is intentional (send confirmZeroDollarBooking: true).",
        },
        { status: 400 }
      );
    }

    if (!amountIncludesTax && subtotalCentsInput > 0) {
      const mod100 = subtotalCentsInput % 100;
      if (mod100 === 25 || mod100 === 75) {
        console.warn(
          "[admin/bookings] manual booking subtotalCents ends in .25/.75 — confirm the admin entered pre-tax subtotal, not a tax-inclusive total",
          { subtotalCentsInput, experienceId }
        );
      }
      if (subtotalCentsInput % 100 === 0 && subtotalCentsInput >= 10_000) {
        console.warn(
          `[admin/bookings] manual booking subtotal is a whole-dollar amount — double-check it is subtotal before tax (${(TAX_RATE * 100).toFixed(2)}%), not an all-in total`,
          { subtotalCentsInput, experienceId }
        );
      }
    }

    const db = getDb();
    const { Timestamp, FieldValue } = getFirestoreExports();

    const expSnap = await db.collection("experiences").doc(experienceId).get();
    if (!expSnap.exists) return NextResponse.json({ error: "Experience not found" }, { status: 404 });
    const exp = expSnap.data() as Experience;

    if (exp.pricingType === "ticketed") {
      return NextResponse.json(
        {
          error:
            "Manual bookings are currently disabled for ticketed experiences. Use the customer booking flow instead so availability and departure inventory stay in sync.",
        },
        { status: 400 }
      );
    }

    const expSlug = typeof exp.slug === "string" ? exp.slug.trim() : "";
    const { docs: listingBoatDocs } = await fetchListingBoatsForExperience(db, experienceId, expSlug);
    const listingBoatIds = listingBoatDocs.map((d) => d.id);

    if (listingBoatIds.length === 1) {
      boatId = listingBoatIds[0];
    } else if (listingBoatIds.length > 1) {
      const chosen = typeof body.boatId === "string" ? body.boatId.trim() : "";
      if (!chosen || !listingBoatIds.includes(chosen)) {
        return NextResponse.json(
          {
            error:
              "This experience has multiple listing boats. Choose which boat this booking is for and send a valid boatId (admin UI: required boat selection).",
          },
          { status: 400 }
        );
      }
      boatId = chosen;
    } else if (boatId) {
      const boatSnap = await db.collection("boats").doc(boatId).get();
      const boatData = boatSnap.data() as { experienceIds?: string[] } | undefined;
      const assigned = boatData?.experienceIds?.includes(experienceId);
      if (!boatSnap.exists || !assigned) boatId = undefined;
    }

    const partySizeNum = Number.isInteger(partySize) && partySize > 0 ? partySize : 1;

    const ratesSnap = await db.collection("experiences").doc(experienceId).collection("rates").orderBy("durationHours").limit(1).get();
    const firstRate = ratesSnap.docs[0];
    const rateId = firstRate?.id ?? "manual";

    const slotId = buildSlotId(tripDate, startHour, durationHours);
    const parsedSlotIdCheck = parseSlotId(slotId);
    if (!parsedSlotIdCheck) {
      console.warn("[admin/bookings] buildSlotId produced unparseable slotId", { slotId, tripDate, startHour, durationHours });
    }
    const noteParts = [source, externalReference ? `Ref: ${externalReference}` : "", specialNotes].filter(Boolean);
    const notes = noteParts.join(" — ");
    const pricingComputed = computePricing({
      rate: { priceCents: subtotalCentsInput },
      addons: [],
      qty: 1,
    });
    const pricing = {
      subtotalCents: pricingComputed.subtotalCents,
      taxCents: pricingComputed.taxCents,
      feesCents: pricingComputed.feesCents,
      totalCents: pricingComputed.totalCents,
      currency: "usd",
    };

    const booking: Omit<Booking, "createdAt"> & {
      createdAt: ReturnType<typeof Timestamp.now>;
      summaryCountersApplied?: boolean;
    } = {
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
      ...(pricing.totalCents > 0 ? { summaryCountersApplied: true as const } : {}),
      ...(hasBilling && billingAddress && { billingAddress }),
      ...(hasCard && cardDisplay && { card: cardDisplay }),
      createdAt: Timestamp.now(),
    };

    const bookingId = db.collection("bookings").doc().id;
    const bookingRef = db.collection("bookings").doc(bookingId);
    const slotRef = boatId
      ? db.collection("boats").doc(boatId).collection("slots").doc(slotId)
      : db.collection("experiences").doc(experienceId).collection("slots").doc(slotId);
    const { start: slotStart, end: slotEnd } = getSlotStartEnd(tripDate, startHour, durationHours, 0);
    const slotStartMs = slotStart.getTime();
    const slotEndMs = slotEnd.getTime();
    const { dayStart, dayEnd } = getCentralCalendarDayBounds(tripDate);
    const now = new Date();
    const experienceIdVariantsForBlocks = getExperienceIdVariants(
      experienceId,
      typeof exp.slug === "string" ? exp.slug.trim() : ""
    );

    await db.runTransaction(async (tx) => {
      const blocked = await hasOverlappingBlock({
        db,
        Timestamp,
        experienceId,
        experienceIdVariants: experienceIdVariantsForBlocks,
        boatId: boatId ?? undefined,
        slotStart,
        slotEnd,
        get: (q) => tx.get(q),
      });
      if (blocked) {
        throw Object.assign(
          new Error(
            "This time falls within an admin-blocked period. Remove the block in Admin → Calendars (or Blocks) first, or pick another time."
          ),
          { code: "BLOCK_CONFLICT" }
        );
      }
      const slotsRef = boatId
        ? db.collection("boats").doc(boatId).collection("slots")
        : db.collection("experiences").doc(experienceId).collection("slots");
      const sameDaySnap = await tx.get(
        slotsRef
          .where("startAt", ">=", Timestamp.fromDate(dayStart))
          .where("startAt", "<=", Timestamp.fromDate(dayEnd))
      );
      const sameDayDocs = sameDaySnap.docs;
      const heldDocs = sameDayDocs.filter((d) => {
        const s = d.data() as Slot;
        return s.status === "held" && s.holdId;
      });
      const bookedDocs = sameDayDocs.filter((d) => {
        const s = d.data() as Slot;
        return s.status === "booked" && s.bookingId;
      });
      const [holdSnaps, bookingSnaps] = await Promise.all([
        heldDocs.length
          ? Promise.all(heldDocs.map((d) => tx.get(db.collection("holds").doc((d.data() as Slot).holdId as string))))
          : Promise.resolve([] as import("firebase-admin/firestore").DocumentSnapshot[]),
        bookedDocs.length
          ? Promise.all(bookedDocs.map((d) => tx.get(db.collection("bookings").doc((d.data() as Slot).bookingId as string))))
          : Promise.resolve([] as import("firebase-admin/firestore").DocumentSnapshot[]),
      ]);
      const holdsById = new Map(heldDocs.map((d, i) => [(d.data() as Slot).holdId as string, holdSnaps[i]]));
      const bookingsById = new Map(bookedDocs.map((d, i) => [(d.data() as Slot).bookingId as string, bookingSnaps[i]]));

      for (const doc of sameDayDocs) {
        const data = doc.data() as Slot;
        if (data.status === "open") continue;
        if (data.status === "held") {
          if (!data.holdId) continue;
          const hSnap = holdsById.get(data.holdId);
          if (!hSnap?.exists) continue;
          const hold = hSnap.data() as { status?: string; expiresAt?: { toDate(): Date } };
          if (hold?.status !== "active") continue;
          const exp = hold?.expiresAt?.toDate?.();
          if (exp && exp <= now) continue;
        } else if (data.status === "booked") {
          if (!data.bookingId) continue;
          const bSnap = bookingsById.get(data.bookingId);
          if (!bSnap?.exists) continue;
          const b = bSnap.data() as { status?: string };
          if (!(b.status && BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never))) continue;
        }
        const existingStart = (data.startAt as { toDate(): Date }).toDate().getTime();
        const existingEnd = (data.endAt as { toDate(): Date }).toDate().getTime();
        if (slotStartMs < existingEnd && slotEndMs > existingStart) {
          throw Object.assign(new Error("This time slot overlaps an existing booking or hold"), { code: "SLOT_CONFLICT" });
        }
      }

      const slugVariantsForOverlap = getExperienceIdVariants(experienceId, exp.slug ?? "");
      const parsedForOverlap = parseSlotIdRelaxed(slotId);
      if (parsedForOverlap) {
        await assertNoOverlappingActiveSameDaySlots({
          db,
          Timestamp,
          get: (refOrQuery) => transactionGetQueryOrDoc(tx, refOrQuery),
          experienceId,
          boatId,
          useBoatSlots: !!boatId,
          parsed: parsedForOverlap,
          slotStart,
          slotEnd,
          now,
        });
        await assertSlotAvailable({
          db,
          Timestamp,
          get: (refOrQuery) => transactionGetQueryOrDoc(tx, refOrQuery),
          experienceId,
          experienceIdVariants: slugVariantsForOverlap,
          parsed: parsedForOverlap,
          slotStart,
          slotEnd,
          boatId,
          useBoatSlots: !!boatId,
          runSameDaySlotScan: false,
          experienceSlug: typeof exp.slug === "string" ? exp.slug.trim() : undefined,
          ignoreSlotDocIds: [slotId],
        });
      }
      const lookbackDays = bookingLookbackDaysFromMaxDuration(durationHours);
      const startDateLower = addCalendarDaysToDateStr(tripDate, -lookbackDays);
      const startDateUpper = addCalendarDaysToDateStr(tripDate, lookbackDays);
      const paidBookingSnaps = await Promise.all(
        slugVariantsForOverlap.map((v) =>
          tx.get(
            db
              .collection("bookings")
              .where("experienceId", "==", v)
              .where("startDateStr", ">=", startDateLower)
              .where("startDateStr", "<=", startDateUpper)
          )
        )
      );
      const seenBookingIds = new Set<string>();
      for (const snap of paidBookingSnaps) {
        for (const doc of snap.docs) {
          if (seenBookingIds.has(doc.id)) continue;
          seenBookingIds.add(doc.id);
          const b = doc.data() as { slotId?: string; boatId?: string; status?: string };
          if (boatId && b.boatId !== boatId) continue;
          if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) continue;
          const p = b.slotId ? parseSlotId(b.slotId) : null;
          if (!p) continue;
          const { start: exStart, end: exEnd } = getSlotStartEnd(p.dateStr, p.startHour, p.durationHours, p.startMinute ?? 0);
          if (intervalsOverlapMs(slotStartMs, slotEndMs, exStart.getTime(), exEnd.getTime())) {
            throw Object.assign(new Error("This time slot overlaps an existing booking"), { code: "SLOT_CONFLICT" });
          }
        }
      }

      const slotSnapBeforeWrite = await tx.get(slotRef);
      if (slotSnapBeforeWrite.exists) {
        const slotStatus = (slotSnapBeforeWrite.data() as { status?: string }).status;
        if (slotStatus === "held") {
          throw Object.assign(
            new Error(
              "This slot is currently on hold. Release the hold or wait for it to expire before adding a manual booking."
            ),
            { code: "SLOT_CONFLICT" }
          );
        }
      }

      tx.set(bookingRef, booking);
      await addConfirmationOutboxInTransaction(tx, db, bookingId);
      if (pricing.totalCents > 0) {
        const summaryRef = db.collection("summaries").doc("revenue");
        tx.set(
          summaryRef,
          {
            totalRevenueCents: FieldValue.increment(pricing.totalCents),
            bookingCount: FieldValue.increment(1),
          },
          { merge: true }
        );
        const now = new Date();
        const monthKey = `revenue_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}`;
        tx.set(
          db.collection("summaries").doc(monthKey),
          {
            revenueCents: FieldValue.increment(pricing.totalCents),
            bookingCount: FieldValue.increment(1),
          },
          { merge: true }
        );
      }
      tx.set(slotRef, {
        status: "booked",
        bookingId,
        startAt: Timestamp.fromDate(slotStart),
        endAt: Timestamp.fromDate(slotEnd),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
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
      const wMsg = waiverErr instanceof Error ? waiverErr.message : String(waiverErr);
      const wStack = waiverErr instanceof Error ? waiverErr.stack : undefined;
      console.warn("[admin/bookings] waiver creation failed:", wMsg, wStack ?? "");
    }
    // Confirmation email (+ SMS) is sent by the process-confirmation-outbox cron
    return NextResponse.json({
      id: bookingId,
      pricing,
      totalCentsIntegrity: {
        storedTotalCents: pricing.totalCents,
        subtotalCentsInput,
        amountIncludesTax,
        taxRate: TAX_RATE,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof BlockCheckUnavailableError) {
      return NextResponse.json(
        { error: "Unable to verify admin blocks. Deploy Firestore indexes and try again." },
        { status: 503 }
      );
    }
    if (err instanceof SlotConflictError) {
      return NextResponse.json(
        { error: `Manual booking conflict: ${err.message}` },
        { status: 409 }
      );
    }
    if ((err as { code?: string }).code === "SLOT_CONFLICT" || (err as { code?: string }).code === "BLOCK_CONFLICT") {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebaseConfig ? 503 : 500 }
    );
  }
}
