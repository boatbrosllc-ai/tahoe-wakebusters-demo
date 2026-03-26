import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getSlotStartEnd } from "@/lib/booking/experience-slots";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import {
  addCalendarDaysToDateStr,
  bookingIntervalMsFromSlotFields,
  bookingLookbackDaysFromMaxDuration,
  intervalsOverlapMs,
} from "@/lib/booking/booking-interval";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";
import type { Block } from "@/lib/booking/types";

function toIso(ts: { toDate?: () => Date; seconds?: number }): string | null {
  if (ts.toDate) return ts.toDate().toISOString();
  if (typeof (ts as { seconds?: number }).seconds === "number") return new Date((ts as { seconds: number }).seconds * 1000).toISOString();
  return null;
}

/** GET: list blocks in range. Query: experienceId, from (YYYY-MM-DD or ISO), to (YYYY-MM-DD or ISO), boatId (optional). Includes slug variants so blocks created under a variant experienceId are returned. */
export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const experienceId = request.nextUrl.searchParams.get("experienceId");
    const fromParam = request.nextUrl.searchParams.get("from");
    const toParam = request.nextUrl.searchParams.get("to");
    const boatIdParam = request.nextUrl.searchParams.get("boatId");
    if (!experienceId || !fromParam || !toParam) {
      return NextResponse.json({ error: "experienceId, from, to required" }, { status: 400 });
    }
    const fromStr = fromParam.slice(0, 10);
    const toStr = toParam.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
      return NextResponse.json({ error: "Invalid from/to dates" }, { status: 400 });
    }
    const { start: rangeStart } = getSlotStartEnd(fromStr, 0, 0, 0);
    const { end: rangeEnd } = getSlotStartEnd(toStr, 23, 1, 59);

    const db = getDb();
    const { Timestamp } = getFirestoreExports();

    const expSnap = await db.collection("experiences").doc(experienceId).get();
    const experienceSlug = expSnap.exists && typeof (expSnap.data() as { slug?: string })?.slug === "string"
      ? (expSnap.data() as { slug: string }).slug.trim()
      : "";
    const variantIds = getExperienceIdVariants(experienceId, experienceSlug);

    const blocksSnaps = await Promise.all(
      variantIds.map((variantId) =>
        db
          .collection("blocks")
          .where("experienceId", "==", variantId)
          .where("startAt", "<=", Timestamp.fromDate(rangeEnd))
          .get()
      )
    );
    const seenBlockIds = new Set<string>();
    const docs: import("firebase-admin/firestore").QueryDocumentSnapshot[] = [];
    for (const snap of blocksSnaps) {
      for (const doc of snap.docs) {
        if (seenBlockIds.has(doc.id)) continue;
        seenBlockIds.add(doc.id);
        docs.push(doc);
      }
    }

    const blocks = docs
      .map((doc) => {
        const b = doc.data() as Block & { startAt: { toDate(): Date }; endAt: { toDate(): Date }; createdAt: { toDate(): Date } };
        const startAt = b.startAt?.toDate?.();
        const endAt = b.endAt?.toDate?.();
        if (!startAt || !endAt) return null;
        if (endAt.getTime() < rangeStart.getTime()) return null;
        if (boatIdParam && b.boatId !== boatIdParam) return null;
        return {
          id: doc.id,
          experienceId: b.experienceId,
          boatId: b.boatId ?? null,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          note: b.note ?? null,
          slotId: b.slotId ?? null,
          createdAt: toIso(b.createdAt as { toDate?: () => Date; seconds?: number }),
        };
      })
      .filter(Boolean) as {
      id: string;
      experienceId: string;
      boatId: string | null;
      startAt: string;
      endAt: string;
      note: string | null;
      slotId: string | null;
      createdAt: string | null;
    }[];

    blocks.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return NextResponse.json(blocks);
  } catch (err) {
    console.error("[admin/blocks GET]", err);
    return NextResponse.json({ error: "Failed to list blocks" }, { status: 500 });
  }
}

