import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import type { NotificationOutboxEntry, ReminderRetryEntry } from "@/lib/booking/types";

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const db = getDb();
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") ?? "100", 10) || 100, 200);

    const outSnap = await db.collection("notificationOutbox").where("status", "==", "dead_letter").limit(limit).get();

    let remSnap: FirebaseFirestore.QuerySnapshot;
    try {
      remSnap = await db
        .collection("reminderRetryQueue")
        .where("status", "in", ["dead_letter", "failed"])
        .limit(limit)
        .get();
    } catch {
      remSnap = await db.collection("reminderRetryQueue").where("status", "==", "dead_letter").limit(limit).get();
    }

    const notificationOutboxDeadLetters = outSnap.docs.map((d) => {
      const x = d.data() as NotificationOutboxEntry;
      return {
        id: d.id,
        bookingId: x.bookingId,
        type: x.type,
        lastError: x.lastError ?? null,
        attemptCount: x.attemptCount,
      };
    });

    const reminderRetryFailures = remSnap.docs.map((d) => {
      const x = d.data() as ReminderRetryEntry;
      return {
        id: d.id,
        bookingId: x.bookingId,
        templateKey: x.templateKey,
        status: x.status,
        lastError: x.lastError ?? null,
        attemptCount: x.attemptCount,
      };
    });

    return NextResponse.json({
      notificationOutboxDeadLetters,
      reminderRetryFailures,
      maxFetchedPerSource: limit,
      deadLetterSampleCapped: outSnap.size >= limit,
      reminderSampleCapped: remSnap.size >= limit,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebaseConfig ? 503 : 500 }
    );
  }
}
