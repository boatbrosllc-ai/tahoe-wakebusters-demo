import { NextRequest, NextResponse } from "next/server";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import type { Booking, AddonSelection } from "@/lib/booking/types";
import { parseSlotId, getSlotStartEnd } from "@/lib/booking/experience-slots";

function toDate(ts: { seconds?: number; nanoseconds?: number; toDate?: () => Date }): string | null {
  if (ts.toDate) return ts.toDate().toISOString();
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000).toISOString();
  return null;
}

/** Parse slotId (handles "2026-2-27-11-6" and "2026-02-27-11-6") for trip date and times. */
function parseSlotIdForDisplay(slotId: string | null | undefined): { dateStr: string; startHour: number; durationHours: number } | null {
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
        const { start, end } = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours);
        startTime = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        endTime = end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
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
