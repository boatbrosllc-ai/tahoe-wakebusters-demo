/**
 * Pricing calendar: overrides by boat type + date (hourly rate in cents).
 * GET ?boatType=pontoon&start=2026-05-01&end=2026-05-31
 * POST { boatType, dates: string[], hourlyRateCents } to set
 * POST { boatType, dates: string[], reset: true } to remove overrides for those dates
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { ALLOWED_BOAT_TYPES } from "@/lib/booking/boat-types";

const COLLECTION = "pricingCalendar";

async function applyPricingCalendarDateUpdates(input: {
  boatType: string;
  dates: string[];
  reset: boolean;
  hourlyRateCents?: number;
}): Promise<void> {
  const db = getDb();
  const { FieldValue } = getFirestoreExports();
  const ref = db.collection(COLLECTION).doc(input.boatType);
  const updates: Record<string, number | ReturnType<typeof FieldValue.delete>> = {};
  for (const d of input.dates) {
    updates[`rates.${d}`] = input.reset ? FieldValue.delete() : (input.hourlyRateCents as number);
  }
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) tx.set(ref, {}, { merge: true });
    tx.set(ref, updates, { merge: true });
  });
}

async function getActiveHoldsOnAffectedDates(boatType: string, dates: string[]): Promise<number> {
  if (dates.length === 0) return 0;
  const db = getDb();
  const sortedDates = [...dates].sort();
  const minDate = sortedDates[0];
  const maxDate = sortedDates[sortedDates.length - 1];
  const dateSet = new Set(sortedDates);
  const holdsSnap = await db
    .collection("holds")
    .where("status", "==", "active")
    .where("startDateStr", ">=", minDate)
    .where("startDateStr", "<=", maxDate)
    .limit(500)
    .get();
  if (holdsSnap.empty) return 0;
  const holdRows = holdsSnap.docs.map((d) => d.data() as { boatId?: string; startDateStr?: string });
  const boatIds = Array.from(
    new Set(holdRows.map((h) => (typeof h.boatId === "string" ? h.boatId.trim() : "")).filter(Boolean))
  );
  const boatTypeById = new Map<string, string>();
  await Promise.all(
    boatIds.map(async (id) => {
      const boatSnap = await db.collection("boats").doc(id).get();
      if (!boatSnap.exists) return;
      const bt = (boatSnap.data() as { boatType?: string }).boatType;
      if (typeof bt === "string" && bt.trim()) boatTypeById.set(id, bt.trim());
    })
  );
  let count = 0;
  for (const hold of holdRows) {
    const date = typeof hold.startDateStr === "string" ? hold.startDateStr : "";
    const boatId = typeof hold.boatId === "string" ? hold.boatId.trim() : "";
    if (!dateSet.has(date) || !boatId) continue;
    if (boatTypeById.get(boatId) === boatType) count++;
  }
  return count;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const boatType = request.nextUrl.searchParams.get("boatType");
  const start = request.nextUrl.searchParams.get("start");
  const end = request.nextUrl.searchParams.get("end");
  if (!boatType?.trim() || !start || !end) {
    return NextResponse.json({ error: "boatType, start, end required (YYYY-MM-DD)" }, { status: 400 });
  }
  if (!ALLOWED_BOAT_TYPES.has(boatType.trim())) {
    return NextResponse.json({ error: "Invalid boatType; allowed: pontoon, wake, tritoon" }, { status: 400 });
  }

  try {
    const db = getDb();
    const doc = await db.collection(COLLECTION).doc(boatType.trim()).get();
    const rates = (doc.exists ? doc.data()?.rates : undefined) as Record<string, number> | undefined;
    const overrides: Record<string, number> = {};
    if (rates && typeof rates === "object") {
      for (const [dateStr, cents] of Object.entries(rates)) {
        if (typeof cents === "number" && dateStr >= start && dateStr <= end) overrides[dateStr] = cents;
      }
    }
    return NextResponse.json({ overrides });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebase = /firebase|FIREBASE|config|credential/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebase && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebase ? 503 : 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const boatType = typeof b.boatType === "string" ? b.boatType.trim() : null;
  const dates = Array.isArray(b.dates) ? (b.dates as unknown[]).filter((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d as string)) as string[] : [];
  const reset = b.reset === true;
  const confirmZeroDollarOverride = b.confirmZeroDollarOverride === true;
  const acknowledgeActiveHolds = b.acknowledgeActiveHolds === true;

  if (!boatType || dates.length === 0) {
    return NextResponse.json({ error: "boatType and dates[] required" }, { status: 400 });
  }
  if (!ALLOWED_BOAT_TYPES.has(boatType)) {
    return NextResponse.json({ error: "Invalid boatType; allowed: pontoon, wake, tritoon" }, { status: 400 });
  }

  try {
    const activeHoldsOnAffectedDates = await getActiveHoldsOnAffectedDates(boatType, dates);
    if (activeHoldsOnAffectedDates > 0 && !acknowledgeActiveHolds) {
      return NextResponse.json(
        {
          error:
            "Active holds exist on one or more affected dates. Re-submit with acknowledgeActiveHolds=true to confirm this update.",
          activeHoldsOnAffectedDates,
          warning:
            "Pricing updates apply immediately to new holds. Active holds already in progress keep their quoted price.",
          forceRequired: true,
        },
        { status: 409 }
      );
    }
    if (reset) {
      await applyPricingCalendarDateUpdates({
        boatType,
        dates,
        reset: true,
      });
      return NextResponse.json({
        ok: true,
        reset: true,
        dates,
        activeHoldsOnAffectedDates,
        ...(activeHoldsOnAffectedDates > 0
          ? {
              warning:
                "Active holds exist on affected dates; reset applies to new holds, while active holds keep their original quoted price.",
            }
          : {}),
      });
    }

    const hourlyRateCents = typeof b.hourlyRateCents === "number" && b.hourlyRateCents >= 0 ? b.hourlyRateCents : null;
    if (hourlyRateCents === null) {
      return NextResponse.json({ error: "hourlyRateCents required (number, cents per hour)" }, { status: 400 });
    }
    if (hourlyRateCents === 0 && !confirmZeroDollarOverride) {
      return NextResponse.json(
        {
          error:
            "hourlyRateCents=0 requires explicit confirmZeroDollarOverride=true. Minimum recommended value is 1 cent.",
        },
        { status: 400 }
      );
    }
    if (hourlyRateCents <= 0 && !confirmZeroDollarOverride) {
      return NextResponse.json(
        { error: "hourlyRateCents must be > 0 (minimum 1) unless confirmZeroDollarOverride=true" },
        { status: 400 }
      );
    }

    await applyPricingCalendarDateUpdates({
      boatType,
      dates,
      reset: false,
      hourlyRateCents,
    });
    return NextResponse.json({
      ok: true,
      dates,
      hourlyRateCents,
      activeHoldsOnAffectedDates,
      ...(activeHoldsOnAffectedDates > 0
        ? {
            warning:
              "Active holds exist on affected dates; updates apply to new holds, while active holds keep their original quoted price.",
          }
        : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebase = /firebase|FIREBASE|config|credential/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebase && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebase ? 503 : 500 }
    );
  }
}
