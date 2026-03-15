import { NextRequest, NextResponse } from "next/server";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import type { Booking, AddonSelection, Slot, Experience } from "@/lib/booking/types";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";
import { parseSlotIdRelaxed, parseSlotId, getSlotStartEnd, buildSlotId } from "@/lib/booking/experience-slots";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import { getMaxGuestsForExperience } from "@/lib/booking/experience-capacity";
import { getDepartureInventoryRef, reserveCapacity, releaseCapacity } from "@/lib/booking/shared-departure-inventory";
import { formatBookingTimeSafe } from "@/lib/booking/format-booking-datetime";
import { DEFAULT_CANCELLATION_POLICY } from "@/lib/booking/cancellation-policy";

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
    if (fromDateVal && isNaN(fromDateVal.getTime())) return NextResponse.json({ error: "Invalid from date" }, { status: 400 });
    if (toDateVal && isNaN(toDateVal.getTime())) return NextResponse.json({ error: "Invalid to date" }, { status: 400 });

    const { Timestamp } = getFirestoreExports();
    const endOfDay = (d: Date) => {
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);
      return end;
    };

    let query = db.collection("bookings") as FirebaseFirestore.Query;

    if (fromTripDate && toTripDate) {
      query = query
        .where("startDateStr", ">=", fromTripDate)
        .where("startDateStr", "<=", toTripDate)
        .orderBy("startDateStr", "desc");
    } else {
      query = query.orderBy("createdAt", "desc");
      if (fromDateVal) query = query.where("createdAt", ">=", Timestamp.fromDate(fromDateVal));
      if (toDateVal) query = query.where("createdAt", "<=", Timestamp.fromDate(endOfDay(toDateVal)));
    }

    // Do not add status or experienceId to Firestore query (would require composite indexes).
    // Apply them in JS after fetch; max 200 docs is acceptable for admin.
    // When experienceId filter is set, use variant set (doc id + slug) so legacy slug variants are included.
    let variantSet: Set<string> | null = null;
    if (experienceIdParam) {
      const expSnapForFilter = await db.collection("experiences").doc(experienceIdParam).get();
      const slug = (expSnapForFilter.exists && (expSnapForFilter.data() as { slug?: string })?.slug)
        ? String((expSnapForFilter.data() as { slug: string }).slug).trim()
        : "";
      variantSet = new Set(getExperienceIdVariants(experienceIdParam, slug));
    }

    if (cursorParam) {
      const cursorDoc = await db.collection("bookings").doc(cursorParam).get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    }

    // Fetch more than limit so that after JS filtering we may still have enough for one page.
    const fetchSize = Math.min(limit * 5, 500);
    const snap = await query.limit(fetchSize).get();
    let docs = snap.docs;

    if (statusFilter) docs = docs.filter((d) => (d.data() as Booking).status === statusFilter);
    if (variantSet) docs = docs.filter((d) => variantSet!.has((d.data() as Booking).experienceId ?? ""));

    let nextCursor: string | null = null;
    if (docs.length > limit) {
      nextCursor = docs[limit - 1].id;
      docs = docs.slice(0, limit);
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

    return NextResponse.json({ bookings: list, nextCursor });
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
    if (!Number.isInteger(startHour) || startHour < 7 || startHour > 19) return NextResponse.json({ error: "startHour must be 7–19 (last departure 7pm)" }, { status: 400 });
    if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 12) return NextResponse.json({ error: "durationHours must be 1–12" }, { status: 400 });
    if (!customer.name || !customer.email) return NextResponse.json({ error: "customer name and email are required" }, { status: 400 });
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customer.email)) return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    if (totalCents < 0) return NextResponse.json({ error: "totalCents must be >= 0" }, { status: 400 });

    const db = getDb();
    const { Timestamp, FieldValue } = getFirestoreExports();

    const expSnap = await db.collection("experiences").doc(experienceId).get();
    if (!expSnap.exists) return NextResponse.json({ error: "Experience not found" }, { status: 404 });
    const exp = expSnap.data() as Experience;

    if (boatId) {
      const boatSnap = await db.collection("boats").doc(boatId).get();
      const boatData = boatSnap.data() as { experienceIds?: string[] } | undefined;
      const assigned = boatData?.experienceIds?.includes(experienceId);
      if (!boatSnap.exists || !assigned) boatId = undefined;
    }

    const partySizeNum = Number.isInteger(partySize) && partySize > 0 ? partySize : 1;
    let inventoryRef: ReturnType<typeof getDepartureInventoryRef> | null = null;
    if (exp.pricingType === "ticketed") {
      inventoryRef = getDepartureInventoryRef(db, experienceId, tripDate);
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
      ...(exp.pricingType === "ticketed" && inventoryRef !== null && { bookingMode: "shared" as const }),
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
    const dayStart = new Date(tripDate + "T00:00:00");
    const dayEnd = new Date(tripDate + "T23:59:59.999");
    const now = new Date();

    await db.runTransaction(async (tx) => {
      // Ticketed capacity check inside transaction to prevent over-selling under concurrency.
      if (exp.pricingType === "ticketed" && inventoryRef !== null) {
        const slugVariants = getExperienceIdVariants(experienceId, exp.slug ?? "");
        const soldSnaps = await Promise.all(
          slugVariants.map((v) =>
            tx.get(db.collection("bookings").where("experienceId", "==", v).where("startDateStr", "==", tripDate))
          )
        );
        const seen = new Set<string>();
        let sold = 0;
        for (const snap of soldSnaps) {
          for (const doc of snap.docs) {
            if (seen.has(doc.id)) continue;
            seen.add(doc.id);
            const b = doc.data() as { partySize?: number; status?: string };
            if (typeof b.partySize !== "number") continue;
            if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) continue;
            sold += b.partySize;
          }
        }
        const capacity = exp.maxCapacity ?? getMaxGuestsForExperience(exp as import("@/lib/booking/types").Experience);
        await reserveCapacity(tx, inventoryRef, capacity, partySizeNum, sold);
        // For direct manual booking the new booking is "sold", not a hold; release the seats we just claimed so reservedSeats stays correct.
        await releaseCapacity(tx, inventoryRef, partySizeNum);
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

      const paidBookingsSnap = await tx.get(
        db.collection("bookings").where("experienceId", "==", experienceId).where("startDateStr", "==", tripDate)
      );
      for (const doc of paidBookingsSnap.docs) {
        const b = doc.data() as { slotId?: string; boatId?: string; status?: string };
        if (boatId && b.boatId !== boatId) continue;
        if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) continue;
        const p = b.slotId ? parseSlotId(b.slotId) : null;
        if (!p) continue;
        const { start: exStart, end: exEnd } = getSlotStartEnd(p.dateStr, p.startHour, p.durationHours, p.startMinute ?? 0);
        if (slotStartMs < exEnd.getTime() && slotEndMs > exStart.getTime()) {
          throw Object.assign(new Error("This time slot overlaps an existing booking"), { code: "SLOT_CONFLICT" });
        }
      }

      tx.set(bookingRef, booking);
      tx.set(slotRef, {
        status: "booked",
        bookingId,
        startAt: Timestamp.fromDate(slotStart),
        endAt: Timestamp.fromDate(slotEnd),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      // Do not increment reservedSeats for ticketed: the new booking is already counted in sold queries from the bookings collection.
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
      console.error("[admin/bookings] waiver creation failed", waiverErr);
    }
    try {
      const { sendBookingConfirmationEmail, sendBookingConfirmationCopyToBusiness } = await import("@/lib/booking/brevo");
      const { formatSlotDateTime } = await import("@/lib/booking/format-booking-datetime");
      const locationText = exp.location?.addressText ?? "We'll send exact meeting point after booking.";
      const cancellationPolicyText = exp.cancellationPolicy?.fullText ?? DEFAULT_CANCELLATION_POLICY;
      const experienceName = exp.title ?? experienceId;
      const emailContext = {
        boatName: experienceName,
        startAt: formatSlotDateTime({ toDate: () => slotStart }),
        endAt: formatSlotDateTime({ toDate: () => slotEnd }),
        durationHours: durationFromRate,
        locationText,
        cancellationPolicyText,
        isDeposit: false,
        manageLink: undefined,
        waiverSigningUrl: undefined,
        waiverGroupSigningUrl: undefined,
        pricingType: exp.pricingType,
      };
      const bookingForEmail = { ...booking, id: bookingId } as Booking;
      await sendBookingConfirmationEmail(bookingForEmail, emailContext);
      await sendBookingConfirmationCopyToBusiness(bookingForEmail, emailContext);
    } catch (emailErr) {
      console.error("[admin/bookings] confirmation email failed", emailErr);
    }
    return NextResponse.json({ id: bookingId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if ((err as { code?: string }).code === "SLOT_CONFLICT") {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebaseConfig ? 503 : 500 }
    );
  }
}
