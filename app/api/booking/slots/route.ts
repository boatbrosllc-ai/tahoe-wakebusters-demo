import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { hasFirebaseConfig } from "@/lib/booking/env";
import {
  buildSlotId,
  getSlotGrid,
  getSlotGridForStartTimes,
  getSlotGridWakeBoard,
  getSlotGridWithSaturdayOnlyRestriction,
  getSlotStartEnd,
  getTicketedSlotGrid,
  parseSlotId,
} from "@/lib/booking/experience-slots";
import { getExperienceIdVariants, allowBoatTypeForSlug } from "@/lib/booking/experience-aliases";
import type { Slot } from "@/lib/booking/types";
import type { ExperienceRate } from "@/lib/booking/types";
import { BOOKING_STATUSES_SLOT_TAKEN, type BookingStatus } from "@/lib/booking/types";

export const dynamic = "force-dynamic";
/** Ask host for longer timeout so second-month requests don't time out (Netlify default 10s). */
export const maxDuration = 26;

// Set LEGACY_BOOKING_FALLBACK=1 only during / immediately after a startDateStr backfill migration.
// Once all historical bookings and holds carry startDateStr, leave this unset so the broad
// legacy scans are never executed and every request uses only the fast windowed index queries.
const LEGACY_FALLBACK_ENABLED = process.env.LEGACY_BOOKING_FALLBACK === "1";

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
    // Parse as UTC so range validation is identical in all server timezones (avoids production-only rejections).
    const start = new Date(startDate + "T12:00:00.000Z");
    const end = new Date(endDate + "T23:59:59.999Z");
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }
    const maxDays = 92;
    const daysMs = end.getTime() - start.getTime();
    if (daysMs > maxDays * 24 * 60 * 60 * 1000 || daysMs < 0) {
      return NextResponse.json({ error: `Date range must be between 1 and ${maxDays} days` }, { status: 400 });
    }
    let db: ReturnType<typeof getDb>;
    try {
      db = getDb();
    } catch (configErr) {
      const msg = configErr instanceof Error ? configErr.message : String(configErr);
      const isConfig = /Firebase config missing|FIREBASE_PRIVATE_KEY|Missing required env/i.test(msg);
      return NextResponse.json(
        {
          error: isConfig ? "Booking is not configured." : "Service temporarily unavailable.",
          hint: isConfig ? SLOTS_FIREBASE_HINT : undefined,
        },
        { status: 503 }
      );
    }
    const { Timestamp } = getFirestoreExports();

    if (experienceId) {
      // Experiences with listing boats: slots are per boat so one boat booked doesn't block others.
      // Optional boatId: return only that boat's slots. Otherwise return slots for all boats (each slot has boatId).
      const expRef = db.collection("experiences").doc(experienceId);
      const ratesSnapPromise = expRef.collection("rates").where("active", "==", true).get();
      const expDoc = await expRef.get();
      if (!expDoc.exists) {
        return NextResponse.json({ error: "Experience not found" }, { status: 404 });
      }
      const expData = expDoc.data() as { slug?: string } | undefined;
      const experienceSlug = typeof expData?.slug === "string" ? expData.slug.trim() : "";
      // Fallback: when Firestore slug is missing (e.g. prod), use experienceId so boat-type filter works (e.g. id "watersports" => wake only).
      const slugForBoatType = (experienceSlug || experienceId.trim()).toLowerCase();
      const experienceIdVariants = getExperienceIdVariants(experienceId, experienceSlug);
      const allowBoatType = allowBoatTypeForSlug(slugForBoatType);
      const boatSnapPromises = experienceIdVariants.map((variantId) =>
        db
          .collection("boats")
          .where("isListingBoat", "==", true)
          .where("active", "==", true)
          .where("experienceIds", "array-contains", variantId)
          .get()
      );
      const [ratesSnap, ...boatSnaps] = await Promise.all([ratesSnapPromise, ...boatSnapPromises]);
      const mergedBoatDocs: import("firebase-admin").firestore.QueryDocumentSnapshot[] = [];
      const seenBoatIds = new Set<string>();
      for (const snap of boatSnaps) {
        for (const doc of snap.docs) {
          if (!seenBoatIds.has(doc.id)) {
            seenBoatIds.add(doc.id);
            mergedBoatDocs.push(doc);
          }
        }
      }

      type ExpDataFull = {
        slug?: string;
        pricingType?: "charter" | "ticketed";
        maxCapacity?: number;
        departureHour?: number;
        departureMinute?: number;
        tripDurationHours?: number;
        showSpotsRemaining?: boolean;
        defaultRateId?: string;
      };
      const expDataFull = expData as ExpDataFull | undefined;

      if (expDataFull?.pricingType === "ticketed") {
        // --- Ticketed experience: one slot per date with capacity enrichment ---
        const tRatesSnap = ratesSnap;
        if (tRatesSnap.empty) {
          console.warn(`[slots] ticketed experience ${experienceId} has no active rates`);
          return NextResponse.json({ slots: [] });
        }
        let tDurationHours: number;
        // Prefer the explicit tripDurationHours on the experience doc; fall back to rate's durationHours.
        if (typeof expDataFull.tripDurationHours === "number" && expDataFull.tripDurationHours > 0) {
          tDurationHours = expDataFull.tripDurationHours;
        } else if (expDataFull.defaultRateId) {
          const defaultRate = tRatesSnap.docs.find((d) => d.id === expDataFull.defaultRateId);
          tDurationHours = defaultRate
            ? (defaultRate.data() as ExperienceRate).durationHours
            : (tRatesSnap.docs[0].data() as ExperienceRate).durationHours;
        } else {
          tDurationHours = (tRatesSnap.docs[0].data() as ExperienceRate).durationHours;
        }

        const tDepartureHour = expDataFull.departureHour ?? 10;
        const tDepartureMinute = expDataFull.departureMinute ?? 0;

        const ticketedGrid = getTicketedSlotGrid(start, end, tDurationHours, tDepartureHour, tDepartureMinute);

        // Load boats from variant-based fetch; filter by boatType so Watersports shows only wake boats, Pontoon only pontoon/tritoon.
        const tBoatIds: string[] = mergedBoatDocs
          .filter((d) => allowBoatType((d.data() as { boatType?: string }).boatType))
          .map((d) => d.id);

        // Relaxed slot-id parser (same logic as in the non-ticketed branch below)
        const parseSlotIdRelaxedT = (slotIdRaw: string): ReturnType<typeof parseSlotId> => {
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

        // Query bookings to build per-date capacity maps
        const spotsByDate = new Map<string, number>();
        const charterLockedDates = new Set<string>();
        const processBookingForCapacity = (doc: { id: string; data: () => Record<string, unknown> }) => {
          const b = doc.data() as { slotId?: string; slot_id?: string; partySize?: number; bookingMode?: string; status?: string };
          if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) return;
          const slotIdRaw = b.slotId ?? b.slot_id;
          if (!slotIdRaw) return;
          const parsed = parseSlotIdRelaxedT(slotIdRaw);
          if (!parsed) return;
          const { dateStr } = parsed;
          if (b.bookingMode === "charter") {
            charterLockedDates.add(dateStr);
          } else {
            spotsByDate.set(dateStr, (spotsByDate.get(dateStr) ?? 0) + (b.partySize ?? 0));
          }
        };

        // Build experience ID variants once so all queries run in parallel across all IDs.
        const tAllExpIds = getExperienceIdVariants(experienceId, experienceSlug);

        // Windowed query: parallel == queries per experience ID use the deployed (experienceId, startDateStr) index.
        // Note: `in` + range on a different field is rejected by Firestore, so we use per-ID parallel calls.
        const tSeenBookingIds = new Set<string>();
        let tWindowedIndexReady = true;
        try {
          const tWindowedBookingSnaps = await Promise.all(
            tAllExpIds.map(expId =>
              db.collection("bookings")
                .where("experienceId", "==", expId)
                .where("startDateStr", ">=", startDate)
                .where("startDateStr", "<=", endDate)
                .get()
            )
          );
          tWindowedBookingSnaps.forEach(snap =>
            snap.docs.forEach(doc => {
              if (tSeenBookingIds.has(doc.id)) return;
              tSeenBookingIds.add(doc.id);
              processBookingForCapacity(doc);
            })
          );
        } catch (tWindowedErr) {
          const twmsg = tWindowedErr instanceof Error ? tWindowedErr.message : String(tWindowedErr);
          if (/FAILED_PRECONDITION.*index/i.test(twmsg)) {
            tWindowedIndexReady = false;
            console.warn("[slots] ticketed windowed bookings index not ready yet, falling back to legacy query");
          } else {
            throw tWindowedErr;
          }
        }
        // Legacy fallback: only runs when the windowed index is absent or LEGACY_BOOKING_FALLBACK=1.
        // Unset LEGACY_BOOKING_FALLBACK once startDateStr is backfilled on all historical bookings
        // so this broad scan is never executed on normal requests.
        if (!tWindowedIndexReady || LEGACY_FALLBACK_ENABLED) {
          try {
            const tLegacyBookingSnaps = await Promise.all(
              tAllExpIds.map(expId =>
                db.collection("bookings")
                  .where("experienceId", "==", expId)
                  .where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN))
                  .limit(200) // tight ceiling; in-memory date filter discards out-of-window records
                  .get()
              )
            );
            tLegacyBookingSnaps.forEach(snap =>
              snap.docs.forEach(doc => {
                if (tSeenBookingIds.has(doc.id)) return;
                const d = doc.data() as { startDateStr?: string };
                // Skip docs already covered by the windowed query.
                if (tWindowedIndexReady && d.startDateStr) return;
                tSeenBookingIds.add(doc.id);
                processBookingForCapacity(doc);
              })
            );
          } catch (tLegacyErr) {
            const tlmsg = tLegacyErr instanceof Error ? tLegacyErr.message : String(tLegacyErr);
            if (/FAILED_PRECONDITION.*index/i.test(tlmsg)) {
              console.warn("[slots] ticketed legacy bookings index not ready yet, continuing without booking data");
            } else {
              throw tLegacyErr;
            }
          }
        }

        // Query active holds for this experience and fold non-charter holds into spotsByDate
        const tHoldsNow = Date.now();
        const processHoldForCapacity = (doc: { id: string; data: () => Record<string, unknown> }) => {
          const h = doc.data() as { slotId?: string; slot_id?: string; partySize?: number; bookingMode?: string; status?: string; expiresAt?: { toDate(): Date } };
          if (h.status !== "active") return;
          if (h.expiresAt && h.expiresAt.toDate().getTime() < tHoldsNow) return;
          const slotIdRaw = h.slotId ?? h.slot_id;
          if (!slotIdRaw) return;
          const parsed = parseSlotIdRelaxedT(slotIdRaw);
          if (!parsed) return;
          const { dateStr } = parsed;
          // Charter holds do not reduce shared ticket capacity
          if (h.bookingMode === "charter") return;
          spotsByDate.set(dateStr, (spotsByDate.get(dateStr) ?? 0) + (h.partySize ?? 0));
        };
        try {
          // Windowed holds query: parallel == queries per experience ID use the deployed (experienceId, startDateStr) index.
          const tHoldsWindowedSnaps = await Promise.all(
            tAllExpIds.map(expId =>
              db.collection("holds")
                .where("experienceId", "==", expId)
                .where("startDateStr", ">=", startDate)
                .where("startDateStr", "<=", endDate)
                .get()
            )
          );
          const tSeenHoldIds = new Set<string>();
          tHoldsWindowedSnaps.forEach(snap =>
            snap.docs.forEach(doc => {
              if (tSeenHoldIds.has(doc.id)) return;
              tSeenHoldIds.add(doc.id);
              processHoldForCapacity(doc);
            })
          );
          // Legacy holds fallback: only runs when LEGACY_BOOKING_FALLBACK=1.
          // Unset once startDateStr is backfilled on all historical holds.
          if (LEGACY_FALLBACK_ENABLED) {
            const tHoldsLegacySnaps = await Promise.all(
              tAllExpIds.map(expId =>
                db.collection("holds")
                  .where("experienceId", "==", expId)
                  .where("status", "==", "active")
                  .limit(200) // tight ceiling; in-memory expiry filter discards irrelevant holds
                  .get()
              )
            );
            tHoldsLegacySnaps.forEach(snap =>
              snap.docs.forEach(doc => {
                if (tSeenHoldIds.has(doc.id)) return;
                const d = doc.data() as { startDateStr?: string };
                if (d.startDateStr) return; // already covered by windowed query
                tSeenHoldIds.add(doc.id);
                processHoldForCapacity(doc);
              })
            );
          }
        } catch (tHoldsErr) {
          console.warn("[slots] ticketed holds query failed:", tHoldsErr instanceof Error ? tHoldsErr.message : tHoldsErr);
        }

        // Query blocks for this experience
        const tBlockRanges: { start: number; end: number }[] = [];
        try {
          const tBlocksSnap = await db
            .collection("blocks")
            .where("experienceId", "==", experienceId)
            .where("startAt", "<=", Timestamp.fromDate(end))
            .get();
          tBlocksSnap.docs.forEach((doc) => {
            const b = doc.data() as { startAt: { toDate(): Date }; endAt: { toDate(): Date } };
            const blockStart = b.startAt?.toDate?.()?.getTime();
            const blockEnd = b.endAt?.toDate?.()?.getTime();
            if (blockStart == null || blockEnd == null || blockEnd < start.getTime()) return;
            tBlockRanges.push({ start: blockStart, end: blockEnd });
          });
        } catch (tBlocksErr) {
          console.warn("[slots] ticketed blocks query failed:", tBlocksErr instanceof Error ? tBlocksErr.message : tBlocksErr);
        }

        // Build enriched slot rows
        type TicketedSlotRow = SlotRow & {
          maxCapacity: number | undefined;
          spotsBooked: number | undefined;
          spotsRemaining: number | undefined;
          isCharterLocked: boolean | undefined;
          showSpotsRemaining: boolean | undefined;
        };
        const tSlots: TicketedSlotRow[] = [];
        for (const { dateStr, startHour, startMinute, durationHours: dur } of ticketedGrid) {
          const slotId = buildSlotId(dateStr, startHour, dur, startMinute);
          const { start: slotStart, end: slotEnd } = getSlotStartEnd(dateStr, startHour, dur, startMinute);
          const slotStartMs = slotStart.getTime();
          const slotEndMs = slotEnd.getTime();
          const isBlocked = tBlockRanges.some((r) => slotStartMs < r.end && slotEndMs > r.start);
          const spotsBooked = spotsByDate.get(dateStr) ?? 0;
          const maxCapacity = expDataFull.maxCapacity ?? 0;
          const spotsRemaining = Math.max(0, maxCapacity - spotsBooked);
          const isCharterLocked = charterLockedDates.has(dateStr);
          const showSpotsRemaining = expDataFull.showSpotsRemaining ?? false;
          tSlots.push({
            id: slotId,
            dateStr,
            startAt: slotStart.toISOString(),
            endAt: slotEnd.toISOString(),
            status: isBlocked ? "blocked" : "open",
            holdId: null,
            bookingId: null,
            updatedAt: null,
            boatId: tBoatIds[0] ?? "",
            experienceId,
            maxCapacity,
            spotsBooked,
            spotsRemaining,
            isCharterLocked,
            showSpotsRemaining,
          });
        }
        tSlots.sort((a, b) => a.dateStr.localeCompare(b.dateStr) || a.startAt.localeCompare(b.startAt));
        return NextResponse.json({ slots: tSlots }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } });
      }
      // --- End ticketed branch ---

      const durations = ratesSnap.docs.map((d) => (d.data() as ExperienceRate).durationHours);
      const durationsUnique = Array.from(new Set(durations));
      const boatIdParam = request.nextUrl.searchParams.get("boatId");
      const boatDocDataById = new Map<string, { allowedStartTimes?: { hour: number; minute: number }[]; boatType?: string }>();
      mergedBoatDocs.forEach((d) => boatDocDataById.set(d.id, d.data() as { allowedStartTimes?: { hour: number; minute: number }[]; boatType?: string }));
      let boatIds: string[] = mergedBoatDocs
        .filter((d) => allowBoatType((d.data() as { boatType?: string }).boatType))
        .map((d) => d.id);
      const allExpIds = experienceIdVariants;
      if (boatIdParam) {
        if (!boatIds.includes(boatIdParam)) {
          return NextResponse.json({ error: "Boat not found or not assigned to this experience" }, { status: 404 });
        }
        boatIds = [boatIdParam];
      }
      // If no boats linked to this experience (e.g. boats use slug and experience has different id), still show booked slots by using boatIds from bookings.
      let bookingsFromFallback: { id: string; data: () => Record<string, unknown> }[] = [];
      if (boatIds.length === 0) {
        // Run parallel per-experience queries to discover boat IDs from existing bookings
        const fallbackSnaps = await Promise.all(
          allExpIds.map(expId =>
            db.collection("bookings")
              .where("experienceId", "==", expId)
              .where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN))
              .limit(500)
              .get()
          )
        );
        const seenFallbackIds = new Set<string>();
        const mergedDocs: { id: string; data: () => Record<string, unknown> }[] = [];
        fallbackSnaps.forEach(snap =>
          snap.docs.forEach(d => {
            if (!seenFallbackIds.has(d.id)) {
              seenFallbackIds.add(d.id);
              mergedDocs.push(d);
            }
          })
        );
        const fromBookings = new Set<string>();
        mergedDocs.forEach((d) => {
          const boatId = (d.data() as { boatId?: string }).boatId;
          if (typeof boatId === "string" && boatId.trim()) fromBookings.add(boatId.trim());
        });
        boatIds = Array.from(fromBookings);
        if (boatIds.length === 0) return NextResponse.json({ slots: [] });
        bookingsFromFallback = mergedDocs;
      }
      type SlotRow = { id: string; dateStr: string; startAt: string; endAt: string; status: string; holdId: string | null; bookingId: string | null; updatedAt: string | null; boatId: string; experienceId: string; maxCapacity?: number | undefined; spotsBooked?: number | undefined; spotsRemaining?: number | undefined; isCharterLocked?: boolean | undefined; showSpotsRemaining?: boolean | undefined };
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
        typeof s === "string" && BOOKING_STATUSES_SLOT_TAKEN.has(s as BookingStatus);
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
      const unresolvedBookingIds: string[] = [];
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
        const bidRaw = typeof b.boatId === "string" ? b.boatId.trim() || undefined : undefined;
        const bid = bidRaw && boatIds.includes(bidRaw) ? bidRaw : undefined;
        if (!bid) {
          unresolvedBookingIds.push(doc.id);
          console.warn("[slots] booking missing or unmatched boatId — skipped from boat-specific occupancy", {
            bookingId: doc.id,
            experienceId: b.experienceId ?? experienceId,
            slotId: slotIdNorm,
          });
          return;
        }
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
      };

      const allBookingDocs: { id: string; data: () => Record<string, unknown> }[] = [];
      const seenBookingIds = new Set<string>();

      const addBookingDoc = (doc: { id: string; data: () => Record<string, unknown> }) => {
        if (seenBookingIds.has(doc.id)) return;
        seenBookingIds.add(doc.id);
        allBookingDocs.push(doc);
      };

      // Windowed query uses the (experienceId, startDateStr) composite index — fast path for all requests.
      // Note: `in` + range on a different field is rejected by Firestore; per-ID parallel calls are used.
      let windowedIndexReady = true;
      try {
        const windowedSnaps = await Promise.all(
          allExpIds.map(expId =>
            db.collection("bookings")
              .where("experienceId", "==", expId)
              .where("startDateStr", ">=", startDate)
              .where("startDateStr", "<=", endDate)
              .get()
          )
        );
        windowedSnaps.forEach(snap =>
          snap.docs.forEach(doc => {
            if (!BOOKING_STATUSES_SLOT_TAKEN.has((doc.data() as { status?: BookingStatus }).status as BookingStatus)) return;
            addBookingDoc(doc);
          })
        );
      } catch (windowedErr) {
        const wmsg = windowedErr instanceof Error ? windowedErr.message : String(windowedErr);
        if (/FAILED_PRECONDITION.*index/i.test(wmsg)) {
          windowedIndexReady = false;
          console.warn("[slots] windowed bookings index not ready yet, falling back to legacy query");
        } else {
          throw windowedErr;
        }
      }
      // Legacy fallback: only runs when the windowed index is absent or LEGACY_BOOKING_FALLBACK=1.
      // Not started eagerly — avoids the parallel broad scan on every request.
      // Unset LEGACY_BOOKING_FALLBACK once startDateStr is backfilled on all historical bookings.
      if (!windowedIndexReady || LEGACY_FALLBACK_ENABLED) {
        try {
          const legacySnaps = await Promise.all(
            allExpIds.map(expId =>
              db.collection("bookings")
                .where("experienceId", "==", expId)
                .where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN))
                .limit(200) // tight ceiling; in-memory date filter discards out-of-window records
                .get()
            )
          );
          legacySnaps.forEach(snap =>
            snap.docs.forEach(doc => {
              if (seenBookingIds.has(doc.id)) return;
              const d = doc.data() as { startDateStr?: string };
              // Skip docs already covered by the windowed query.
              if (windowedIndexReady && d.startDateStr) return;
              addBookingDoc(doc);
            })
          );
        } catch (legacyErr) {
          const lmsg = legacyErr instanceof Error ? legacyErr.message : String(legacyErr);
          if (/FAILED_PRECONDITION.*index/i.test(lmsg)) {
            console.warn("[slots] legacy bookings index not ready yet, continuing without booking data");
          } else {
            throw legacyErr;
          }
        }
      }
      allBookingDocs.forEach((doc) => mergeBookingSlot(doc));
      // When we had 0 boats we loaded bookings by experience (doc id or slug); merge those too so deposit/final_due bookings always show.
      bookingsFromFallback.forEach((doc) => mergeBookingSlot(doc));

      if (unresolvedBookingIds.length > 0) {
        const uniqueUnresolved = Array.from(new Set(unresolvedBookingIds));
        console.warn("[slots] unresolved_booking_no_boat_id telemetry", {
          count: uniqueUnresolved.length,
          bookingIds: uniqueUnresolved.slice(0, 100),
          experienceId,
        });
      }

      /** Map (boatId:normalizedSlotId) -> booking doc id so slot docs can resolve correct bookingId when they store a different id (e.g. Stripe). */
      const bookingIdByBoatAndSlot = new Map<string, string>();
      allBookingDocs.forEach((doc) => {
        const b = doc.data() as { boatId?: string; slotId?: string; slot_id?: string };
        const slotIdRaw = normalizeSlotId(b.slotId ?? b.slot_id);
        if (!slotIdRaw) return;
        const parsed = parseSlotIdRelaxed(slotIdRaw);
        if (!parsed) return;
        const slotIdNorm = buildSlotId(parsed.dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute ?? 0);
        const bidRaw = typeof b.boatId === "string" ? b.boatId.trim() || undefined : undefined;
        const bid = bidRaw && boatIds.includes(bidRaw) ? bidRaw : undefined;
        if (bid) bookingIdByBoatAndSlot.set(`${bid}:${slotIdNorm}`, doc.id);
      });

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

      // Start blocks query in parallel with slot docs — it only needs experienceId and end date.
      const blocksSnapPromise = db
        .collection("blocks")
        .where("experienceId", "==", experienceId)
        .where("startAt", "<=", Timestamp.fromDate(end))
        .get()
        .catch((blocksErr: unknown) => {
          console.warn("[slots] blocks query failed (index may be building):", blocksErr instanceof Error ? blocksErr.message : blocksErr);
          return null;
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
            const startAtDate = toDateSafe(data.startAt);
            const endAtDate = toDateSafe(data.endAt);
            if (!startAtDate || !endAtDate) return; // skip malformed slot doc
            const updatedAt = data.updatedAt as { toDate?: () => Date } | undefined;
            const updatedAtIso = updatedAt?.toDate?.()?.toISOString?.() ?? null;
            // "booked" on slot docs is not trusted: only bookings collection is source of truth. Stale slot docs show as open.
            const status = data.status === "booked" ? "open" : data.status;
            // Resolve bookingId from bookings collection so admin calendar detail fetch works (slot doc may store non-doc id).
            const parsedSlot = parseSlotIdRelaxed(doc.id);
            const slotIdNorm = parsedSlot ? buildSlotId(parsedSlot.dateStr, parsedSlot.startHour, parsedSlot.durationHours, parsedSlot.startMinute ?? 0) : doc.id;
            const resolvedBookingId = bookingIdByBoatAndSlot.get(`${bid}:${slotIdNorm}`) ?? data.bookingId;
            existingByBoatAndKey.set(key, {
              id: doc.id,
              dateStr: dateStrFromSlotId(doc.id),
              startAt: startAtDate.toISOString(),
              endAt: endAtDate.toISOString(),
              status,
              holdId: data.holdId,
              bookingId: resolvedBookingId,
              updatedAt: updatedAtIso,
              boatId: bid,
              experienceId,
            });
          });
        })
      );

      // Per-boat grid: wake boats use Saturday-only expanded times (9, 9:30, 10, 10:30, 3pm, 3:30pm, 4pm) on Saturday and allowedStartTimes (or hourly) on weekdays. Other boats with allowedStartTimes use those every day.
      const gridByBoatId = new Map<string, import("@/lib/booking/experience-slots").SlotGridItem[]>();
      for (let i = 0; i < boatIds.length; i++) {
        const bid = boatIds[i];
        // Reuse already-fetched boat data; only fetch fresh if boat was discovered via the fallback booking scan
        let boatData = boatDocDataById.get(bid) as { allowedStartTimes?: { hour: number; minute: number }[]; boatType?: string } | undefined;
        if (!boatData) {
          const freshDoc = await db.collection("boats").doc(bid).get();
          boatData = freshDoc.data() as { allowedStartTimes?: { hour: number; minute: number }[]; boatType?: string } | undefined;
          if (boatData) boatDocDataById.set(bid, boatData);
        }
        const allowedEveryDay = boatData?.allowedStartTimes;
        const isWakeBoat = boatData?.boatType === "wake";
        let grid: import("@/lib/booking/experience-slots").SlotGridItem[];
        if (durationsUnique.length === 0) {
          grid = [];
        } else if (isWakeBoat) {
          grid = getSlotGridWakeBoard(start, end, durationsUnique, allowedEveryDay ?? undefined);
        } else if (allowedEveryDay?.length) {
          grid = getSlotGridForStartTimes(start, end, durationsUnique, allowedEveryDay);
        } else {
          grid = getSlotGrid(start, end, durationsUnique);
        }
        gridByBoatId.set(bid, grid);
      }
      const blockRangesByBoat = new Map<string, { start: number; end: number }[]>();
      const blocksSnap = await blocksSnapPromise; // already running since before slot docs
      if (blocksSnap) {
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
        const holdRefs = heldHoldIds.map((id) => db.collection("holds").doc(id));
        const holdSnap = await db.getAll(...holdRefs);
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
      const responseHeaders: Record<string, string> = { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" };
      if (unresolvedBookingIds.length > 0) {
        responseHeaders["X-Unresolved-Booking-Count"] = String(Array.from(new Set(unresolvedBookingIds)).length);
      }
      return NextResponse.json(
        debugByDate != null ? { slots, byDate: debugByDate } : { slots },
        { headers: responseHeaders }
      );
    }

    // Boats: legacy – use bookings as source of truth for "booked", slot docs for grid/held/blocked
    const legacyBookingsSnap = await db
      .collection("bookings")
      .where("boatId", "==", boatId)
      .where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN))
      .get();
    const legacyBookedSlotIdToBookingId = new Map<string, string>();
    legacyBookingsSnap.docs.forEach((d) => {
      const slotId = (d.data() as { slotId?: string }).slotId;
      if (slotId) legacyBookedSlotIdToBookingId.set(slotId, d.id);
    });
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
      const fromBooking = legacyBookedSlotIdToBookingId.has(doc.id);
      const status = fromBooking ? "booked" : data.status === "booked" ? "open" : data.status;
      const resolvedBookingId = fromBooking ? legacyBookedSlotIdToBookingId.get(doc.id) : data.bookingId;
      return {
        id: doc.id,
        dateStr: parsed?.dateStr ?? doc.id.slice(0, 10),
        startAt: startAt.toDate().toISOString(),
        endAt: endAt.toDate().toISOString(),
        status,
        holdId: data.holdId,
        bookingId: resolvedBookingId ?? data.bookingId,
        updatedAt: updatedAt?.toDate?.()?.toISOString?.() ?? null,
      };
    });
    return NextResponse.json(
      { slots },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const startDate = request.nextUrl.searchParams.get("startDate");
    const endDate = request.nextUrl.searchParams.get("endDate");
    console.error("[slots] error", { startDate, endDate, message });
    console.error("[slots]", err);
    const isFirebase = /firebase|FIREBASE|config missing|credential|private.?key/i.test(message);
    return NextResponse.json(
      { error: "Failed to load slots", ...(isFirebase && { hint: SLOTS_FIREBASE_HINT }) },
      { status: isFirebase ? 503 : 500 }
    );
  }
}
