import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { hasFirebaseConfig } from "@/lib/booking/env";
import { checkRateLimitPublicRead, getClientKey } from "@/lib/booking/rate-limit";
import { parseSlotIdRelaxed } from "@/lib/booking/experience-slots";
import { addCalendarDaysToDateStr, bookingLookbackDaysFromMaxDuration } from "@/lib/booking/booking-interval";
import type { Experience } from "@/lib/booking/types";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";
import { warnIfLegacyHoldsFallbackEnabled } from "@/lib/booking/legacy-fallback-warn";
import { getMaxGuestsForExperience } from "@/lib/booking/experience-capacity";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
import {
  LEGACY_HOLDS_CONSERVATIVE_AVAILABILITY_NOTE,
  mergeLegacyHoldDocsWithOptionalBackfill,
  scanLegacyActiveHoldsForExperience,
} from "@/lib/booking/legacy-hold-scan";
import { bookingNotReadyResponse, legacyFallbackUnsafeResponse } from "@/lib/booking/booking-readiness-response";

export const dynamic = "force-dynamic";

const MAX_PAGES = 5;

export interface TicketAvailabilityResponse {
  total: number;
  sold: number;
  onHold: number;
  available: number;
  /** True when a charter booking locks the whole departure date (no shared ticket capacity). */
  charterLocked?: boolean;
  /** True when legacy holds scan was truncated; UI should show `availabilityNote` instead of treating `available` as exact. */
  conservativeEstimate?: boolean;
  /** When `conservativeEstimate` is true, show this message instead of the numeric `available` count. */
  availabilityNote?: string;
}

const CONSERVATIVE_AVAILABILITY_NOTE = LEGACY_HOLDS_CONSERVATIVE_AVAILABILITY_NOTE;

