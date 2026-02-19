import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { hasFirebaseConfig } from "@/lib/booking/env";
import {
  buildSlotId,
  getSlotGrid,
  getSlotGridForStartTimes,
  getSlotGridWithSaturdayOnlyRestriction,
  getSlotStartEnd,
  parseSlotId,
  WAKEBOARD_SATURDAY_START_TIMES,
} from "@/lib/booking/experience-slots";
import type { Slot } from "@/lib/booking/types";
import type { ExperienceRate } from "@/lib/booking/types";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";

export const dynamic = "force-dynamic";

const SLOTS_FIREBASE_HINT =
  "Slots require Firebase. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY (or FIREBASE_SERVICE_ACCOUNT_JSON_PATH) in your deployment environment.";

export async function GET(request: NextRequest) {
  try {
    if (!hasFirebaseConfig()) {
      return NextResponse.json(
        { error: "Booking is not configured.", hint: SLOTS_FIREBASE_HINT },
        { status: 503 }
      );
    }
    const boatId = request.nextUrl.searchParams.get("boatId");
    const experienceId = request.nextUrl.searchParams.get("experienceId");
    const startDate = request.nextUrl.searchParams.get("startDate");
    const endDate = request.nextUrl.searchParams.get("endDate");
    if ((!boatId && !experienceId) || !startDate || !endDate) {
      return NextResponse.json({ error: "boatId or experienceId, startDate, endDate required (YYYY-MM-DD)" }, { status: 400 });
    }
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T23:59:59");
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }
    const maxDays = 92;
    const daysMs = end.getTime() - start.getTime();
    if (daysMs > maxDays * 24 * 60 * 60 * 1000 || daysMs < 0) {
      return NextResponse.json({ error: `Date range must be between 1 and ${maxDays} days` }, { status: 400 });
    }
    const db = getDb();
    const { Timestamp } = getFirestoreExports();

    if (experienceId) {
      // Experiences with listing boats: slots are per boat so one boat booked doesn't block others.
      // Optional boatId: return only that boat's slots. Otherwise return slots for all boats (each slot has boatId).
      const expRef = db.collection("experiences").doc(experienceId);
      const expDoc = await expRef.get();
      if (!expDoc.exists) {
        return NextResponse.json({ error: "Experience not found" }, { status: 404 });
      }
      const expData = expDoc.data() as { slug?: string } | undefined;
      const experienceSlug = typeof expData?.slug === "string" ? expData.slug.trim() : "";
      const ratesSnap = await expRef.collection("rates").where("active", "==", true).get();
      const durations = ratesSnap.docs.map((d) => (d.data() as ExperienceRate).durationHours);
      const durationsUnique = Array.from(new Set(durations));
      const boatIdParam = request.nextUrl.searchParams.get("boatId");
      let boatIds: string[] = [];
      const boatsSnap = await db
        .collection("boats")
        .where("isListingBoat", "==", true)
        .where("active", "==", true)
        .where("experienceIds", "array-contains", experienceId)
        .get();
      boatIds = boatsSnap.docs.map((d) => d.id);
      // Fallback: boats may be linked by experience slug (e.g. "lake-austin-pontoon-charter") instead of Firestore id.
      if (boatIds.length === 0 && experienceSlug && experienceSlug !== experienceId) {
        const boatsBySlugSnap = await db
          .collection("boats")
          .where("isListingBoat", "==", true)
          .where("active", "==", true)
          .where("experienceIds", "array-contains", experienceSlug)
          .get();
        boatIds = boatsBySlugSnap.docs.map((d) => d.id);
      }
      if (boatIdParam) {
        if (!boatIds.includes(boatIdParam)) {
          return NextResponse.json({ error: "Boat not found or not assigned to this experience" }, { status: 404 });
        }
        boatIds = [boatIdParam];
      }
      // If no boats linked to this experience (e.g. boats use slug and experience has different id), still show booked slots by using boatIds from bookings.
      let bookingsFromFallback: { id: string; data: () => Record<string, unknown> }[] = [];
      if (boatIds.length === 0) {
        const byIdSnap = await db
          .collection("bookings")
          .where("experienceId", "==", experienceId)
          .where("status", "in", [...BOOKING_STATUSES_SLOT_TAKEN])
          .limit(500)
          .get();
        const seenIds = new Set(byIdSnap.docs.map((d) => d.id));
        const mergedDocs = [...byIdSnap.docs];
        if (experienceSlug && experienceSlug !== experienceId) {
          const bySlugSnap = await db
            .collection("bookings")
            .where("experienceId", "==", experienceSlug)
            .where("status", "in", [...BOOKING_STATUSES_SLOT_TAKEN])
            .limit(500)
            .get();
          bySlugSnap.docs.forEach((d) => {
            if (!seenIds.has(d.id)) {
              seenIds.add(d.id);
              mergedDocs.push(d);
            }
          });
        }
        const fromBookings = new Set<string>();
        mergedDocs.forEach((d) => {
          const boatId = (d.data() as { boatId?: string }).boatId;
          if (typeof boatId === "string" && boatId.trim()) fromBookings.add(boatId.trim());
        });
        boatIds = Array.from(fromBookings);
        if (boatIds.length === 0) return NextResponse.json({ slots: [] });
        bookingsFromFallback = mergedDocs;
      }
      type SlotRow = { id: string; dateStr: string; startAt: string; endAt: string; status: string; holdId: string | null; bookingId: string | null; updatedAt: string | null; boatId: string; experienceId: string };
      const existingByBoatAndKey = new Map<string, SlotRow>();

      /** Calendar date YYYY-MM-DD from slot id — use for grouping so bookings show on the correct day regardless of server timezone. */
      const dateStrFromSlotId = (slotId: string): string => {
        const parsed = parseSlotIdRelaxed(slotId);
        return parsed?.dateStr ?? slotId.slice(0, 10);
      };

      // 1) Bookings are the only source of truth for "booked" (Book Now calendar uses real backend data only).
      // Merge FIRST so we never overwrite with stale slot docs.
      // Only these statuses mean the slot is taken; canceled/refunded are ignored.
      const isSlotTakenStatus = (s: unknown): boolean =>
        typeof s === "string" && (BOOKING_STATUSES_SLOT_TAKEN as readonly string[]).includes(s);
      const normalizeSlotId = (raw: unknown): string | null => {
        if (raw == null) return null;
        const s = String(raw).trim();
        if (s.length === 0) return null;
        return s;
      };
      const parseSlotIdRelaxed = (slotIdRaw: string): ReturnType<typeof parseSlotId> => {
        let parsed = parseSlotId(slotIdRaw);
        if (parsed) return parsed;
        const cleaned = slotIdRaw.replace(/\s/g, "");
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
      };
      const mergeBookingSlot = (doc: { id: string; data: () => Record<string, unknown> }) => {
        const b = doc.data() as { boatId?: string; slotId?: string; slot_id?: string; status?: string; experienceId?: string };
        if (!isSlotTakenStatus(b.status)) return;
        const slotIdRaw = normalizeSlotId(b.slotId ?? b.slot_id);
        if (!slotIdRaw) return;
        const parsed = parseSlotIdRelaxed(slotIdRaw);
        if (!parsed) return;
        if (parsed.dateStr < startDate || parsed.dateStr > endDate) return;
        let slotStart: Date;
        let slotEnd: Date;
        try {
          const se = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute ?? 0);
          slotStart = se.start;
          slotEnd = se.end;
          if (Number.isNaN(slotStart.getTime()) || Number.isNaN(slotEnd.getTime())) {
            slotStart = new Date(parsed.dateStr + "T12:00:00.000Z");
            slotEnd = new Date(slotStart.getTime() + parsed.durationHours * 60 * 60 * 1000);
          }
        } catch {
          slotStart = new Date(parsed.dateStr + "T12:00:00.000Z");
          slotEnd = new Date(slotStart.getTime() + parsed.durationHours * 60 * 60 * 1000);
        }
        const slotIdNorm = buildSlotId(parsed.dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute ?? 0);
        // Only mark the specific boat that has the booking; fallback to first boat if boatId missing or not in list.
        const bidRaw = typeof b.boatId === "string" ? b.boatId.trim() || undefined : undefined;
        const bid = bidRaw && boatIds.includes(bidRaw) ? bidRaw : boatIds[0];
        if (bid) {
          const key = `${bid}:${slotIdNorm}`;
          existingByBoatAndKey.set(key, {
            id: slotIdNorm,
            dateStr: parsed.dateStr,
            startAt: slotStart.toISOString(),
            endAt: slotEnd.toISOString(),
            status: "booked",
            holdId: null,
            bookingId: doc.id,
            updatedAt: null,
            boatId: bid,
            experienceId,
          });
        }
      };

      const allBookingDocs: { id: string; data: () => Record<string, unknown> }[] = [];
      const seenBookingIds = new Set<string>();

      const addBookingsFromQuery = (snap: import("firebase-admin").firestore.QuerySnapshot) => {
        snap.docs.forEach((doc) => {
          if (seenBookingIds.has(doc.id)) return;
          seenBookingIds.add(doc.id);
          allBookingDocs.push(doc);
        });
      };

      let bookingsSnap = await db
        .collection("bookings")
        .where("experienceId", "==", experienceId)
        .where("status", "in", [...BOOKING_STATUSES_SLOT_TAKEN])
        .get();
      addBookingsFromQuery(bookingsSnap);
      // Fallback: some bookings store experienceId as experience slug (e.g. "lake-austin-pontoon" or "pontoon"). Include all variants.
      const slugVariants = new Set<string>();
      if (experienceSlug && experienceSlug !== experienceId) slugVariants.add(experienceSlug);
      if (experienceSlug === "pontoon" || experienceSlug === "lake-austin-pontoon") {
        slugVariants.add("pontoon");
        slugVariants.add("lake-austin-pontoon");
      }
      for (const slugVariant of Array.from(slugVariants)) {
        const bySlugSnap = await db
          .collection("bookings")
          .where("experienceId", "==", slugVariant)
          .where("status", "in", [...BOOKING_STATUSES_SLOT_TAKEN])
          .get();
        addBookingsFromQuery(bySlugSnap);
      }
      allBookingDocs.forEach((doc) => mergeBookingSlot(doc));
      // When we had 0 boats we loaded bookings by experience (doc id or slug); merge those too so deposit/final_due bookings always show.
      bookingsFromFallback.forEach((doc) => mergeBookingSlot(doc));

      /** Safely get Date from Firestore Timestamp or ISO string (avoids 500 on malformed docs). */
      const toDateSafe = (v: unknown): Date | null => {
        if (!v) return null;
        if (typeof v === "string") {
          const d = new Date(v);
          return Number.isNaN(d.getTime()) ? null : d;
        }
        if (typeof v === "object" && v !== null && typeof (v as { toDate?: () => Date }).toDate === "function") {
          return (v as { toDate(): Date }).toDate();
        }
        return null;
      };

      // 2) Load Firestore slot docs — do not overwrite keys already set by bookings.
      await Promise.all(
        boatIds.map(async (bid) => {
          const snap = await db
            .collection("boats")
            .doc(bid)
            .collection("slots")
            .where("startAt", ">=", Timestamp.fromDate(start))
            .where("startAt", "<=", Timestamp.fromDate(end))
            .get();
          snap.docs.forEach((doc) => {
            const key = `${bid}:${doc.id}`;
            if (existingByBoatAndKey.has(key)) return;
            const data = doc.data() as Slot;
            const startAtDate = toDateSafe(data.startAt);
            const endAtDate = toDateSafe(data.endAt);
            if (!startAtDate || !endAtDate) return; // skip malformed slot doc
            const updatedAt = data.updatedAt as { toDate?: () => Date } | undefined;
            const updatedAtIso = updatedAt?.toDate?.()?.toISOString?.() ?? null;
            // "booked" on slot docs is not trusted: only bookings collection is source of truth. Stale slot docs show as open.
            const status = data.status === "booked" ? "open" : data.status;
            existingByBoatAndKey.set(key, {
              id: doc.id,
              dateStr: dateStrFromSlotId(doc.id),
              startAt: startAtDate.toISOString(),
              endAt: endAtDate.toISOString(),
              status,
              holdId: data.holdId,
              bookingId: data.bookingId,
              updatedAt: updatedAtIso,
              boatId: bid,
              experienceId,
            });
          });
        })
      );

      // Per-boat grid: wake/wakesurf boat gets restricted times on Saturday only; other days hourly. Boats with allowedStartTimes use those every day.
      const boatDocs = await Promise.all(boatIds.map((id) => db.collection("boats").doc(id).get()));
      const gridByBoatId = new Map<string, import("@/lib/booking/experience-slots").SlotGridItem[]>();
      for (let i = 0; i < boatIds.length; i++) {
        const bid = boatIds[i];
        const boatData = boatDocs[i]?.data() as { allowedStartTimes?: { hour: number; minute: number }[]; boatType?: string } | undefined;
        const allowedEveryDay = boatData?.allowedStartTimes;
        const isWakeBoat = boatData?.boatType === "wake";
        let grid: import("@/lib/booking/experience-slots").SlotGridItem[];
        if (durationsUnique.length === 0) {
          grid = [];
        } else if (allowedEveryDay?.length) {
          grid = getSlotGridForStartTimes(start, end, durationsUnique, allowedEveryDay);
        } else if (isWakeBoat) {
          grid = getSlotGridWithSaturdayOnlyRestriction(start, end, durationsUnique, WAKEBOARD_SATURDAY_START_TIMES);
        } else {
          grid = getSlotGrid(start, end, durationsUnique);
        }
        gridByBoatId.set(bid, grid);
      }
      const blockRangesByBoat = new Map<string, { start: number; end: number }[]>();
      try {
        const blocksSnap = await db
          .collection("blocks")
          .where("experienceId", "==", experienceId)
          .where("startAt", "<=", Timestamp.fromDate(end))
          .get();
        blocksSnap.docs.forEach((doc) => {
          const b = doc.data() as { boatId?: string | null; startAt: { toDate(): Date }; endAt: { toDate(): Date } };
          const blockStart = b.startAt?.toDate?.()?.getTime();
          const blockEnd = b.endAt?.toDate?.()?.getTime();
          if (blockStart == null || blockEnd == null || blockEnd < start.getTime()) return;
          const range = { start: blockStart, end: blockEnd };
          const boatId = typeof b.boatId === "string" ? b.boatId : null;
          if (boatId) {
            if (!blockRangesByBoat.has(boatId)) blockRangesByBoat.set(boatId, []);
            blockRangesByBoat.get(boatId)!.push(range);
          } else {
            boatIds.forEach((bid) => {
              if (!blockRangesByBoat.has(bid)) blockRangesByBoat.set(bid, []);
              blockRangesByBoat.get(bid)!.push(range);
            });
          }
        });
      } catch (blocksErr) {
        // Index may still be building or missing; continue without blocks so bookings still show
        console.warn("[slots] blocks query failed (index may be building):", blocksErr instanceof Error ? blocksErr.message : blocksErr);
      }
      const slots: SlotRow[] = [];
      for (const bid of boatIds) {
        const grid = gridByBoatId.get(bid) ?? [];
        const takenRanges = [
          ...Array.from(existingByBoatAndKey.values())
            .filter((s) => s.boatId === bid && s.status !== "open")
            .map((s) => ({ start: new Date(s.startAt).getTime(), end: new Date(s.endAt).getTime() })),
          ...(blockRangesByBoat.get(bid) ?? []),
        ];
        for (const { dateStr, startHour, startMinute, durationHours } of grid) {
          const slotId = buildSlotId(dateStr, startHour, durationHours, startMinute);
          const key = `${bid}:${slotId}`;
          const existing = existingByBoatAndKey.get(key);
          if (existing) {
            slots.push(existing);
            continue;
          }
          const { start: slotStart, end: slotEnd } = getSlotStartEnd(dateStr, startHour, durationHours, startMinute);
          const slotStartMs = slotStart.getTime();
          const slotEndMs = slotEnd.getTime();
          const overlapsTaken = takenRanges.some((r) => slotStartMs < r.end && slotEndMs > r.start);
          slots.push({
            id: slotId,
            dateStr,
            startAt: slotStart.toISOString(),
            endAt: slotEnd.toISOString(),
            status: overlapsTaken ? "blocked" : "open",
            holdId: null,
            bookingId: null,
            updatedAt: null,
            boatId: bid,
            experienceId,
          });
        }
      }
      // Include booked/held slots that are in range but not in the grid (e.g. past) so the admin calendar shows all bookings.
      const slotsKeySet = new Set(slots.map((s) => `${s.boatId}:${s.id}`));
      for (const row of Array.from(existingByBoatAndKey.values())) {
        if (row.status !== "booked" && row.status !== "held") continue;
        if (row.dateStr < startDate || row.dateStr > endDate) continue;
        const key = `${row.boatId}:${row.id}`;
        if (slotsKeySet.has(key)) continue;
        slots.push(row);
        slotsKeySet.add(key);
      }
      slots.sort((a, b) => a.dateStr.localeCompare(b.dateStr) || a.startAt.localeCompare(b.startAt));
      const heldHoldIds = Array.from(new Set(slots.filter((s) => s.status === "held" && s.holdId).map((s) => s.holdId!)));
      const holdIdsToRelease = new Set<string>(); // held slots whose hold is missing, inactive, or expired → show as open
      if (heldHoldIds.length > 0) {
        const holdSnap = await Promise.all(heldHoldIds.map((id) => db.collection("holds").doc(id).get()));
        const now = new Date();
        holdSnap.forEach((doc, i) => {
          const hid = heldHoldIds[i];
          if (!doc.exists) {
            holdIdsToRelease.add(hid);
            return;
          }
          const data = doc.data() as { status?: string; expiresAt?: { toDate(): Date } };
          if (data?.status !== "active") {
            holdIdsToRelease.add(hid);
            return;
          }
          const exp = data?.expiresAt?.toDate?.();
          if (exp && exp <= now) holdIdsToRelease.add(hid);
        });
        slots.forEach((s) => {
          if (s.status === "held" && s.holdId) {
            if (holdIdsToRelease.has(s.holdId)) {
              s.status = "open";
              (s as Record<string, unknown>).holdId = null;
            } else {
              const exp = holdSnap[heldHoldIds.indexOf(s.holdId)]?.data()?.expiresAt as { toDate(): Date } | undefined;
              if (exp) (s as Record<string, unknown>).expiresAt = exp.toDate().toISOString();
            }
          }
        });
      }

      const debugByDate = request.nextUrl.searchParams.get("debug") === "1" || request.nextUrl.searchParams.get("byDate") === "1"
        ? (() => {
            const byDate: Record<string, { open: number; held: number; booked: number; blocked: number }> = {};
            for (const s of slots) {
              const day = s.startAt.slice(0, 10);
              if (!byDate[day]) byDate[day] = { open: 0, held: 0, booked: 0, blocked: 0 };
              if (s.status === "open") byDate[day].open++;
              else if (s.status === "held") byDate[day].held++;
              else if (s.status === "booked") byDate[day].booked++;
              else byDate[day].blocked++;
            }
            return byDate;
          })()
        : undefined;
      return NextResponse.json(
        debugByDate != null ? { slots, byDate: debugByDate } : { slots },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    // Boats: legacy – use bookings as source of truth for "booked", slot docs for grid/held/blocked
    const legacyBookingsSnap = await db
      .collection("bookings")
      .where("boatId", "==", boatId)
      .where("status", "in", [...BOOKING_STATUSES_SLOT_TAKEN])
      .get();
    const legacyBookedSlotIds = new Set(
      legacyBookingsSnap.docs.map((d) => (d.data() as { slotId?: string }).slotId).filter(Boolean) as string[]
    );
    const slotsRef = db.collection("boats").doc(boatId!).collection("slots");
    const snap = await slotsRef
      .where("startAt", ">=", Timestamp.fromDate(start))
      .where("startAt", "<=", Timestamp.fromDate(end))
      .orderBy("startAt", "asc")
      .get();
    const slots = snap.docs.map((doc) => {
      const data = doc.data() as Slot;
      const startAt = data.startAt as { toDate(): Date };
      const endAt = data.endAt as { toDate(): Date };
      const updatedAt = data.updatedAt as { toDate(): Date } | undefined;
      const parsed = parseSlotId(doc.id);
      const fromBooking = legacyBookedSlotIds.has(doc.id);
      const status = fromBooking ? "booked" : data.status === "booked" ? "open" : data.status;
      return {
        id: doc.id,
        dateStr: parsed?.dateStr ?? doc.id.slice(0, 10),
        startAt: startAt.toDate().toISOString(),
        endAt: endAt.toDate().toISOString(),
        status,
        holdId: data.holdId,
        bookingId: data.bookingId,
        updatedAt: updatedAt?.toDate?.()?.toISOString?.() ?? null,
      };
    });
    return NextResponse.json(
      { slots },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[slots]", err);
    const isFirebase = /firebase|FIREBASE|config missing|credential|private.?key/i.test(message);
    return NextResponse.json(
      { error: "Failed to load slots", ...(isFirebase && { hint: SLOTS_FIREBASE_HINT }) },
      { status: isFirebase ? 503 : 500 }
    );
  }
}
