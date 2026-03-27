import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { safeHasFirebaseConfig, getFirebaseConfigStatus } from "@/lib/booking/env";
import { checkRateLimitPublicRead, getClientKey } from "@/lib/booking/rate-limit";
import {
  buildSlotId,
  getSlotGrid,
  getSlotGridForStartTimes,
  getSlotGridWakeBoard,
  getSlotGridWithSaturdayOnlyRestriction,
  getSlotStartEnd,
  getTicketedSlotGrid,
  getSlotsApiRequestWindow,
  parseSlotIdRelaxed,
  toDateStrOnly,
  isSeasonalAllowed,
  OPERATING_END_HOUR,
  shouldUseWakeBoardCharterGrid,
} from "@/lib/booking/experience-slots";
import { getExperienceIdVariants, allowBoatTypeForSlug, inferSlugFromTitle, getSlugForBoatTypeFilter, isWatersportsSlug, inferSlugFromAssignedBoats, resolveExperiencePricingType } from "@/lib/booking/experience-aliases";
import {
  operationalAlertDedupeDocId,
  writeOperationalAlertIfNewDocId,
} from "@/lib/booking/operational-alerts";
import { getTicketedDepartureAndDuration } from "@/lib/booking/ticketed-slot-utils";
import { getMaxGuestsForExperience } from "@/lib/booking/experience-capacity";
import type { Slot } from "@/lib/booking/types";
import type { ExperienceRate } from "@/lib/booking/types";
import { BOOKING_STATUSES_SLOT_TAKEN, type BookingStatus } from "@/lib/booking/types";
import {
  conservativeOpenSlotStatus,
  getLegacyBookingScanLimit,
} from "@/lib/booking/legacy-booking-scan-limit";
import { disableBoatSupplementScanEffective } from "@/lib/booking/booking-runtime-state";
import {
  addCalendarDaysToDateStr,
  bookingIntervalMsFromSlotFields,
  bookingLookbackDaysFromMaxDuration,
  intervalOverlapsRequestWindow,
} from "@/lib/booking/booking-interval";
import {
  DEFAULT_LEGACY_HOLDS_PAGE_SIZE,
  scanLegacyActiveHoldsForExperience,
  scanLegacyHoldsExpiresAtLowerBound,
} from "@/lib/booking/legacy-hold-scan";

export const dynamic = "force-dynamic";
/** Ask host for longer timeout so second-month requests don't time out (Netlify default 10s). */
export const maxDuration = 26;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
} as const;

// Legacy booking/hold merges use the same cap as create-hold / slot-availability (LEGACY_BOOKING_SCAN_LIMIT).
// Set DISABLE_LEGACY_BOOKING_FALLBACK=true once startDateStr backfill is complete on bookings and holds.

const SLOTS_FIREBASE_HINT =
  "Slots require Firebase. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY (or FIREBASE_SERVICE_ACCOUNT_JSON_PATH) in your deployment environment.";

/** Dedupe key for operationalAlerts from this route (stable per alert type + scope + UTC calendar day). */
function slotsAlertDocId(alertType: string, scopeKey: string, utcDay: string): string {
  return operationalAlertDedupeDocId([alertType, scopeKey, utcDay]);
}

function blockOverlapsWindowMs(
  blockStartMs: number,
  blockEndMs: number,
  windowStartMs: number,
  windowEndMs: number,
): boolean {
  return blockStartMs <= windowEndMs && blockEndMs >= windowStartMs;
}

/**
 * Loads block docs overlapping [start, end]. Uses composite queries by both experienceId and
 * experienceSlug when indexed; if that fails
 * with a missing-index error, falls back to experienceId-only queries and filters in memory so we
 * still apply blocks without marking the response partial (calendar often looked correct before).
 */
async function fetchBlocksDocsOverlappingWindow(
  db: ReturnType<typeof getDb>,
  start: Date,
  end: Date,
  expIds: string[],
): Promise<{ docs: import("firebase-admin/firestore").QueryDocumentSnapshot[]; incomplete: boolean }> {
  const { Timestamp } = getFirestoreExports();
  const windowStartMs = start.getTime();
  const windowEndMs = end.getTime();

  try {
    const snaps = await Promise.all([
      ...expIds.map((expId) =>
        db
          .collection("blocks")
          .where("experienceId", "==", expId)
          .where("startAt", "<=", Timestamp.fromDate(end))
          .where("endAt", ">=", Timestamp.fromDate(start))
          .get()
      ),
      ...expIds.map((expId) =>
        db
          .collection("blocks")
          .where("experienceSlug", "==", expId)
          .where("startAt", "<=", Timestamp.fromDate(end))
          .where("endAt", ">=", Timestamp.fromDate(start))
          .get()
      ),
    ]);
    const merged: import("firebase-admin/firestore").QueryDocumentSnapshot[] = [];
    const seen = new Set<string>();
    snaps.forEach((snap) => {
      snap.docs.forEach((doc) => {
        if (seen.has(doc.id)) return;
        seen.add(doc.id);
        merged.push(doc);
      });
    });
    return { docs: merged, incomplete: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/FAILED_PRECONDITION.*index/i.test(msg)) throw err;
    console.warn("[slots] blocks composite query failed (index); using experienceId-only fallback:", msg);
    const merged: import("firebase-admin/firestore").QueryDocumentSnapshot[] = [];
    const seen = new Set<string>();
    let anyFallbackFailed = false;
    for (const expId of expIds) {
      try {
        const snap = await db.collection("blocks").where("experienceId", "==", expId).get();
        snap.docs.forEach((doc) => {
          const b = doc.data() as { startAt?: { toDate?: () => Date }; endAt?: { toDate?: () => Date } };
          const bs = b.startAt?.toDate?.()?.getTime();
          const be = b.endAt?.toDate?.()?.getTime();
          if (bs == null || be == null) return;
          if (!blockOverlapsWindowMs(bs, be, windowStartMs, windowEndMs)) return;
          if (seen.has(doc.id)) return;
          seen.add(doc.id);
          merged.push(doc);
        });
      } catch (fallbackErr) {
        anyFallbackFailed = true;
        console.warn(
          "[slots] blocks fallback query failed:",
          fallbackErr instanceof Error ? fallbackErr.message : fallbackErr,
        );
      }
    }
    if (anyFallbackFailed) {
      return { docs: [], incomplete: true };
    }
    return { docs: merged, incomplete: false };
  }
}

/** Merge holds missing `startDateStr` into ticketed capacity (same rules as expiresAt-bounded legacy scan). */
function mergeTicketedLegacyHoldDocsIntoSpots(
  docs: import("firebase-admin/firestore").QueryDocumentSnapshot[],
  tSeenHoldIds: Set<string>,
  startDate: string,
  endDate: string,
  requestWindowStart: Date,
  requestWindowEnd: Date,
  processHoldForCapacity: (doc: { id: string; data: () => Record<string, unknown> }) => void,
): void {
  for (const doc of docs) {
    if (tSeenHoldIds.has(doc.id)) continue;
    const d = doc.data() as { startDateStr?: string; slotId?: string; slot_id?: string };
    if (d.startDateStr) continue;
    const ivH = bookingIntervalMsFromSlotFields(d.slotId, d.slot_id);
    if (!ivH || !intervalOverlapsRequestWindow(ivH.startMs, ivH.endMs, requestWindowStart, requestWindowEnd)) continue;
    tSeenHoldIds.add(doc.id);
    processHoldForCapacity(doc);
  }
}

/** Firestore batchGet is safest in chunks for large hold sets (avoids rare RPC limits). */
async function getHoldSnapshotsOrdered(
  db: ReturnType<typeof getDb>,
  holdIds: string[],
): Promise<import("firebase-admin/firestore").DocumentSnapshot[]> {
  if (holdIds.length === 0) return [];
  const CHUNK = 30;
  const combined: import("firebase-admin/firestore").DocumentSnapshot[] = [];
  for (let i = 0; i < holdIds.length; i += CHUNK) {
    const slice = holdIds.slice(i, i + CHUNK);
    const refs = slice.map((id) => db.collection("holds").doc(id));
    const snaps = await db.getAll(...refs);
    combined.push(...snaps);
  }
  return combined;
}

/**
 * GET is read-only on the normal path (happy calendar load): no Firestore writes to operationalAlerts,
 * no staff email, no slot/hold mutations. Partial or degraded modes (e.g. blocks index missing, holds
 * query failed) may call {@link writeOperationalAlertIfNewDocId} at most once per alert type per scope
 * per UTC day (content-addressed doc id). Staff email for missing booking boatId is handled by cron
 * POST /api/admin/cron/alert-missing-booking-boat-ids instead of this handler.
 */
