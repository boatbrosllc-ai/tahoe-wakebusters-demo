import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import type { Block } from "@/lib/booking/types";

function toIso(ts: { toDate?: () => Date; seconds?: number }): string | null {
  if (ts.toDate) return ts.toDate().toISOString();
  if (typeof (ts as { seconds?: number }).seconds === "number") return new Date((ts as { seconds: number }).seconds * 1000).toISOString();
  return null;
}

/** GET one block */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Block id required" }, { status: 400 });

  try {
    const db = getDb();
    const doc = await db.collection("blocks").doc(id).get();
    if (!doc.exists) return NextResponse.json({ error: "Block not found" }, { status: 404 });
    const b = doc.data() as Block & { startAt: { toDate(): Date }; endAt: { toDate(): Date }; createdAt: { toDate(): Date } };
    const startAt = b.startAt?.toDate?.();
    const endAt = b.endAt?.toDate?.();
    return NextResponse.json({
      id: doc.id,
      experienceId: b.experienceId,
      boatId: b.boatId ?? null,
      startAt: startAt?.toISOString() ?? null,
      endAt: endAt?.toISOString() ?? null,
      note: b.note ?? null,
      slotId: b.slotId ?? null,
      createdAt: toIso(b.createdAt as { toDate?: () => Date; seconds?: number }),
    });
  } catch (err) {
    console.error("[admin/blocks/[id] GET]", err);
    return NextResponse.json({ error: "Failed to get block" }, { status: 500 });
  }
}

/** PATCH: update block (startAt, endAt, note) */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Block id required" }, { status: 400 });

  try {
    const body = await request.json();
    const db = getDb();
    const ref = db.collection("blocks").doc(id);
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ error: "Block not found" }, { status: 404 });

    const updates: Record<string, unknown> = {};
    if (typeof body?.startAt === "string") {
      const d = new Date(body.startAt);
      if (!isNaN(d.getTime())) updates.startAt = d;
    }
    if (typeof body?.endAt === "string") {
      const d = new Date(body.endAt);
      if (!isNaN(d.getTime())) updates.endAt = d;
    }
    if (body && "note" in body) updates.note = typeof body.note === "string" ? body.note : null;
    if (Object.keys(updates).length === 0) {
      const b = doc.data() as Block & { startAt: { toDate(): Date }; endAt: { toDate(): Date } };
      return NextResponse.json({
        id: doc.id,
        experienceId: b.experienceId,
        boatId: b.boatId ?? null,
        startAt: b.startAt?.toDate?.()?.toISOString() ?? null,
        endAt: b.endAt?.toDate?.()?.toISOString() ?? null,
        note: b.note ?? null,
        slotId: b.slotId ?? null,
      });
    }

    const { Timestamp } = getFirestoreExports();
    const write: Record<string, unknown> = {};
    if (updates.startAt) write.startAt = Timestamp.fromDate(updates.startAt as Date);
    if (updates.endAt) write.endAt = Timestamp.fromDate(updates.endAt as Date);
    if ("note" in updates) write.note = updates.note;
    await ref.update(write);

    const updated = await ref.get();
    const b = updated.data() as Block & { startAt: { toDate(): Date }; endAt: { toDate(): Date }; createdAt: { toDate(): Date } };
    return NextResponse.json({
      id: updated.id,
      experienceId: b.experienceId,
      boatId: b.boatId ?? null,
      startAt: b.startAt?.toDate?.()?.toISOString() ?? null,
      endAt: b.endAt?.toDate?.()?.toISOString() ?? null,
      note: b.note ?? null,
      slotId: b.slotId ?? null,
      createdAt: toIso(b.createdAt as { toDate?: () => Date; seconds?: number }),
    });
  } catch (err) {
    console.error("[admin/blocks/[id] PATCH]", err);
    return NextResponse.json({ error: "Failed to update block" }, { status: 500 });
  }
}

/** DELETE block */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Block id required" }, { status: 400 });

  try {
    const db = getDb();
    const ref = db.collection("blocks").doc(id);
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ error: "Block not found" }, { status: 404 });
    await ref.delete();
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error("[admin/blocks/[id] DELETE]", err);
    return NextResponse.json({ error: "Failed to delete block" }, { status: 500 });
  }
}
