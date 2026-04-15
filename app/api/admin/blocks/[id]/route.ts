import { type NextRequest, NextResponse } from "next/server";
import { getAdminEmailFromSessionCookie, requireAdminSession } from "@/lib/admin-auth-firebase";
import { writeAdminAuditLog } from "@/lib/booking/admin-audit-log";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { findBlockConflicts } from "@/lib/booking/block-conflict-check";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import { findOverlappingAdminBlocksForWrite } from "@/lib/booking/admin-block-overlap";

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
    const { Timestamp, FieldValue } = getFirestoreExports();
    const ref = db.collection("blocks").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Block not found" }, { status: 404 });
    }
    const current = snap.data() as {
      experienceId?: string;
      boatId?: string | null;
    };
    const experienceId = typeof current.experienceId === "string" ? current.experienceId.trim() : "";
    if (!experienceId) {
      return NextResponse.json({ error: "Block is missing experienceId" }, { status: 400 });
    }
    const expSnap = await db.collection("experiences").doc(experienceId).get();
    const experienceSlug =
      expSnap.exists && typeof (expSnap.data() as { slug?: string })?.slug === "string"
        ? (expSnap.data() as { slug: string }).slug.trim()
        : "";
    const variantIds = getExperienceIdVariants(experienceId, experienceSlug);
    const conflicts = await findBlockConflicts({
      db,
      variantIds,
      blockStart: startAt,
      blockEnd: endAt,
      boatId: typeof current.boatId === "string" ? current.boatId.trim() || null : null,
      excludeBlockId: id,
      now: new Date(),
    });
    if (conflicts.length > 0) {
      return NextResponse.json(
        { error: "Block overlaps active holds or bookings", conflicts },
        { status: 409 }
      );
    }
    const boatForScope =
      typeof current.boatId === "string" ? current.boatId.trim() || null : null;
    const blockOverlaps = await findOverlappingAdminBlocksForWrite({
      db,
      Timestamp,
      experienceId,
      experienceSlug,
      variantIds,
      intervalStart: startAt,
      intervalEnd: endAt,
      boatId: boatForScope,
      excludeBlockId: id,
    });
    if (blockOverlaps.length > 0) {
      return NextResponse.json(
        { error: "This time range overlaps an existing admin block", blockOverlaps },
        { status: 409 }
      );
    }
    await ref.update({
      startAt: Timestamp.fromDate(startAt),
      endAt: Timestamp.fromDate(endAt),
      note: note ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    const adminEmail = await getAdminEmailFromSessionCookie(request.headers.get("cookie"));
    void writeAdminAuditLog("block_update", {
      blockId: id,
      experienceId,
      boatId: typeof current.boatId === "string" ? current.boatId.trim() || null : null,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      adminEmail,
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
    const pre = snap.data() as {
      experienceId?: string;
      boatId?: string | null;
      startAt?: { toDate?: () => Date };
      endAt?: { toDate?: () => Date };
    };
    const adminEmail = await getAdminEmailFromSessionCookie(request.headers.get("cookie"));
    await db.collection("blocks").doc(id).delete();
    void writeAdminAuditLog("block_delete", {
      blockId: id,
      experienceId: typeof pre.experienceId === "string" ? pre.experienceId : null,
      boatId: typeof pre.boatId === "string" ? pre.boatId.trim() || null : pre.boatId ?? null,
      startAt: pre.startAt?.toDate?.()?.toISOString() ?? null,
      endAt: pre.endAt?.toDate?.()?.toISOString() ?? null,
      adminEmail,
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error("[admin/blocks DELETE]", err);
    return NextResponse.json({ error: "Failed to delete block" }, { status: 500 });
  }
}
