/**
 * Unblock a single slot (admin). Deletes the block doc that was created for this slot.
 * POST body: { experienceId, slotId, boatId?: string }
 * Finds block where experienceId, boatId, slotId match and deletes it.
 * Auth: middleware (admin path) + Bearer BLOCK_SECRET or valid admin session cookie (defence-in-depth).
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { parseSlotId } from "@/lib/booking/experience-slots";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { timingSafeStringEqual } from "@/lib/booking/secure-compare";

async function isAllowed(request: NextRequest): Promise<boolean> {
  const secret = process.env.BLOCK_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  if (secret && timingSafeStringEqual(auth, `Bearer ${secret}`)) return true;
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  return unauthorized === null;
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isAllowed(request))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await request.json();
    const experienceId = typeof body?.experienceId === "string" ? body.experienceId : null;
    const slotId = typeof body?.slotId === "string" ? body.slotId : null;
    const boatId = typeof body?.boatId === "string" ? body.boatId.trim() || null : null;
    if (!experienceId || !slotId) {
      return NextResponse.json({ error: "experienceId and slotId required" }, { status: 400 });
    }
    if (!parseSlotId(slotId)) {
      return NextResponse.json({ error: "Invalid slotId format" }, { status: 400 });
    }
    const db = getDb();

    const expSnap = await db.collection("experiences").doc(experienceId).get();
    const experienceSlug =
      expSnap.exists && typeof (expSnap.data() as { slug?: unknown })?.slug === "string"
        ? String((expSnap.data() as { slug: string }).slug).trim()
        : "";
    const variantIds = getExperienceIdVariants(experienceId, experienceSlug);
    const blocksRef = db.collection("blocks");
    const snaps = await Promise.all(
      variantIds.map((variantId) =>
        boatId
          ? blocksRef.where("experienceId", "==", variantId).where("slotId", "==", slotId).where("boatId", "==", boatId).get()
          : blocksRef.where("experienceId", "==", variantId).where("slotId", "==", slotId).get()
      )
    );
    const docsById = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    for (const snap of snaps) {
      for (const doc of snap.docs) docsById.set(doc.id, doc);
    }
    if (docsById.size === 0) {
      return NextResponse.json({ ok: true, message: "No block found for this slot" });
    }
    const batch = db.batch();
    for (const doc of Array.from(docsById.values())) {
      batch.delete(doc.ref);
    }
    await batch.commit();
    return NextResponse.json({ ok: true, slotId, boatId, blocksDeleted: docsById.size });
  } catch (err) {
    console.error("[admin/blocks/unblock-slot]", err);
    return NextResponse.json({ error: "Failed to unblock slot" }, { status: 500 });
  }
}
