import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import {
  buildSlotId,
  getSlotGrid,
  getSlotStartEnd,
  parseSlotId,
} from "@/lib/booking/experience-slots";
import type { Slot } from "@/lib/booking/types";
import type { ExperienceRate } from "@/lib/booking/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
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
      const ratesSnap = await expRef.collection("rates").where("active", "==", true).get();
      const durations = ratesSnap.docs.map((d) => (d.data() as ExperienceRate).durationHours);
      const durationsUnique = Array.from(new Set(durations));
      if (durationsUnique.length === 0) {
        return NextResponse.json({ slots: [] });
      }
      const boatIdParam = request.nextUrl.searchParams.get("boatId");
      let boatIds: string[] = [];
      const boatsSnap = await db
        .collection("boats")
        .where("isListingBoat", "==", true)
        .where("active", "==", true)
        .where("experienceIds", "array-contains", experienceId)
        .get();
      boatIds = boatsSnap.docs.map((d) => d.id);
      if (boatIdParam) {
        if (!boatIds.includes(boatIdParam)) {
          return NextResponse.json({ error: "Boat not found or not assigned to this experience" }, { status: 404 });
        }
        boatIds = [boatIdParam];
      }
      if (boatIds.length === 0) {
        return NextResponse.json({ slots: [] });
      }
      type SlotRow = { id: string; dateStr: string; startAt: string; endAt: string; status: string; holdId: string | null; bookingId: string | null; updatedAt: string | null; boatId: string };
      const existingByBoatAndKey = new Map<string, SlotRow>();

      /** Calendar date YYYY-MM-DD from slot id — use for grouping so bookings show on the correct day regardless of server timezone. */
      const dateStrFromSlotId = (slotId: string): string => {
        const parsed = parseSlotIdRelaxed(slotId);
        return parsed?.dateStr ?? slotId.slice(0, 10);
      };

      // 1) Bookings are the only source of truth for "booked" (Book Now calendar uses real backend data only).
      // Merge FIRST so we never overwrite with stale slot docs.
      // Only these statuses mean the slot is taken; canceled/refunded are ignored.
      const SLOT_TAKEN_STATUSES = ["paid", "deposit_paid", "final_due", "final_paid", "final_processing"] as const;
      const isSlotTakenStatus = (s: unknown): boolean =>
        typeof s === "string" && (SLOT_TAKEN_STATUSES as readonly string[]).includes(s);
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
        const { start: slotStart, end: slotEnd } = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours);
        const slotIdNorm = buildSlotId(parsed.dateStr, parsed.startHour, parsed.durationHours);
        // Only mark the specific boat that has the booking. Never mark all boats (would falsely show every boat as booked).
        const bid = typeof b.boatId === "string" ? b.boatId.trim() || undefined : undefined;
        if (bid && boatIds.includes(bid)) {
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
          });
        }
      };

      const bookingsSnap = await db
        .collection("bookings")
        .where("status", "in", [...SLOT_TAKEN_STATUSES])
        .get();
      bookingsSnap.docs.forEach((doc) => {
        const b = doc.data() as { experienceId?: string; boatId?: string };
        const matchesExperience = b.experienceId === experienceId;
        const matchesBoat = typeof b.boatId === "string" && boatIds.includes(b.boatId);
        if (matchesExperience || matchesBoat) mergeBookingSlot(doc);
      });

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
            const startAt = (data.startAt as { toDate(): Date }).toDate();
            const endAt = (data.endAt as { toDate(): Date }).toDate();
            const updatedAt = data.updatedAt as { toDate(): Date } | undefined;
            // "booked" on slot docs is not trusted: only bookings collection is source of truth. Stale slot docs show as open.
            const status = data.status === "booked" ? "open" : data.status;
            existingByBoatAndKey.set(key, {
              id: doc.id,
              dateStr: dateStrFromSlotId(doc.id),
              startAt: startAt.toISOString(),
              endAt: endAt.toISOString(),
              status,
              holdId: data.holdId,
              bookingId: data.bookingId,
              updatedAt: updatedAt?.toDate?.()?.toISOString?.() ?? null,
              boatId: bid,
            });
          });
        })
      );

      const grid = getSlotGrid(start, end, durationsUnique);
      const slots: SlotRow[] = [];
      for (const bid of boatIds) {
        const takenRanges = Array.from(existingByBoatAndKey.values())
          .filter((s) => s.boatId === bid && s.status !== "open")
          .map((s) => ({ start: new Date(s.startAt).getTime(), end: new Date(s.endAt).getTime() }));
        for (const { dateStr, startHour, durationHours } of grid) {
          const slotId = buildSlotId(dateStr, startHour, durationHours);
          const key = `${bid}:${slotId}`;
          const existing = existingByBoatAndKey.get(key);
          if (existing) {
            slots.push(existing);
            continue;
          }
          const { start: slotStart, end: slotEnd } = getSlotStartEnd(dateStr, startHour, durationHours);
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
    const LEGACY_SLOT_TAKEN = ["paid", "deposit_paid", "final_due", "final_paid", "final_processing"];
    const legacyBookingsSnap = await db
      .collection("bookings")
      .where("boatId", "==", boatId)
      .where("status", "in", LEGACY_SLOT_TAKEN)
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
    console.error("[slots]", err);
    return NextResponse.json({ error: "Failed to load slots" }, { status: 500 });
  }
}
