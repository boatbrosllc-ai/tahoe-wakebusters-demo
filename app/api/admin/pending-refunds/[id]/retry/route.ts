import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { requireFeatureResponse } from "@/lib/plan";

export async function POST(request: NextRequest, {
  params }: { params: Promise<{ id: string }> }) {
  // PLAN_FEATURE_GATE
  {
    const planDenied = requireFeatureResponse("advancedRefunds");
    if (planDenied) return planDenied;
  }

  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    const db = getDb();
    const { Timestamp, FieldValue } = getFirestoreExports();
    const ref = db.collection("pendingRefunds").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await ref.update({
      status: "pending",
      processorAttempts: 0,
      nextRetryAt: Timestamp.now(),
      lastProcessorError: FieldValue.delete(),
      requiresReview: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebaseConfig ? 503 : 500 }
    );
  }
}