export async function GET(request: NextRequest) {
  try {
    const generatedAtIso = new Date().toISOString();
    const alertUtcDay = generatedAtIso.slice(0, 10);
    if (
      process.env.BOOKING_WATERSPORTS_ALLOW_UNTYPED_BOAT === "true" &&
      process.env.NEXT_PUBLIC_BOOKING_WATERSPORTS_ALLOW_UNTYPED_BOAT !== "true"
    ) {
      console.warn(
        "[slots] BOOKING_WATERSPORTS_ALLOW_UNTYPED_BOAT is set without NEXT_PUBLIC_BOOKING_WATERSPORTS_ALLOW_UNTYPED_BOAT; client/server wake filtering can diverge"
      );
    }
    const rl = await checkRateLimitPublicRead(getClientKey(request));
    if (!rl.allowed) {
      const retryAfter = rl.retryAfterMs ? Math.ceil(rl.retryAfterMs / 1000) : 60;
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }
    if (!safeHasFirebaseConfig()) {
      const detail = (() => {
        try {
          return getFirebaseConfigStatus();
        } catch {
          return { summary: SLOTS_FIREBASE_HINT };
        }
      })();
      return NextResponse.json(
        { error: "Booking is not configured.", hint: SLOTS_FIREBASE_HINT, firebaseDetail: detail },
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
    // Range validation uses UTC noon anchors (stable calendar day vs America/Chicago). Request-window bounds for
    // bookings/holds/blocks overlap and slot queries are computed per-branch via getSlotsApiRequestWindow.
    const rangeStartAnchor = new Date(startDate + "T12:00:00.000Z");
    const rangeEndAnchor = new Date(endDate + "T12:00:00.000Z");
    if (Number.isNaN(rangeStartAnchor.getTime()) || Number.isNaN(rangeEndAnchor.getTime())) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }
    const maxDays = 92;
    const daysMs = rangeEndAnchor.getTime() - rangeStartAnchor.getTime();
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
      const expData = expDoc.data() as { slug?: string; title?: string; name?: string } | undefined;
      const experienceSlug = (typeof expData?.slug === "string" ? expData.slug.trim() : "").toLowerCase();
      const inferredSlugFromTitle = inferSlugFromTitle(expData?.title ?? expData?.name);
      const effectiveSlug = experienceSlug || inferredSlugFromTitle;
      const slugForBoatType = getSlugForBoatTypeFilter(experienceSlug, inferredSlugFromTitle, experienceId ?? "", expData?.title ?? expData?.name).toLowerCase();
      // Transitional compatibility shim while legacy slug-based experienceId rows are backfilled.
      const experienceIdVariants = getExperienceIdVariants(experienceId, effectiveSlug);
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
      // When slug/title don't identify the listing, infer from assigned boats so we never show pontoon on wake listing.
      const slugEffective = inferSlugFromAssignedBoats(slugForBoatType, mergedBoatDocs);
      const allowBoatType = allowBoatTypeForSlug(slugEffective);

      type ExpDataFull = {
        slug?: string;
        pricingType?: "charter" | "ticketed";
        maxCapacity?: number;
        departureHour?: number;
        departureMinute?: number;
        tripDurationHours?: number;
        showSpotsRemaining?: boolean;
        defaultRateId?: string;
        seasonal?: { enabled?: boolean; startMonth?: number; endMonth?: number; startDate?: string; endDate?: string };
      };
      const expDataFull = expData as ExpDataFull | undefined;
      const nonPontoonBoatIds = mergedBoatDocs
        .filter((d) => !["pontoon", "tritoon"].includes(((d.data() as { boatType?: string }).boatType ?? "").toLowerCase().trim()))
        .map((d) => d.id);
      const useTicketedBranch =
        resolveExperiencePricingType({
          pricingType: expDataFull?.pricingType,
          slug: effectiveSlug,
          title: expData?.title,
          name: expData?.name,
        }) === "ticketed";

      if (useTicketedBranch && ratesSnap.empty) {
        console.warn(`[slots] ticketed experience ${experienceId} has no active rates`);
        return NextResponse.json({ slots: [] });
      }

      const expForTicketed = {
        ...expDataFull,
        id: experienceId,
        slug: expDataFull?.slug,
        title: expData?.title ?? expData?.name,
        name: expData?.name,
      };
      let maxDurationHoursForWindow = 1;
      let tDepartureHour = 0;
      let tDepartureMinute = 0;
      let tDurationHours = 1;
      if (useTicketedBranch) {
        const td = getTicketedDepartureAndDuration(expForTicketed, ratesSnap.docs);
        tDepartureHour = td.deptHour;
        tDepartureMinute = td.deptMinute;
        tDurationHours = td.tripDuration;
        maxDurationHoursForWindow = Math.max(1, td.tripDuration);
      } else {
        const durs = ratesSnap.docs
          .map((d) => (d.data() as ExperienceRate).durationHours)
          .filter((h): h is number => Number.isFinite(h) && h > 0);
        const uniq = Array.from(new Set(durs));
        maxDurationHoursForWindow = uniq.length ? Math.max(...uniq) : 1;
      }
      const { windowStart: winStart, windowEnd: winEnd } = getSlotsApiRequestWindow(
        startDate,
        endDate,
        maxDurationHoursForWindow,
      );
      const gridStart = new Date(startDate + "T12:00:00.000Z");
      const gridEnd = new Date(endDate + "T12:00:00.000Z");

      if (useTicketedBranch) {
        // --- Ticketed experience: one slot per date with capacity enrichment ---
        const tRatesSnap = ratesSnap;

        const ticketedGrid = getTicketedSlotGrid(gridStart, gridEnd, tDurationHours, tDepartureHour, tDepartureMinute);
        const ticketedStartDateStrLower = addCalendarDaysToDateStr(
          startDate,
          -bookingLookbackDaysFromMaxDuration(tDurationHours),
        );

        const spotsByDate = new Map<string, number>();
        const charterLockedDates = new Set<string>();

        // Load boats from variant-based fetch; filter by boatType so Watersports shows only wake boats, Pontoon only pontoon/tritoon.
        let tBoatIds: string[] = mergedBoatDocs
          .filter((d) => allowBoatType((d.data() as { boatType?: string }).boatType))
          .map((d) => d.id);
        if (isWatersportsSlug(slugEffective)) {
          tBoatIds = tBoatIds.filter((id) => {
            const doc = mergedBoatDocs.find((d) => d.id === id);
            return shouldUseWakeBoardCharterGrid((doc?.data() as { boatType?: string })?.boatType, true);
          });
          // If legacy boatType metadata is missing, strict wake-only filtering can hide every slot.
          // Fall back to all non-pontoon assigned listing boats so watersports times still appear.
          if (tBoatIds.length === 0 && nonPontoonBoatIds.length > 0) {
            console.warn("[slots] watersports ticketed boatType filter returned zero boats; using non-pontoon fallback", {
              experienceId,
            });
            tBoatIds = [...nonPontoonBoatIds];
          }
        }

        // Relaxed slot-id parser (shared from experience-slots)
        const processBookingForCapacity = (doc: { id: string; data: () => Record<string, unknown> }) => {
          const b = doc.data() as { slotId?: string; slot_id?: string; partySize?: number; bookingMode?: string; status?: string };
          if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) return;
          const slotIdRaw = b.slotId ?? b.slot_id;
          if (!slotIdRaw) return;
          const parsed = parseSlotIdRelaxed(slotIdRaw);
          if (!parsed) return;
          const { dateStr } = parsed;
          if (dateStr < startDate || dateStr > endDate) return;
          if (b.bookingMode === "charter") {
            charterLockedDates.add(dateStr);
          } else {
            spotsByDate.set(dateStr, (spotsByDate.get(dateStr) ?? 0) + (b.partySize ?? 0));
          }
        };

        // Build experience ID variants once so all queries run in parallel across all IDs.
        // Use effectiveSlug (incl. inferred from title) so sunset/holiday match when Firestore slug is missing.
        // Transitional compatibility shim while legacy slug-based experienceId rows are backfilled.
        const tAllExpIds = getExperienceIdVariants(experienceId, effectiveSlug);
        const LEGACY_BOOKING_SCAN_LIMIT = getLegacyBookingScanLimit();

        // Windowed query: parallel == queries per experience ID use the deployed (experienceId, startDateStr) index.
        // Note: `in` + range on a different field is rejected by Firestore, so we use per-ID parallel calls.
        const tSeenBookingIds = new Set<string>();
        let tWindowedIndexReady = true;
        let legacyQueryHitLimit = false;
        let legacyHoldsScanCapHit = false;
        let holdsQueryFailed = false;
        try {
          const tWindowedBookingSnaps = await Promise.all(
            tAllExpIds.map(expId =>
              db.collection("bookings")
                .where("experienceId", "==", expId)
                .where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN))
                .where("startDateStr", ">=", ticketedStartDateStrLower)
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
        // When the windowed index is absent, substitute with a range query on startDateStr (same as before).
        if (!tWindowedIndexReady) {
          try {
            const tLegacyBookingSnaps = await Promise.all(
              tAllExpIds.map(expId =>
                db.collection("bookings")
                  .where("experienceId", "==", expId)
                  .where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN))
                  .where("startDateStr", ">=", ticketedStartDateStrLower)
                  .where("startDateStr", "<=", endDate)
                  .limit(LEGACY_BOOKING_SCAN_LIMIT)
                  .get()
              )
            );
            tLegacyBookingSnaps.forEach((snap, idx) => {
              if (snap.size >= LEGACY_BOOKING_SCAN_LIMIT) {
                legacyQueryHitLimit = true;
                console.warn("[slots] legacy query hit limit, some bookings may be hidden", { experienceId, variant: tAllExpIds[idx], count: snap.size });
              }
              snap.docs.forEach(doc => {
                if (tSeenBookingIds.has(doc.id)) return;
                const d = doc.data() as { startDateStr?: string };
                if (tWindowedIndexReady && d.startDateStr) return;
                tSeenBookingIds.add(doc.id);
                processBookingForCapacity(doc);
              });
            });
          } catch (tLegacyErr) {
            const tlmsg = tLegacyErr instanceof Error ? tLegacyErr.message : String(tLegacyErr);
            if (/FAILED_PRECONDITION.*index/i.test(tlmsg)) {
              console.warn("[slots] ticketed legacy bookings index not ready yet, continuing without booking data");
            } else {
              throw tLegacyErr;
            }
          }
        }
        // Align with create-hold: merge bookings missing startDateStr (legacy) whenever fallback is enabled.
        if (!tWindowedIndexReady && process.env.DISABLE_LEGACY_BOOKING_FALLBACK !== "true") {
          try {
            const tLegacyNoStartSnaps = await Promise.all(
              tAllExpIds.map((expId) =>
                db
                  .collection("bookings")
                  .where("experienceId", "==", expId)
                  .where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN))
                  .limit(LEGACY_BOOKING_SCAN_LIMIT)
                  .get()
              )
            );
            if (tLegacyNoStartSnaps.some((s) => s.docs.length >= LEGACY_BOOKING_SCAN_LIMIT)) {
              legacyQueryHitLimit = true;
            }
            for (const snap of tLegacyNoStartSnaps) {
              for (const doc of snap.docs) {
                if (tSeenBookingIds.has(doc.id)) continue;
                const d = doc.data() as { startDateStr?: string; slotId?: string; slot_id?: string };
                if (d.startDateStr) continue;
                const ivLegacyT = bookingIntervalMsFromSlotFields(d.slotId, d.slot_id);
                if (!ivLegacyT || !intervalOverlapsRequestWindow(ivLegacyT.startMs, ivLegacyT.endMs, winStart, winEnd)) continue;
                tSeenBookingIds.add(doc.id);
                processBookingForCapacity(doc);
              }
            }
          } catch (tLegacyNoStartErr) {
            const msg = tLegacyNoStartErr instanceof Error ? tLegacyNoStartErr.message : String(tLegacyNoStartErr);
            if (/FAILED_PRECONDITION.*index/i.test(msg)) {
              console.warn("[slots] ticketed legacy no-startDateStr merge skipped (index)");
            } else {
              throw tLegacyNoStartErr;
            }
          }
        }

        // Query active holds for this experience and fold non-charter holds into spotsByDate
        const tHoldsNow = Date.now();
        const processHoldForCapacity = (doc: { id: string; data: () => Record<string, unknown> }) => {
          const h = doc.data() as {
            slotId?: string;
            slot_id?: string;
            partySize?: number;
            bookingMode?: string;
            status?: string;
            expiresAt?: { toDate(): Date };
          };
          if (h.status !== "active") return;
          if (h.expiresAt && h.expiresAt.toDate().getTime() < tHoldsNow) return;
          const slotIdRaw = h.slotId ?? h.slot_id;
          if (!slotIdRaw) return;
          const parsed = parseSlotIdRelaxed(slotIdRaw);
          if (!parsed) return;
          const { dateStr } = parsed;
          if (dateStr < startDate || dateStr > endDate) return;
          // Charter holds do not reduce shared ticket capacity
          if (h.bookingMode === "charter") return;
          spotsByDate.set(dateStr, (spotsByDate.get(dateStr) ?? 0) + (h.partySize ?? 0));
        };
        const tSeenHoldIds = new Set<string>();
        try {
          // Windowed holds query: parallel == queries per experience ID use the deployed (experienceId, startDateStr) index.
          const tHoldsWindowedSnaps = await Promise.all(
            tAllExpIds.map(expId =>
              db.collection("holds")
                .where("experienceId", "==", expId)
                .where("status", "==", "active")
                .where("startDateStr", ">=", ticketedStartDateStrLower)
                .where("startDateStr", "<=", endDate)
                .get()
            )
          );
          tHoldsWindowedSnaps.forEach(snap =>
            snap.docs.forEach(doc => {
              if (tSeenHoldIds.has(doc.id)) return;
              tSeenHoldIds.add(doc.id);
              processHoldForCapacity(doc);
            })
          );
        } catch (tHoldsWindowedErr) {
          holdsQueryFailed = true;
          legacyHoldsScanCapHit = true;
          console.warn(
            "[slots] ticketed windowed holds query failed:",
            tHoldsWindowedErr instanceof Error ? tHoldsWindowedErr.message : tHoldsWindowedErr,
          );
        }
        // Legacy holds without startDateStr: prefer expiresAt-bounded query. If that composite index is missing,
        // fall back to paginated active holds (experienceId + status) so we do not mark every day blocked.
        if (!holdsQueryFailed && process.env.DISABLE_LEGACY_BOOKING_FALLBACK !== "true") {
          const legacyHoldsMaxPages = Math.max(1, Math.ceil(LEGACY_BOOKING_SCAN_LIMIT / DEFAULT_LEGACY_HOLDS_PAGE_SIZE));
          try {
            const tHoldsLegacyResults = await Promise.all(
              tAllExpIds.map((expId) =>
                scanLegacyHoldsExpiresAtLowerBound(db, expId, Timestamp.fromDate(winStart), LEGACY_BOOKING_SCAN_LIMIT)
              )
            );
            tHoldsLegacyResults.forEach((result, idx) => {
              if (result.partial) {
                legacyQueryHitLimit = true;
                legacyHoldsScanCapHit = true;
                console.warn("[slots] legacy holds query hit limit, some holds may be hidden", {
                  experienceId,
                  variant: tAllExpIds[idx],
                  count: result.docs.length,
                });
              }
              mergeTicketedLegacyHoldDocsIntoSpots(
                result.docs,
                tSeenHoldIds,
                startDate,
                endDate,
                winStart,
                winEnd,
                processHoldForCapacity,
              );
            });
          } catch (legacyExpiresErr) {
            const lem = legacyExpiresErr instanceof Error ? legacyExpiresErr.message : String(legacyExpiresErr);
            console.warn("[slots] legacy holds expiresAt scan failed; using active-holds pagination fallback:", lem);
            try {
              await Promise.all(
                tAllExpIds.map(async (expId) => {
                  const { docs, partial, timedOut } = await scanLegacyActiveHoldsForExperience(db, expId, {
                    maxPages: legacyHoldsMaxPages,
                    pageSize: DEFAULT_LEGACY_HOLDS_PAGE_SIZE,
                  });
                  if (partial || timedOut) {
                    legacyQueryHitLimit = true;
                    legacyHoldsScanCapHit = true;
                    console.warn("[slots] paginated legacy holds scan incomplete", {
                      experienceId,
                      variant: expId,
                      partial,
                      timedOut,
                    });
                  }
                  mergeTicketedLegacyHoldDocsIntoSpots(
                    docs,
                    tSeenHoldIds,
                    startDate,
                    endDate,
                    winStart,
                    winEnd,
                    processHoldForCapacity,
                  );
                })
              );
            } catch (paginationErr) {
              holdsQueryFailed = true;
              console.warn(
                "[slots] ticketed holds pagination fallback failed:",
                paginationErr instanceof Error ? paginationErr.message : paginationErr,
              );
            }
          }
        }

        // Query blocks for all experience ID variants (slug-based or legacy)
        const { docs: ticketedBlockDocs, incomplete: blocksIncomplete } = await fetchBlocksDocsOverlappingWindow(
          db,
          winStart,
          winEnd,
          tAllExpIds,
        );
        const blocksQueryFailed = blocksIncomplete;
        if (blocksIncomplete) {
          void writeOperationalAlertIfNewDocId(
            slotsAlertDocId("slots_blocks_query_incomplete", experienceId, alertUtcDay),
            {
              type: "slots_blocks_query_incomplete",
              source: "app/api/booking/slots",
              experienceId,
              hint: "Blocks composite index missing or building; deploy firestore.indexes.json and verify READY in Firebase console.",
            },
          );
        }
        const tBlockRanges: { start: number; end: number }[] = [];
        const tBlockRangesSeen = new Set<string>();
        ticketedBlockDocs.forEach((doc) => {
          const b = doc.data() as { startAt: { toDate(): Date }; endAt: { toDate(): Date } };
          const blockStart = b.startAt?.toDate?.()?.getTime();
          const blockEnd = b.endAt?.toDate?.()?.getTime();
          if (blockStart == null || blockEnd == null || blockEnd < winStart.getTime()) return;
          const key = `${blockStart}:${blockEnd}`;
          if (tBlockRangesSeen.has(key)) return;
          tBlockRangesSeen.add(key);
          tBlockRanges.push({ start: blockStart, end: blockEnd });
        });

        // Build enriched slot rows
        type TicketedSlotRow = SlotRow & {
          maxCapacity: number | undefined;
          spotsBooked: number | undefined;
          spotsRemaining: number | undefined;
          isCharterLocked: boolean | undefined;
          showSpotsRemaining: boolean | undefined;
          holdDataMissing?: boolean;
        };
        const tSlots: TicketedSlotRow[] = [];
        for (const { dateStr, startHour, startMinute, durationHours: dur } of ticketedGrid) {
          const slotId = buildSlotId(dateStr, startHour, dur, startMinute);
          const { start: slotStart, end: slotEnd } = getSlotStartEnd(dateStr, startHour, dur, startMinute);
          const slotStartMs = slotStart.getTime();
          const slotEndMs = slotEnd.getTime();
          const isBlocked = tBlockRanges.some((r) => slotStartMs < r.end && slotEndMs > r.start);
          const spotsBooked = spotsByDate.get(dateStr) ?? 0;
          // Match create-hold / date-prices: ticketed capacity uses maxCapacity when set, else maxGuests (not 0).
          const maxCapacity = getMaxGuestsForExperience({
            ...expForTicketed,
            pricingType: "ticketed",
          });
          const holdDataMissing = holdsQueryFailed;
          const spotsRemaining = Math.max(0, maxCapacity - spotsBooked);
          const isCharterLocked = charterLockedDates.has(dateStr);
          const showSpotsRemaining = expDataFull?.showSpotsRemaining ?? false;
          const soldOut = spotsRemaining === 0 && !isCharterLocked;
          const rowStatus = isBlocked ? "blocked" : soldOut ? "booked" : "open";
          tSlots.push({
            id: slotId,
            dateStr,
            startAt: slotStart.toISOString(),
            endAt: slotEnd.toISOString(),
            status: rowStatus,
            holdId: null,
            bookingId: null,
            updatedAt: null,
            boatId: "", // Ticketed: slot is not boat-specific; capacity is shared across boats
            experienceId,
            maxCapacity,
            spotsBooked,
            spotsRemaining,
            isCharterLocked,
            showSpotsRemaining,
            ...(holdDataMissing ? { holdDataMissing: true as const } : {}),
          });
        }
        tSlots.sort((a, b) => a.dateStr.localeCompare(b.dateStr) || a.startAt.localeCompare(b.startAt));
        const seasonalTicketed = expDataFull?.seasonal;
        const tSlotsReturned =
          seasonalTicketed?.enabled
            ? tSlots.filter((s) => isSeasonalAllowed(seasonalTicketed, new Date(s.startAt), s.dateStr))
            : tSlots;
        if (blocksQueryFailed || holdsQueryFailed) {
          for (const s of tSlotsReturned) {
            s.status = conservativeOpenSlotStatus(s.status as "open" | "blocked" | "booked", true);
          }
        }
        const ticketedPartial =
          legacyQueryHitLimit || holdsQueryFailed || blocksQueryFailed || legacyHoldsScanCapHit;
        if (holdsQueryFailed) {
          void writeOperationalAlertIfNewDocId(
            slotsAlertDocId("slots_ticketed_holds_query_failed", experienceId, alertUtcDay),
            {
              type: "slots_ticketed_holds_query_failed",
              source: "app/api/booking/slots",
              experienceId,
              hint: "Ticketed holds query or pagination failed; open slots marked blocked conservatively. Check Firestore indexes and holds collection health.",
            },
          );
        } else if (legacyHoldsScanCapHit) {
          void writeOperationalAlertIfNewDocId(
            slotsAlertDocId("legacy_holds_scan_cap_hit", experienceId, alertUtcDay),
            {
              type: "legacy_holds_scan_cap_hit",
              source: "app/api/booking/slots",
              experienceId,
              hint: "Legacy holds scan hit LEGACY_BOOKING_SCAN_LIMIT; complete startDateStr backfill on holds.",
            },
          );
        }
        const ticketedHeaders = {
          ...NO_STORE_HEADERS,
          "X-Slots-Generated-At": generatedAtIso,
          ...(ticketedPartial ? { "X-Slots-Partial-Data": "true" } : {}),
        };
        return NextResponse.json(
          { slots: tSlotsReturned, ...(ticketedPartial ? { partialData: true } : {}) },
          { headers: ticketedHeaders },
        );
      }
      // --- End ticketed branch ---

      const durations = ratesSnap.docs.map((d) => (d.data() as ExperienceRate).durationHours);
      const durationsUnique = Array.from(new Set(durations));
      const maxDurationCharterSlots = Math.max(...durationsUnique, 1);
      const charterBookingStartDateStrLower = addCalendarDaysToDateStr(
        startDate,
        -bookingLookbackDaysFromMaxDuration(maxDurationCharterSlots),
      );
      /** Widen startDateStr upper bound so bookings starting just after `endDate` are loaded; overlap vs winStart/winEnd still gates merges. */
      const charterBookingEndDateStrUpper = addCalendarDaysToDateStr(
        endDate,
        bookingLookbackDaysFromMaxDuration(maxDurationCharterSlots),
      );
      const slotDocsQueryEnd = winEnd;
      const boatIdParam = request.nextUrl.searchParams.get("boatId");
      const boatDocDataById = new Map<string, { allowedStartTimes?: { hour: number; minute: number }[]; boatType?: string }>();
      mergedBoatDocs.forEach((d) => boatDocDataById.set(d.id, d.data() as { allowedStartTimes?: { hour: number; minute: number }[]; boatType?: string }));
      let boatIds: string[] = mergedBoatDocs
        .filter((d) => allowBoatType((d.data() as { boatType?: string }).boatType))
        .map((d) => d.id);
      if (isWatersportsSlug(slugEffective)) {
        boatIds = boatIds.filter((id) => shouldUseWakeBoardCharterGrid(boatDocDataById.get(id)?.boatType, true));
        // Guard against legacy/missing boatType values causing an empty watersports calendar.
        if (boatIds.length === 0 && nonPontoonBoatIds.length > 0) {
          console.warn("[slots] watersports charter boatType filter returned zero boats; using non-pontoon fallback", {
            experienceId,
          });
          boatIds = [...nonPontoonBoatIds];
        }
      }
      if (isWatersportsSlug(slugEffective) && boatIds.length === 0) {
        void writeOperationalAlertIfNewDocId(
          slotsAlertDocId("slots_watersports_no_eligible_boats", experienceId, alertUtcDay),
          {
            type: "slots_watersports_no_eligible_boats",
            source: "app/api/booking/slots",
            experienceId,
            hint: "No eligible wake boats linked. Ensure isListingBoat=true, boatType=wake, and experienceIds contains this experience id/alias.",
          },
        );
        return NextResponse.json(
          {
            slots: [],
            error: "No eligible wake boats linked to this experience.",
            hint: "Check that boats have isListingBoat: true, boatType: wake, and the experience id in experienceIds.",
          },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }
      const allExpIds = experienceIdVariants;
      if (boatIdParam) {
        if (!boatIds.includes(boatIdParam)) {
          return NextResponse.json({ error: "Boat not found or not assigned to this experience" }, { status: 404 });
        }
        boatIds = [boatIdParam];
      }
      let legacyQueryHitLimitCharter = false;
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
        if (fallbackSnaps.some((snap) => snap.size === 500)) {
          legacyQueryHitLimitCharter = true;
        }
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
      type SlotRow = {
        id: string;
        dateStr: string;
        startAt: string;
        endAt: string;
        status: string;
        holdId: string | null;
        bookingId: string | null;
        updatedAt: string | null;
        boatId: string;
        experienceId: string;
        maxCapacity?: number | undefined;
        spotsBooked?: number | undefined;
        spotsRemaining?: number | undefined;
        isCharterLocked?: boolean | undefined;
        showSpotsRemaining?: boolean | undefined;
        /** When this grid row is a shorter tier overlapped by a longer booked trip — true duration for UI. */
        bookingDurationHours?: number;
        unresolvedBoatId?: boolean;
      };
      /** Canonical duration per booking id from booking.slotId parsing. */
      const bookingDurationHoursByBookingId = new Map<string, number>();
      /** Fallback canonical duration inference from already-merged booked rows keyed by bookingId. */
      const inferredBookingDurationHoursByBookingId = new Map<string, number>();
      const existingByBoatAndKey = new Map<string, SlotRow>();
      /** Firestore slot docs may store holdId for server-side hold expiry resolution; never expose to clients (response uses holdId: null). */
      const charterSlotHoldIdByKey = new Map<string, string>();

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
      const unresolvedBookingIds: string[] = [];
      const mergeBookingSlot = (doc: { id: string; data: () => Record<string, unknown> }) => {
        const b = doc.data() as { boatId?: string; slotId?: string; slot_id?: string; status?: string; experienceId?: string };
        if (!isSlotTakenStatus(b.status)) return;
        const slotIdRaw = normalizeSlotId(b.slotId ?? b.slot_id);
        if (!slotIdRaw) return;
        const parsed = parseSlotIdRelaxed(slotIdRaw);
        if (!parsed) return;
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
        if (!intervalOverlapsRequestWindow(slotStart.getTime(), slotEnd.getTime(), winStart, winEnd)) return;
        const slotIdNorm = buildSlotId(parsed.dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute ?? 0);
        bookingDurationHoursByBookingId.set(doc.id, parsed.durationHours);
        const bidRaw = typeof b.boatId === "string" ? b.boatId.trim() || undefined : undefined;
        const bid = bidRaw && boatIds.includes(bidRaw) ? bidRaw : undefined;
        if (!bid) {
          unresolvedBookingIds.push(doc.id);
          console.warn("[slots] booking missing or unmatched boatId — blocking slot for all boats", {
            bookingId: doc.id,
            experienceId: b.experienceId ?? experienceId,
            slotId: slotIdNorm,
          });
          // Block this slot for every boat so calendar does not show it as available (matches create-hold which rejects when any overlapping booking exists).
          for (const blockBid of boatIds) {
            const key = `${blockBid}:${slotIdNorm}`;
            existingByBoatAndKey.set(key, {
              id: slotIdNorm,
              dateStr: parsed.dateStr,
              startAt: slotStart.toISOString(),
              endAt: slotEnd.toISOString(),
              status: "booked",
              holdId: null,
              bookingId: doc.id,
              updatedAt: null,
              boatId: blockBid,
              experienceId,
              bookingDurationHours: parsed.durationHours,
              unresolvedBoatId: true,
            });
          }
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
          bookingDurationHours: parsed.durationHours,
        });
      };

      const allBookingDocs: { id: string; data: () => Record<string, unknown> }[] = [];
      const seenBookingIds = new Set<string>();
      let charterHoldsResolutionFailed = false;
      const LEGACY_BOOKING_SCAN_LIMIT_CH = getLegacyBookingScanLimit();
      const WINDOWED_BOOKINGS_MAX_DOCS = (() => {
        const raw = process.env.SLOTS_WINDOWED_BOOKINGS_MAX_DOCS ?? "";
        const n = parseInt(String(raw), 10);
        return Number.isFinite(n) && n >= 500 ? Math.min(n, 50_000) : 5_000;
      })();
      let windowedBookingsTruncated = false;

      const addBookingDoc = (doc: { id: string; data: () => Record<string, unknown> }) => {
        if (seenBookingIds.has(doc.id)) return;
        seenBookingIds.add(doc.id);
        allBookingDocs.push(doc);
      };

      // Windowed query uses the (experienceId, status, startDateStr) composite index — fast path for all requests.
      // Note: `in` + range on a different field is rejected by Firestore; per-ID parallel calls are used.
      let windowedIndexReady = true;
      try {
        const windowedSnaps = await Promise.all(
          allExpIds.map(expId =>
            db.collection("bookings")
              .where("experienceId", "==", expId)
              .where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN))
              .where("startDateStr", ">=", charterBookingStartDateStrLower)
              .where("startDateStr", "<=", charterBookingEndDateStrUpper)
              .limit(WINDOWED_BOOKINGS_MAX_DOCS + 1)
              .get()
          )
        );
        windowedSnaps.forEach((snap, idx) => {
          const truncatedThis = snap.size > WINDOWED_BOOKINGS_MAX_DOCS;
          if (truncatedThis) {
            windowedBookingsTruncated = true;
            console.warn("[slots] windowed bookings query exceeded cap; truncating to avoid memory exhaustion", {
              experienceId,
              variant: allExpIds[idx],
              cap: WINDOWED_BOOKINGS_MAX_DOCS,
              rawCount: snap.size,
            });
            void writeOperationalAlertIfNewDocId(
              slotsAlertDocId(
                "slots_windowed_bookings_truncated",
                `${experienceId}|${allExpIds[idx] ?? ""}|${WINDOWED_BOOKINGS_MAX_DOCS}`,
                alertUtcDay,
              ),
              {
                type: "slots_windowed_bookings_truncated",
                source: "app/api/booking/slots",
                experienceId,
                variant: allExpIds[idx],
                cap: WINDOWED_BOOKINGS_MAX_DOCS,
                rawCount: snap.size,
                hint: "Windowed bookings query returned too many docs; response is partial and open slots are marked conservatively.",
              },
            );
          }
          const docs = truncatedThis ? snap.docs.slice(0, WINDOWED_BOOKINGS_MAX_DOCS) : snap.docs;
          docs.forEach((doc) => {
            if (!BOOKING_STATUSES_SLOT_TAKEN.has((doc.data() as { status?: BookingStatus }).status as BookingStatus)) return;
            addBookingDoc(doc);
          });
        });
      } catch (windowedErr) {
        const wmsg = windowedErr instanceof Error ? windowedErr.message : String(windowedErr);
        if (/FAILED_PRECONDITION.*index/i.test(wmsg)) {
          windowedIndexReady = false;
          console.warn("[slots] windowed bookings index not ready yet, falling back to legacy query");
        } else {
          throw windowedErr;
        }
      }
      // Legacy fallback: only runs when the windowed index is absent.
      // Query by experienceId and status only so we can catch docs without startDateStr; filter in memory.
      if (!windowedIndexReady) {
        try {
          const legacySnaps = await Promise.all(
            allExpIds.map(expId =>
              db.collection("bookings")
                .where("experienceId", "==", expId)
                .where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN))
                .limit(LEGACY_BOOKING_SCAN_LIMIT_CH)
                .get()
            )
          );
          legacySnaps.forEach((snap, idx) => {
            if (snap.size >= LEGACY_BOOKING_SCAN_LIMIT_CH) {
              legacyQueryHitLimitCharter = true;
              console.warn("[slots] legacy query hit limit, some bookings may be hidden", { experienceId, variant: allExpIds[idx], count: snap.size });
            }
            snap.docs.forEach(doc => {
              if (seenBookingIds.has(doc.id)) return;
              const d = doc.data() as { startDateStr?: string; slotId?: string; slot_id?: string };
              const iv = bookingIntervalMsFromSlotFields(d.slotId, d.slot_id);
              if (!iv || !intervalOverlapsRequestWindow(iv.startMs, iv.endMs, winStart, winEnd)) return;
              addBookingDoc(doc);
            });
          });
        } catch (legacyErr) {
          const lmsg = legacyErr instanceof Error ? legacyErr.message : String(legacyErr);
          if (/FAILED_PRECONDITION.*index/i.test(lmsg)) {
            console.warn("[slots] legacy bookings index not ready yet, continuing without booking data");
          } else {
            throw legacyErr;
          }
        }
      }
      if (!windowedIndexReady && process.env.DISABLE_LEGACY_BOOKING_FALLBACK !== "true") {
        try {
          const legacyNoStartCharterSnaps = await Promise.all(
            allExpIds.map((expId) =>
              db
                .collection("bookings")
                .where("experienceId", "==", expId)
                .where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN))
                .limit(LEGACY_BOOKING_SCAN_LIMIT_CH)
                .get()
            )
          );
          if (legacyNoStartCharterSnaps.some((s) => s.docs.length >= LEGACY_BOOKING_SCAN_LIMIT_CH)) {
            legacyQueryHitLimitCharter = true;
          }
          for (const snap of legacyNoStartCharterSnaps) {
            for (const doc of snap.docs) {
              if (seenBookingIds.has(doc.id)) continue;
              const d = doc.data() as { startDateStr?: string; slotId?: string; slot_id?: string };
              if (d.startDateStr) continue;
              const ivNc = bookingIntervalMsFromSlotFields(d.slotId, d.slot_id);
              if (!ivNc || !intervalOverlapsRequestWindow(ivNc.startMs, ivNc.endMs, winStart, winEnd)) continue;
              addBookingDoc(doc);
            }
          }
        } catch (legacyMergeErr) {
          const lm = legacyMergeErr instanceof Error ? legacyMergeErr.message : String(legacyMergeErr);
          if (/FAILED_PRECONDITION.*index/i.test(lm)) {
            console.warn("[slots] charter legacy no-startDateStr merge skipped (index)");
          } else {
            throw legacyMergeErr;
          }
        }
      }
      /**
       * Supplement experience-scoped window queries: include taken bookings for each listing boat when the
       * trip interval overlaps the request window, even if `startDateStr` is missing or wrong (e.g. legacy
       * backfill drift). Ensures longer tiers (8h) still see `existingByBoatAndKey` / `nonOpenIntervals` overlap.
       */
      const expIdsSetForBoatBookingMerge = new Set(allExpIds);
      const BOAT_CHARTER_BOOKING_SUPPLEMENT_LIMIT = 500;
      const BOAT_CHARTER_BOOKING_QUERY_CHUNK = 10;
      const disableBoatSupplementScan = disableBoatSupplementScanEffective;
      if (!disableBoatSupplementScan && boatIds.length > 0) {
        try {
          for (let off = 0; off < boatIds.length; off += BOAT_CHARTER_BOOKING_QUERY_CHUNK) {
            const chunk = boatIds.slice(off, off + BOAT_CHARTER_BOOKING_QUERY_CHUNK);
            const supplementSnaps = await Promise.all(
              chunk.map((bid) =>
                db
                  .collection("bookings")
                  .where("boatId", "==", bid)
                  .where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN))
                  .where("startDateStr", ">=", charterBookingStartDateStrLower)
                  .limit(BOAT_CHARTER_BOOKING_SUPPLEMENT_LIMIT)
                  .get()
              )
            );
            for (const snap of supplementSnaps) {
              if (snap.size >= BOAT_CHARTER_BOOKING_SUPPLEMENT_LIMIT) {
                legacyQueryHitLimitCharter = true;
                console.warn("[slots] charter boat-scoped booking supplement hit limit; overlapping trips may be incomplete", {
                  experienceId,
                });
                void writeOperationalAlertIfNewDocId(
                  slotsAlertDocId(
                    "slots_charter_boat_supplement_limit_hit",
                    `${experienceId}|${BOAT_CHARTER_BOOKING_SUPPLEMENT_LIMIT}`,
                    alertUtcDay,
                  ),
                  {
                    type: "slots_charter_boat_supplement_limit_hit",
                    source: "app/api/booking/slots",
                    experienceId,
                    limit: BOAT_CHARTER_BOOKING_SUPPLEMENT_LIMIT,
                    hint: "Boat supplement scan hit cap and partial data mode is active; complete booking startDateStr/boatId backfill and set DISABLE_BOAT_SUPPLEMENT_SCAN=true.",
                  },
                );
              }
              for (const doc of snap.docs) {
                if (seenBookingIds.has(doc.id)) continue;
                const b = doc.data() as { experienceId?: string; slotId?: string; slot_id?: string };
                if (b.experienceId != null && String(b.experienceId).trim() !== "") {
                  if (!expIdsSetForBoatBookingMerge.has(String(b.experienceId))) continue;
                }
                const ivSup = bookingIntervalMsFromSlotFields(b.slotId, b.slot_id);
                if (!ivSup || !intervalOverlapsRequestWindow(ivSup.startMs, ivSup.endMs, winStart, winEnd)) continue;
                addBookingDoc(doc);
              }
            }
          }
        } catch (suppErr) {
          legacyQueryHitLimitCharter = true;
          console.warn(
            "[slots] charter boat-scoped booking supplement failed:",
            suppErr instanceof Error ? suppErr.message : suppErr,
          );
        }
      }
      allBookingDocs.forEach((doc) => mergeBookingSlot(doc));
      // When we had 0 boats we loaded bookings by experience (doc id or slug); merge those too so deposit/final_due bookings always show.
      bookingsFromFallback.forEach((doc) => mergeBookingSlot(doc));

      // Backfill canonical duration by scanning merged booked rows. This protects UI duration accuracy
      // when booking docs are partially unavailable and booked rows come from fallback slot-doc merges.
      for (const row of Array.from(existingByBoatAndKey.values())) {
        if (row.status !== "booked" || !row.bookingId) continue;
        const parsedRow = parseSlotIdRelaxed(row.id);
        const rowDuration =
          parsedRow && typeof parsedRow.durationHours === "number" && parsedRow.durationHours > 0
            ? parsedRow.durationHours
            : undefined;
        if (rowDuration == null) continue;
        const prev = inferredBookingDurationHoursByBookingId.get(row.bookingId);
        if (prev == null || rowDuration < prev) {
          inferredBookingDurationHoursByBookingId.set(row.bookingId, rowDuration);
        }
      }

      if (unresolvedBookingIds.length > 0) {
        const uniqueUnresolved = Array.from(new Set(unresolvedBookingIds));
        console.warn("[slots] unresolved_booking_no_boat_id telemetry", {
          count: uniqueUnresolved.length,
          bookingIds: uniqueUnresolved.slice(0, 100),
          experienceId,
        });
        void writeOperationalAlertIfNewDocId(
          slotsAlertDocId("slots_unresolved_booking_missing_boat_id", experienceId, alertUtcDay),
          {
            type: "slots_unresolved_booking_missing_boat_id",
            source: "app/api/booking/slots",
            experienceId,
            count: uniqueUnresolved.length,
            hint: "Backfill boatId on legacy bookings (POST /api/admin/backfill-booking-boat-ids with { applyUpdates: true }). Staff email: cron POST /api/admin/cron/alert-missing-booking-boat-ids.",
          },
        );
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

      // Query blocks for all experience ID variants (slug-based or legacy); merge and dedupe.
      const blocksResultPromise = fetchBlocksDocsOverlappingWindow(db, winStart, winEnd, allExpIds);

      // 2) Load Firestore slot docs — do not overwrite keys already set by bookings.
      await Promise.all(
        boatIds.map(async (bid) => {
          const snap = await db
            .collection("boats")
            .doc(bid)
            .collection("slots")
            .where("startAt", ">=", Timestamp.fromDate(winStart))
            .where("startAt", "<=", Timestamp.fromDate(slotDocsQueryEnd))
            .get();
          snap.docs.forEach((doc) => {
            const parsedSlot = parseSlotIdRelaxed(doc.id);
            const slotIdNorm = parsedSlot ? buildSlotId(parsedSlot.dateStr, parsedSlot.startHour, parsedSlot.durationHours, parsedSlot.startMinute ?? 0) : doc.id;
            const key = `${bid}:${slotIdNorm}`;
            if (existingByBoatAndKey.has(key)) return;
            const data = doc.data() as Slot;
            const startAtDate = toDateSafe(data.startAt);
            const endAtDate = toDateSafe(data.endAt);
            if (!startAtDate || !endAtDate) return; // skip malformed slot doc
            const updatedAt = data.updatedAt as { toDate?: () => Date } | undefined;
            const updatedAtIso = updatedAt?.toDate?.()?.toISOString?.() ?? null;
            // Consistency model: bookings collection is source-of-truth; slot docs are eventual projections.
            // Conservative rule: do not demote slot docs from "booked" -> "open" when the merge is absent.
            // When bookings haven't propagated yet, keeping "booked" avoids showing phantom availability.
            const status = data.status;
            // Resolve bookingId from bookings collection so admin calendar detail fetch works (slot doc may store non-doc id).
            const resolvedBookingId = bookingIdByBoatAndSlot.get(`${bid}:${slotIdNorm}`) ?? data.bookingId;
            const hid = typeof data.holdId === "string" && data.holdId.trim() ? data.holdId.trim() : null;
            if (status === "held" && hid) charterSlotHoldIdByKey.set(key, hid);
            existingByBoatAndKey.set(key, {
              id: slotIdNorm,
              dateStr: dateStrFromSlotId(slotIdNorm),
              startAt: startAtDate.toISOString(),
              endAt: endAtDate.toISOString(),
              status,
              holdId: null,
              bookingId: resolvedBookingId,
              updatedAt: updatedAtIso,
              boatId: bid,
              experienceId,
            });
          });
        })
      );

      // Resolve expired/missing holds before building nonOpenIntervals from existingByBoatAndKey (otherwise overlapping grid cells stay "blocked" after a hold expires).
      const charterHeldHoldIdsResolved = Array.from(
        new Set(
          Array.from(existingByBoatAndKey.values())
            .filter((s) => s.status === "held")
            .map((s) => charterSlotHoldIdByKey.get(`${s.boatId}:${s.id}`))
            .filter((id): id is string => typeof id === "string" && id.length > 0)
        )
      );
      let charterHoldResolutionSnap: import("firebase-admin").firestore.DocumentSnapshot[] = [];
      const holdIdsToReleaseAfterResolve = new Set<string>();
      if (charterHeldHoldIdsResolved.length > 0) {
        try {
          charterHoldResolutionSnap = await getHoldSnapshotsOrdered(db, charterHeldHoldIdsResolved);
        } catch (holdResolveErr) {
          charterHoldsResolutionFailed = true;
          console.warn(
            "[slots] charter held-slot hold docs fetch failed:",
            holdResolveErr instanceof Error ? holdResolveErr.message : holdResolveErr,
          );
        }
        const nowResolve = new Date();
        charterHoldResolutionSnap.forEach((doc, i) => {
          const hid = charterHeldHoldIdsResolved[i];
          if (!doc.exists) {
            holdIdsToReleaseAfterResolve.add(hid);
            return;
          }
          const data = doc.data() as { status?: string; expiresAt?: { toDate(): Date } };
          if (data?.status !== "active") {
            holdIdsToReleaseAfterResolve.add(hid);
            return;
          }
          const expAt = data?.expiresAt?.toDate?.();
          if (expAt && expAt <= nowResolve) holdIdsToReleaseAfterResolve.add(hid);
        });
        if (!charterHoldsResolutionFailed) {
          for (const row of Array.from(existingByBoatAndKey.values())) {
            if (row.status !== "held") continue;
            const hid = charterSlotHoldIdByKey.get(`${row.boatId}:${row.id}`);
            if (!hid || !holdIdsToReleaseAfterResolve.has(hid)) continue;
            row.status = "open";
            charterSlotHoldIdByKey.delete(`${row.boatId}:${row.id}`);
          }
        }
      }

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
        const isWakeBoat = shouldUseWakeBoardCharterGrid(boatData?.boatType, isWatersportsSlug(slugEffective));
        let grid: import("@/lib/booking/experience-slots").SlotGridItem[];
        if (durationsUnique.length === 0) {
          grid = [];
        } else if (isWakeBoat) {
          grid = getSlotGridWakeBoard(gridStart, gridEnd, durationsUnique, allowedEveryDay ?? undefined);
        } else if (allowedEveryDay?.length) {
          grid = getSlotGridForStartTimes(gridStart, gridEnd, durationsUnique, allowedEveryDay);
        } else {
          grid = getSlotGrid(gridStart, gridEnd, durationsUnique);
        }
        gridByBoatId.set(bid, grid);
      }
      const blockRangesByBoat = new Map<string, { start: number; end: number }[]>();
      const blocksResult = await blocksResultPromise; // started in parallel with slot doc loads
      const charterBlocksQueryFailed = blocksResult.incomplete;
      if (blocksResult.incomplete) {
        void writeOperationalAlertIfNewDocId(
          slotsAlertDocId("slots_blocks_query_incomplete_charter", experienceId, alertUtcDay),
          {
            type: "slots_blocks_query_incomplete",
            source: "app/api/booking/slots",
            experienceId,
            branch: "charter",
            hint: "Blocks composite index missing or building; deploy firestore.indexes.json and verify READY in Firebase console.",
          },
        );
      }
      blocksResult.docs.forEach((doc) => {
        const b = doc.data() as { boatId?: string | null; startAt: { toDate(): Date }; endAt: { toDate(): Date } };
        const blockStart = b.startAt?.toDate?.()?.getTime();
        const blockEnd = b.endAt?.toDate?.()?.getTime();
        if (blockStart == null || blockEnd == null || blockEnd < winStart.getTime()) return;
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
      const slots: SlotRow[] = [];
      const intervalOverlaps = (msStart: number, msEnd: number, r: { start: number; end: number }) =>
        msStart < r.end && msEnd > r.start;

      for (const bid of boatIds) {
        const grid = gridByBoatId.get(bid) ?? [];
        const nonOpenIntervals = Array.from(existingByBoatAndKey.values())
          .filter((s) => s.boatId === bid && s.status !== "open")
          .map((s) => ({
            start: new Date(s.startAt).getTime(),
            end: new Date(s.endAt).getTime(),
            status: s.status,
            bookingId: s.bookingId as string | null,
          }));
        const boatBlockRanges = blockRangesByBoat.get(bid) ?? [];
        for (const { dateStr, startHour, startMinute, durationHours } of grid) {
          const slotId = buildSlotId(dateStr, startHour, durationHours, startMinute);
          const key = `${bid}:${slotId}`;
          const existing = existingByBoatAndKey.get(key);
          if (existing && existing.status !== "open") {
            if (existing.status === "booked" && existing.bookingId && existing.bookingDurationHours == null) {
              const canonicalDuration =
                bookingDurationHoursByBookingId.get(existing.bookingId) ??
                inferredBookingDurationHoursByBookingId.get(existing.bookingId);
              if (canonicalDuration != null) existing.bookingDurationHours = canonicalDuration;
            }
            slots.push(existing);
            continue;
          }
          const { start: slotStart, end: slotEnd } = getSlotStartEnd(dateStr, startHour, durationHours, startMinute);
          const slotStartMs = slotStart.getTime();
          const slotEndMs = slotEnd.getTime();

          // Admin/operator blocks win over “same booking” labeling.
          const blockedByCalendar = boatBlockRanges.some((r) => intervalOverlaps(slotStartMs, slotEndMs, r));
          const overlappingBooked = nonOpenIntervals.find(
            (e) => e.status === "booked" && intervalOverlaps(slotStartMs, slotEndMs, e)
          );
          const overlappingOtherTaken = nonOpenIntervals.some(
            (e) => e.status !== "booked" && intervalOverlaps(slotStartMs, slotEndMs, e)
          );

          let rowStatus: string;
          let rowBookingId: string | null = null;
          if (blockedByCalendar) {
            rowStatus = "blocked";
          } else if (existing?.status === "open") {
            // Exact slot row is authoritative; do not let synthetic overlap rows override it.
            rowStatus = "open";
          } else if (overlappingOtherTaken) {
            // Fallback path only when exact row is missing: non-booked taken intervals are generic unavailable.
            rowStatus = "blocked";
          } else if (overlappingBooked) {
            // Same paid charter overlapping this start time (e.g. 7am–10am trip blocks a 9am start on the same boat).
            // Use "booked" so the UI matches the exact slot row, not generic "Unavailable".
            rowStatus = "booked";
            rowBookingId =
              overlappingBooked.bookingId != null && String(overlappingBooked.bookingId).trim() !== ""
                ? String(overlappingBooked.bookingId).trim()
                : null;
          } else {
            rowStatus = "open";
          }

          let bookingDurationHours: number | undefined = undefined;
          if (rowStatus === "booked" && rowBookingId) {
            bookingDurationHours =
              bookingDurationHoursByBookingId.get(rowBookingId) ??
              inferredBookingDurationHoursByBookingId.get(rowBookingId);
          }

          const openSlotDocRow = existing?.status === "open" ? existing : null;
          slots.push({
            id: slotId,
            dateStr,
            startAt: slotStart.toISOString(),
            endAt: slotEnd.toISOString(),
            status: rowStatus,
            holdId: null,
            bookingId: rowStatus === "booked" ? rowBookingId : null,
            updatedAt: openSlotDocRow ? openSlotDocRow.updatedAt : null,
            boatId: bid,
            experienceId,
            ...(bookingDurationHours != null ? { bookingDurationHours } : {}),
          });
        }
      }
      // Include booked/held slots that are in range but not in the grid (e.g. past) so the admin calendar shows all bookings.
      const slotsKeySet = new Set(slots.map((s) => `${s.boatId}:${s.id}`));
      for (const row of Array.from(existingByBoatAndKey.values())) {
        if (row.status !== "booked" && row.status !== "held") continue;
        const rowStartMs = new Date(row.startAt).getTime();
        const rowEndMs = new Date(row.endAt).getTime();
        if (
          Number.isNaN(rowStartMs) ||
          Number.isNaN(rowEndMs) ||
          !intervalOverlapsRequestWindow(rowStartMs, rowEndMs, winStart, winEnd)
        ) {
          continue;
        }
        const key = `${row.boatId}:${row.id}`;
        if (slotsKeySet.has(key)) continue;
        slots.push(row);
        slotsKeySet.add(key);
      }
      slots.sort((a, b) => a.dateStr.localeCompare(b.dateStr) || a.startAt.localeCompare(b.startAt));
      if (charterHeldHoldIdsResolved.length > 0) {
        if (charterHoldsResolutionFailed) {
          void writeOperationalAlertIfNewDocId(
            slotsAlertDocId("slots_charter_holds_batch_get_failed", experienceId, alertUtcDay),
            {
              type: "slots_charter_holds_batch_get_failed",
              source: "app/api/booking/slots",
              experienceId,
              hint: "Firestore getAll for hold docs failed; charter held slots left as held with holdDataMissing (not shown as open).",
            },
          );
          slots.forEach((s) => {
            if (s.status === "held") {
              (s as Record<string, unknown>).holdDataMissing = true;
            }
          });
        } else {
          slots.forEach((s) => {
            if (s.status !== "held") return;
            const hid = charterSlotHoldIdByKey.get(`${s.boatId}:${s.id}`);
            if (!hid) return;
            const exp = charterHoldResolutionSnap[charterHeldHoldIdsResolved.indexOf(hid)]?.data()?.expiresAt as { toDate(): Date } | undefined;
            if (exp) (s as Record<string, unknown>).expiresAt = exp.toDate().toISOString();
          });
        }
      }

      const seasonalCharter = (expData as { seasonal?: { enabled?: boolean; startMonth?: number; endMonth?: number; startDate?: string; endDate?: string } })?.seasonal;
      const slotsToReturn = seasonalCharter?.enabled
        ? slots.filter((s) => isSeasonalAllowed(seasonalCharter, new Date(s.startAt), s.dateStr))
        : slots;
      // Keep open slots visible unless block/hold resolution itself failed.
      // Legacy/query-cap partial data is surfaced via headers/body; it should not hard-block the entire calendar.
      if (charterBlocksQueryFailed || charterHoldsResolutionFailed) {
        for (const s of slotsToReturn) {
          s.status = conservativeOpenSlotStatus(s.status as "open" | "blocked" | "booked", true);
        }
      }

      const debugByDate = request.nextUrl.searchParams.get("debug") === "1" || request.nextUrl.searchParams.get("byDate") === "1"
        ? (() => {
            const byDate: Record<string, { open: number; held: number; booked: number; blocked: number }> = {};
            for (const s of slotsToReturn) {
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
      const charterPartial =
        legacyQueryHitLimitCharter ||
        charterBlocksQueryFailed ||
        charterHoldsResolutionFailed ||
        // Missing windowed index alone is not partial if legacy fallback returns full data.
        windowedBookingsTruncated;
      const responseHeaders: Record<string, string> = { ...NO_STORE_HEADERS };
      responseHeaders["X-Slots-Generated-At"] = generatedAtIso;
      if (unresolvedBookingIds.length > 0) {
        responseHeaders["X-Unresolved-Booking-Count"] = String(Array.from(new Set(unresolvedBookingIds)).length);
      }
      if (charterPartial) {
        responseHeaders["X-Slots-Partial-Data"] = "true";
      }
      return NextResponse.json(
        debugByDate != null
          ? { slots: slotsToReturn, byDate: debugByDate, ...(charterPartial ? { partialData: true } : {}) }
          : { slots: slotsToReturn, ...(charterPartial ? { partialData: true } : {}) },
        { headers: responseHeaders },
      );
    }

    // Boats: legacy – bookings/holds by interval overlap (match charter policy), slot docs for grid/held/blocked
    let legacyMaxDuration = 1;
    try {
      const legacyBoatSnap = await db.collection("boats").doc(boatId!).get();
      const legacyExpIds =
        (legacyBoatSnap.data() as { experienceIds?: string[] } | undefined)?.experienceIds?.filter(
          (id): id is string => typeof id === "string" && id.trim() !== "",
        ) ?? [];
      const primaryLegacyExpId = legacyExpIds[0];
      if (primaryLegacyExpId) {
        const legacyRatesSnap = await db
          .collection("experiences")
          .doc(primaryLegacyExpId)
          .collection("rates")
          .where("active", "==", true)
          .get();
        const legacyDurations = legacyRatesSnap.docs.map((d) => (d.data() as ExperienceRate).durationHours);
        const legacyDurationsUnique = Array.from(new Set(legacyDurations));
        legacyMaxDuration = Math.max(...legacyDurationsUnique, 1);
      }
    } catch {
      legacyMaxDuration = 1;
    }
    const { windowStart: legacyWinStart, windowEnd: legacyWinEnd } = getSlotsApiRequestWindow(
      startDate!,
      endDate!,
      legacyMaxDuration,
    );
    const legacySlotDocsQueryEnd = legacyWinEnd;
    const startDateLower = addCalendarDaysToDateStr(
      startDate!,
      -bookingLookbackDaysFromMaxDuration(legacyMaxDuration),
    );
    const endDateUpper = addCalendarDaysToDateStr(
      endDate!,
      bookingLookbackDaysFromMaxDuration(legacyMaxDuration),
    );
    const LEGACY_BOOKING_SCAN_LIMIT = getLegacyBookingScanLimit();
    let legacyQueryHitLimitBoat = false;

    const legacyBookingsSnap = await db
      .collection("bookings")
      .where("boatId", "==", boatId)
      .where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN))
      .where("startDateStr", ">=", startDateLower)
      .where("startDateStr", "<=", endDateUpper)
      .limit(LEGACY_BOOKING_SCAN_LIMIT)
      .get();
    if (legacyBookingsSnap.size >= LEGACY_BOOKING_SCAN_LIMIT) {
      legacyQueryHitLimitBoat = true;
    }
    const legacyBookedIntervals: { startMs: number; endMs: number; bookingId: string }[] = [];
    legacyBookingsSnap.docs.forEach((d) => {
      const b = d.data() as { slotId?: string; slot_id?: string; status?: string };
      if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) return;
      const iv = bookingIntervalMsFromSlotFields(b.slotId, b.slot_id);
      if (!iv || !intervalOverlapsRequestWindow(iv.startMs, iv.endMs, legacyWinStart, legacyWinEnd)) return;
      legacyBookedIntervals.push({ startMs: iv.startMs, endMs: iv.endMs, bookingId: d.id });
    });

    const legacyHeldIntervals: { startMs: number; endMs: number }[] = [];
    const legacyHoldsNow = Date.now();
    try {
      const legacyHoldsSnap = await db.collection("holds").where("boatId", "==", boatId).where("status", "==", "active").get();
      legacyHoldsSnap.docs.forEach((doc) => {
        const h = doc.data() as {
          status?: string;
          expiresAt?: { toDate(): Date };
          rollbackPending?: boolean;
          slotId?: string;
          slot_id?: string;
        };
        if (h.status !== "active") return;
        if (h.rollbackPending === true) return;
        if (h.expiresAt && h.expiresAt.toDate().getTime() < legacyHoldsNow) return;
        const ivH = bookingIntervalMsFromSlotFields(h.slotId, h.slot_id);
        if (!ivH || !intervalOverlapsRequestWindow(ivH.startMs, ivH.endMs, legacyWinStart, legacyWinEnd)) return;
        legacyHeldIntervals.push({ startMs: ivH.startMs, endMs: ivH.endMs });
      });
    } catch (legacyHoldScanErr) {
      console.warn(
        "[slots] legacy boat holds scan failed:",
        legacyHoldScanErr instanceof Error ? legacyHoldScanErr.message : legacyHoldScanErr,
      );
    }

    const legacyIvOverlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
      aStart < bEnd && aEnd > bStart;

    const { docs: legacyBlockDocs, incomplete: legacyBlocksIncomplete } = await fetchBlocksDocsOverlappingWindow(
      db,
      legacyWinStart,
      legacyWinEnd,
      [boatId!],
    );
    if (legacyBlocksIncomplete) {
      void writeOperationalAlertIfNewDocId(
        slotsAlertDocId("slots_blocks_query_incomplete_legacy_boat", boatId ?? "unknown", alertUtcDay),
        {
          type: "slots_blocks_query_incomplete",
          source: "app/api/booking/slots",
          boatId: boatId ?? undefined,
          branch: "legacy_boat_only",
          hint: "Blocks composite index missing or building; deploy firestore.indexes.json and verify READY in Firebase console.",
        },
      );
    }
    const legacyBlockRanges: { start: number; end: number }[] = [];
    const legacyBoatIdNorm = typeof boatId === "string" ? boatId.trim() : "";
    legacyBlockDocs.forEach((doc) => {
      const b = doc.data() as { boatId?: string | null; startAt: { toDate(): Date }; endAt: { toDate(): Date } };
      const blockBoatRaw = typeof b.boatId === "string" ? b.boatId.trim() : null;
      if (blockBoatRaw && legacyBoatIdNorm && blockBoatRaw !== legacyBoatIdNorm) return;
      const blockStart = b.startAt?.toDate?.()?.getTime();
      const blockEnd = b.endAt?.toDate?.()?.getTime();
      if (blockStart == null || blockEnd == null || blockEnd < legacyWinStart.getTime()) return;
      legacyBlockRanges.push({ start: blockStart, end: blockEnd });
    });

    const slotsRef = db.collection("boats").doc(boatId!).collection("slots");
    const snap = await slotsRef
      .where("startAt", ">=", Timestamp.fromDate(legacyWinStart))
      .where("startAt", "<=", Timestamp.fromDate(legacySlotDocsQueryEnd))
      .orderBy("startAt", "asc")
      .get();
    const legacySlotHoldIdByDocId = new Map<string, string>();
    let slots = snap.docs.map((doc) => {
      const data = doc.data() as Slot;
      const startAt = data.startAt as { toDate(): Date };
      const endAt = data.endAt as { toDate(): Date };
      const updatedAt = data.updatedAt as { toDate(): Date } | undefined;
      const parsed = parseSlotIdRelaxed(doc.id);
      // Same conservative rule as charter: never demote slot-doc "booked" -> "open".
      let status: string = data.status;
      const hidRaw = typeof data.holdId === "string" && data.holdId.trim() ? data.holdId.trim() : null;
      if (status === "held" && hidRaw) legacySlotHoldIdByDocId.set(doc.id, hidRaw);
      return {
        id: doc.id,
        dateStr: parsed?.dateStr ?? doc.id.slice(0, 10),
        startAt: startAt.toDate().toISOString(),
        endAt: endAt.toDate().toISOString(),
        status,
        holdId: null,
        bookingId: data.bookingId ?? null,
        updatedAt: updatedAt?.toDate?.()?.toISOString?.() ?? null,
      };
    });

    const legacyHeldHoldIds = Array.from(new Set(legacySlotHoldIdByDocId.values()));
    if (legacyHeldHoldIds.length > 0) {
      try {
        const legacyHoldResolutionSnaps = await getHoldSnapshotsOrdered(db, legacyHeldHoldIds);
        const legacyHoldIdsToOpen = new Set<string>();
        const nowLegacy = new Date();
        legacyHoldResolutionSnaps.forEach((hs, i) => {
          const hid = legacyHeldHoldIds[i];
          if (!hs.exists) {
            legacyHoldIdsToOpen.add(hid);
            return;
          }
          const hd = hs.data() as { status?: string; expiresAt?: { toDate(): Date } };
          if (hd?.status !== "active") {
            legacyHoldIdsToOpen.add(hid);
            return;
          }
          const expH = hd?.expiresAt?.toDate?.();
          if (expH && expH <= nowLegacy) legacyHoldIdsToOpen.add(hid);
        });
        slots = slots.map((row) => {
          if (row.status !== "held") return row;
          const hid = legacySlotHoldIdByDocId.get(row.id);
          if (hid && legacyHoldIdsToOpen.has(hid)) return { ...row, status: "open" as const };
          return row;
        });
      } catch (legacyHoldErr) {
        console.warn(
          "[slots] legacy boat held-slot hold resolution failed:",
          legacyHoldErr instanceof Error ? legacyHoldErr.message : legacyHoldErr,
        );
      }
    }

    if (legacyBlocksIncomplete) {
      slots = slots.map((s) => ({
        ...s,
        status: conservativeOpenSlotStatus(s.status as "open" | "blocked" | "booked", true),
      }));
    } else {
      slots = slots.map((s) => {
        const slotStartMs = new Date(s.startAt).getTime();
        const slotEndMs = new Date(s.endAt).getTime();
        const overlapped = legacyBlockRanges.some((r) => slotStartMs < r.end && slotEndMs > r.start);
        if (overlapped && (s.status === "open" || s.status === "held")) {
          return { ...s, status: "blocked" as const };
        }
        return s;
      });
    }

    slots = slots.map((s) => {
      const sMs = new Date(s.startAt).getTime();
      const eMs = new Date(s.endAt).getTime();
      const hitBook = legacyBookedIntervals.find((b) => legacyIvOverlaps(sMs, eMs, b.startMs, b.endMs));
      if (hitBook) {
        return { ...s, status: "booked", bookingId: hitBook.bookingId };
      }
      const hitHold = legacyHeldIntervals.some((h) => legacyIvOverlaps(sMs, eMs, h.startMs, h.endMs));
      if (hitHold && s.status === "open") {
        return { ...s, status: "blocked" };
      }
      return s;
    });

    const legacyResponseHeaders: Record<string, string> = {
      ...NO_STORE_HEADERS,
      "X-Slots-Generated-At": generatedAtIso,
      ...((legacyBlocksIncomplete || legacyQueryHitLimitBoat) ? { "X-Slots-Partial-Data": "true" } : {}),
    };
    return NextResponse.json(
      { slots, ...((legacyBlocksIncomplete || legacyQueryHitLimitBoat) ? { partialData: true } : {}) },
      { headers: legacyResponseHeaders },
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
