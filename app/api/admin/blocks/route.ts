import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import type { Block } from "@/lib/booking/types";

function toIso(ts: { toDate?: () => Date; seconds?: number }): string | null {
  if (ts.toDate) return ts.toDate().toISOString();
  if (typeof (ts as { seconds?: number }).seconds === "number") return new Date((ts as { seconds: number }).seconds * 1000).toISOString();
  return null;
}

/** GET: list blocks in range. Query: experienceId, from (YYYY-MM-DD or ISO), to (YYYY-MM-DD or ISO), boatId (optional). */
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
    const rangeStart = new Date(fromParam.includes("T") ? fromParam : fromParam + "T00:00:00");
    const rangeEnd = new Date(toParam.includes("T") ? toParam : toParam + "T23:59:59.999");
    if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime())) {
      return NextResponse.json({ error: "Invalid from/to dates" }, { status: 400 });
    }

    const db = getDb();
    const { Timestamp } = getFirestoreExports();
    let q = db
      .collection("blocks")
      .where("experienceId", "==", experienceId)
      .where("startAt", ">=", Timestamp.fromDate(rangeStart))
      .where("startAt", "<=", Timestamp.fromDate(rangeEnd));
    const snap = await q.get();

    const blocks = snap.docs
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
