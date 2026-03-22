import { type NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";

function toIso(ts: { toDate?: () => Date; seconds?: number }): string | null {
  if (ts.toDate) return ts.toDate().toISOString();
  if (typeof (ts as { seconds?: number }).seconds === "number") return new Date((ts as { seconds: number }).seconds * 1000).toISOString();
  return null;
}

/** PATCH: update a block. Body: startAt (ISO), endAt (ISO), note? (string). Validates startAt < endAt. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    const body = await request.json();
    const startAtRaw = typeof body?.startAt === "string" ? body.startAt : null;
    const endAtRaw = typeof body?.endAt === "string" ? body.endAt : null;
    const note = typeof body?.note === "string" ? body.note.trim() || null : null;
    if (!startAtRaw || !endAtRaw) {
      return NextResponse.json({ error: "startAt and endAt required" }, { status: 400 });
    }
    const startAt = new Date(startAtRaw);
    const endAt = new Date(endAtRaw);
    if (isNaN(startAt.getTime()) || isNaN(endAt.getTime()) || startAt >= endAt) {
      return NextResponse.json({ error: "Invalid startAt/endAt" }, { status: 400 });
    }

    const db = getDb();
    const { Timestamp } = getFirestoreExports();
    const ref = db.collection("blocks").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Block not found" }, { status: 404 });
    }
    await ref.update({
      startAt: Timestamp.fromDate(startAt),
      endAt: Timestamp.fromDate(endAt),
      note: note ?? null,
    });
    const updated = (await ref.get()).data() as {
      experienceId?: string;
      boatId?: string | null;
      startAt: { toDate(): Date };
      endAt: { toDate(): Date };
      note: string | null;
      slotId?: string | null;
      createdAt?: { toDate?: () => Date; seconds?: number };
    };
    return NextResponse.json({
      id,
      experienceId: updated.experienceId ?? null,
      boatId: updated.boatId ?? null,
      startAt: updated.startAt?.toDate?.()?.toISOString() ?? startAt.toISOString(),
      endAt: updated.endAt?.toDate?.()?.toISOString() ?? endAt.toISOString(),
      note: updated.note ?? null,
      slotId: updated.slotId ?? null,
      createdAt: toIso(updated.createdAt as { toDate?: () => Date; seconds?: number }),
    });
  } catch (err) {
    console.error("[admin/blocks PATCH]", err);
    return NextResponse.json({ error: "Failed to update block" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    const db = getDb();
    const snap = await db.collection("blocks").doc(id).get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Block not found" }, { status: 404 });
    }
    await db.collection("blocks").doc(id).delete();
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error("[admin/blocks DELETE]", err);
    return NextResponse.json({ error: "Failed to delete block" }, { status: 500 });
  }
}