export async function GET(request: NextRequest) {
  try {
    const notReady = bookingNotReadyResponse();
    if (notReady) return notReady;
    const legacyUnsafe = legacyFallbackUnsafeResponse();
    if (legacyUnsafe) return legacyUnsafe;
    if (!hasFirebaseConfig()) {
      return NextResponse.json({ error: "Booking not configured." }, { status: 503 });
    }
    const rl = await checkRateLimitPublicRead(getClientKey(request));
    if (!rl.allowed) {
      const retryAfter = rl.retryAfterMs ? Math.ceil(rl.retryAfterMs / 1000) : 60;
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }
    const experienceId = request.nextUrl.searchParams.get("experienceId");
    const date = request.nextUrl.searchParams.get("date"); // YYYY-MM-DD
    if (!experienceId || !date) {
      return NextResponse.json({ error: "experienceId and date are required." }, { status: 400 });
    }

    const db = getDb();

    const expDoc = await db.collection("experiences").doc(experienceId).get();
    if (!expDoc.exists) {
      return NextResponse.json({ error: "Experience not found." }, { status: 404 });
    }
    const exp = expDoc.data() as Experience & { slug?: string };
    const expSlug = exp?.slug ?? "";
    const allExpIds = getExperienceIdVariants(experienceId, expSlug);
    const ticketRangeStart = addCalendarDaysToDateStr(
      date,
      -bookingLookbackDaysFromMaxDuration(24 * 14),
    );

    // Set DISABLE_LEGACY_HOLDS_FALLBACK=true once all holds have startDateStr to skip the extra query.
    const legacyFallbackEnabled = process.env.DISABLE_LEGACY_HOLDS_FALLBACK !== "true";
    if (legacyFallbackEnabled) warnIfLegacyHoldsFallbackEnabled();

    const [bookingsSnaps, holdsSnaps, legacyHoldsResult] = await Promise.all([
      Promise.all(
        allExpIds.map((id) =>
          db
            .collection("bookings")
            .where("experienceId", "==", id)
            .where("startDateStr", ">=", ticketRangeStart)
            .where("startDateStr", "<=", date)
            .get()
        )
      ),
      Promise.all(
        allExpIds.map((id) =>
          db
            .collection("holds")
            .where("experienceId", "==", id)
            .where("status", "==", "active")
            .where("startDateStr", ">=", ticketRangeStart)
            .where("startDateStr", "<=", date)
            .get()
        )
      ),
      legacyFallbackEnabled
        ? Promise.all(allExpIds.map((id) => scanLegacyActiveHoldsForExperience(db, id, { maxPages: MAX_PAGES })))
        : Promise.resolve(
            [] as Awaited<ReturnType<typeof scanLegacyActiveHoldsForExperience>>[]
          ),
    ]);

    const total = getMaxGuestsForExperience({
      pricingType: exp.pricingType,
      maxCapacity: exp.maxCapacity,
      maxGuests: exp.maxGuests,
      slug: exp.slug,
      title: exp.title,
    });

    // Merge primary and legacy hold docs; dedup by id; backfill missing startDateStr.
    const holdDocMap = new Map<string, import("firebase-admin").firestore.QueryDocumentSnapshot>();
    for (const snap of holdsSnaps) {
      for (const doc of snap.docs) holdDocMap.set(doc.id, doc);
    }
    const legacyHoldsPartial =
      Array.isArray(legacyHoldsResult) && legacyHoldsResult.some((r) => r.partial);
    const legacyDocsFlat = Array.isArray(legacyHoldsResult)
      ? legacyHoldsResult.flatMap((r) => r.docs)
      : [];
    mergeLegacyHoldDocsWithOptionalBackfill(holdDocMap, legacyDocsFlat);

    const now = Date.now();
    const seenBookingIds = new Set<string>();
    let sold = 0;
    let charterLockedForDate = false;
    for (const snap of bookingsSnaps) {
      for (const doc of snap.docs) {
        if (seenBookingIds.has(doc.id)) continue;
        seenBookingIds.add(doc.id);
        const b = doc.data() as {
          slotId?: string;
          slot_id?: string;
          partySize?: number;
          status?: string;
          bookingMode?: string;
        };
        const slotRawB = b.slotId ?? b.slot_id;
        if (!slotRawB || typeof b.partySize !== "number") continue;
        if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) continue;
        const parsed = parseSlotIdRelaxed(slotRawB);
        if (!parsed || parsed.dateStr !== date) continue;
        if (b.bookingMode === "charter") {
          charterLockedForDate = true;
          continue;
        }
        sold += b.partySize;
      }
    }

    let onHold = 0;
    for (const doc of Array.from(holdDocMap.values())) {
      const h = doc.data() as {
        slotId?: string;
        slot_id?: string;
        startDateStr?: string;
        partySize?: number;
        status?: string;
        bookingMode?: string;
        expiresAt?: { toDate(): Date };
      };
      const slotRawH = h.slotId ?? h.slot_id;
      if (!slotRawH || typeof h.partySize !== "number") continue;
      if (h.status !== "active") continue;
      if (h.expiresAt && h.expiresAt.toDate().getTime() < now) continue;
      const holdDate = h.startDateStr ?? parseSlotIdRelaxed(slotRawH)?.dateStr;
      if (holdDate !== date) continue;
      if (h.bookingMode === "charter") continue;
      onHold += h.partySize;
    }

    let available = charterLockedForDate ? 0 : Math.max(0, total - sold - onHold);
    let conservativeEstimate = false;
    if (legacyHoldsPartial) {
      conservativeEstimate = true;
      available = charterLockedForDate ? 0 : Math.max(0, total - sold - onHold);
      void writeOperationalAlert({
        type: "ticket_availability_legacy_holds_truncated",
        experienceId,
        date,
        source: "ticket-availability",
        maxPages: MAX_PAGES,
      }).catch(() => {});
    }

    const response: TicketAvailabilityResponse = {
      total,
      sold,
      onHold,
      available,
      ...(charterLockedForDate ? { charterLocked: true as const } : {}),
      ...(conservativeEstimate
        ? { conservativeEstimate: true as const, availabilityNote: CONSERVATIVE_AVAILABILITY_NOTE }
        : {}),
    };
    const headers: Record<string, string> = { "Cache-Control": "no-store, max-age=0" };
    if (legacyHoldsPartial) {
      headers["X-Slots-Partial-Data"] = "true";
    }
    return NextResponse.json(response, { headers });
  } catch (err) {
    console.error("[ticket-availability]", err);
    return NextResponse.json({ error: "Failed to load ticket availability." }, { status: 500 });
  }
}
