import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const active = typeof body.active === "boolean" ? body.active : undefined;

    if (active === undefined) {
      return NextResponse.json({ error: "Body must include active: true | false" }, { status: 400 });
    }

    const db = getDb();
    const { FieldValue } = getFirestoreExports();
    const ref = db.collection("discounts").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Discount not found" }, { status: 404 });
    }

    await ref.update({ active, updatedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ ok: true, active });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebase = /firebase|FIREBASE|config missing|credential/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebase && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebase ? 503 : 500 }
    );
  }
}