/** POST: create one block. Body: experienceId, boatId?, startAt (ISO), endAt (ISO), note?, slotId? */
export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const experienceId = typeof body?.experienceId === "string" ? body.experienceId : null;
    const startAtRaw = typeof body?.startAt === "string" ? body.startAt : null;
    const endAtRaw = typeof body?.endAt === "string" ? body.endAt : null;
    const boatId = typeof body?.boatId === "string" ? body.boatId.trim() || null : null;
    const note = typeof body?.note === "string" ? body.note.trim() || null : null;
    const slotId = typeof body?.slotId === "string" ? body.slotId.trim() || null : null;
    if (!experienceId || !startAtRaw || !endAtRaw) {
      return NextResponse.json({ error: "experienceId, startAt, endAt required" }, { status: 400 });
    }
    const startAt = new Date(startAtRaw);
    const endAt = new Date(endAtRaw);
    if (isNaN(startAt.getTime()) || isNaN(endAt.getTime()) || startAt >= endAt) {
      return NextResponse.json({ error: "Invalid startAt/endAt" }, { status: 400 });
    }

    const db = getDb();
    const { FieldValue, Timestamp } = getFirestoreExports();
    const now = new Date();
    const blockStartMs = startAt.getTime();
    const blockEndMs = endAt.getTime();
    const startDateStr = startAt.toISOString().slice(0, 10);
    const endDateStr = endAt.toISOString().slice(0, 10);
    const lookbackDays = bookingLookbackDaysFromMaxDuration(24 * 14);
    const startDateLower = addCalendarDaysToDateStr(startDateStr, -lookbackDays);
    const startDateUpper = addCalendarDaysToDateStr(endDateStr, lookbackDays);
    const expSnap = await db.collection("experiences").doc(experienceId).get();
    const experienceSlug = expSnap.exists && typeof (expSnap.data() as { slug?: string })?.slug === "string"
      ? (expSnap.data() as { slug: string }).slug.trim()
      : "";
    const variantIds = getExperienceIdVariants(experienceId, experienceSlug);
    const holdQueryBase = db
      .collection("holds")
      .where("status", "==", "active")
      .where("expiresAt", ">=", Timestamp.fromDate(now));
    const holdSnaps = await Promise.all(
      (boatId
        ? [holdQueryBase.where("boatId", "==", boatId).get()]
        : variantIds.map((variantId) => holdQueryBase.where("experienceId", "==", variantId).get()))
    );
    const conflicts: Array<{ type: "hold" | "booking"; id: string }> = [];
    const seenConflictIds = new Set<string>();
    for (const snap of holdSnaps) {
      for (const docSnap of snap.docs) {
        const h = docSnap.data() as { slotId?: string; slot_id?: string; holdId?: string };
        const iv = bookingIntervalMsFromSlotFields(h.slotId, h.slot_id);
        if (!iv) continue;
        if (!intervalsOverlapMs(blockStartMs, blockEndMs, iv.startMs, iv.endMs)) continue;
        const key = `hold:${docSnap.id}`;
        if (seenConflictIds.has(key)) continue;
        seenConflictIds.add(key);
        conflicts.push({ type: "hold", id: docSnap.id });
      }
    }
    const bookingSnaps = await Promise.all(
      variantIds.map((variantId) =>
        db
          .collection("bookings")
          .where("experienceId", "==", variantId)
          .where("startDateStr", ">=", startDateLower)
          .where("startDateStr", "<=", startDateUpper)
          .get()
      )
    );
    for (const snap of bookingSnaps) {
      for (const docSnap of snap.docs) {
        const b = docSnap.data() as { status?: string; slotId?: string; slot_id?: string; boatId?: string };
        if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) continue;
        if (boatId && b.boatId !== boatId) continue;
        const iv = bookingIntervalMsFromSlotFields(b.slotId, b.slot_id);
        if (!iv) continue;
        if (!intervalsOverlapMs(blockStartMs, blockEndMs, iv.startMs, iv.endMs)) continue;
        const key = `booking:${docSnap.id}`;
        if (seenConflictIds.has(key)) continue;
        seenConflictIds.add(key);
        conflicts.push({ type: "booking", id: docSnap.id });
      }
    }
    if (conflicts.length > 0) {
      return NextResponse.json(
        { error: "Block overlaps active holds or bookings", conflicts },
        { status: 409 }
      );
    }
    const doc = await db.collection("blocks").add({
      experienceId,
      boatId: boatId ?? null,
      startAt: Timestamp.fromDate(startAt),
      endAt: Timestamp.fromDate(endAt),
      note: note ?? null,
      slotId: slotId ?? null,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: null,
    });

    return NextResponse.json({
      id: doc.id,
      experienceId,
      boatId: boatId ?? null,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      note: note ?? null,
      slotId: slotId ?? null,
    });
  } catch (err) {
    console.error("[admin/blocks POST]", err);
    return NextResponse.json({ error: "Failed to create block" }, { status: 500 });
  }
}
