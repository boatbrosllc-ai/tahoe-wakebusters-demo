import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import type { PendingRefund } from "@/lib/booking/types";

function toDate(ts: { seconds?: number; toDate?: () => Date }): Date | null {
  if (ts.toDate) return ts.toDate();
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000);
  return null;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const db = getDb();
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/9217380b-37cf-4275-ae62-01f686adc624", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "app/api/admin/pending-refunds/route.ts:GET",
        message: "pendingRefunds parallel query start",
        hypothesisId: "H1",
        data: { query: "pending+status+orderByCreatedAt+failedStatus" },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    const [snap, failedSnap] = await Promise.all([
      db
        .collection("pendingRefunds")
        .where("status", "==", "pending")
        .orderBy("createdAt", "desc")
        .limit(100)
        .get(),
      db.collection("pendingRefunds").where("status", "==", "failed").limit(50).get(),
    ]);

    const refunds = [...snap.docs, ...failedSnap.docs].map((d) => {
      const data = d.data() as PendingRefund & { paymentIntentId?: string };
      const createdAtRaw = data.createdAt ?? (data as { firstSeenAt?: unknown }).firstSeenAt;
      const createdAt = createdAtRaw ? toDate(createdAtRaw as { seconds?: number; toDate?: () => Date }) : null;
      const duplicatePaymentIntentId = data.duplicatePaymentIntentId ?? data.paymentIntentId;
      return {
        ...data,
        id: d.id,
        createdAt: createdAt?.toISOString() ?? null,
        duplicatePaymentIntentId,
      };
    });

    return NextResponse.json({ refunds });
  } catch (err) {
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/9217380b-37cf-4275-ae62-01f686adc624", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "app/api/admin/pending-refunds/route.ts:catch",
        message: "pendingRefunds query error",
        hypothesisId: "H1",
        data: {
          errPreview: (err instanceof Error ? err.message : String(err)).slice(0, 400),
          code: (err as { code?: number }).code,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    const message = err instanceof Error ? err.message : String(err);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebaseConfig ? 503 : 500 }
    );
  }
}
