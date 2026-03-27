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

export async function applyPricingCalendarDateUpdates(input: {
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

  if (!boatType || dates.length === 0) {
    return NextResponse.json({ error: "boatType and dates[] required" }, { status: 400 });
  }
  if (!ALLOWED_BOAT_TYPES.has(boatType)) {
    return NextResponse.json({ error: "Invalid boatType; allowed: pontoon, wake, tritoon" }, { status: 400 });
  }

  try {
    if (reset) {
      await applyPricingCalendarDateUpdates({
        boatType,
        dates,
        reset: true,
      });
      return NextResponse.json({ ok: true, reset: true, dates });
    }

    const hourlyRateCents = typeof b.hourlyRateCents === "number" && b.hourlyRateCents >= 0 ? b.hourlyRateCents : null;
    if (hourlyRateCents === null) {
      return NextResponse.json({ error: "hourlyRateCents required (number, cents per hour)" }, { status: 400 });
    }

    await applyPricingCalendarDateUpdates({
      boatType,
      dates,
      reset: false,
      hourlyRateCents,
    });
    return NextResponse.json({ ok: true, dates, hourlyRateCents });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebase = /firebase|FIREBASE|config|credential/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebase && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebase ? 503 : 500 }
    );
  }
}
