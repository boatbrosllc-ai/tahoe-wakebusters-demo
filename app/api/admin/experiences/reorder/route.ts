import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const body = (await request.json().catch(() => ({}))) as { experienceIdA?: string; experienceIdB?: string };
  const experienceIdA = typeof body.experienceIdA === "string" ? body.experienceIdA.trim() : "";
  const experienceIdB = typeof body.experienceIdB === "string" ? body.experienceIdB.trim() : "";
  if (!experienceIdA || !experienceIdB || experienceIdA === experienceIdB) {
    return NextResponse.json({ error: "experienceIdA and experienceIdB are required and must differ" }, { status: 400 });
  }

  try {
    const db = getDb();
    const aRef = db.collection("experiences").doc(experienceIdA);
    const bRef = db.collection("experiences").doc(experienceIdB);
    await db.runTransaction(async (tx) => {
      const [aSnap, bSnap] = await Promise.all([tx.get(aRef), tx.get(bRef)]);
      if (!aSnap.exists || !bSnap.exists) throw new Error("EXPERIENCE_NOT_FOUND");
      const aOrder = (aSnap.data() as { sortOrder?: number }).sortOrder ?? 999;
      const bOrder = (bSnap.data() as { sortOrder?: number }).sortOrder ?? 999;
      tx.update(aRef, { sortOrder: bOrder });
      tx.update(bRef, { sortOrder: aOrder });
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "EXPERIENCE_NOT_FOUND") {
      return NextResponse.json({ error: "Experience not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to reorder experiences" }, { status: 500 });
  }
}
