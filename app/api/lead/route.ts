import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientKey } from "@/lib/booking/rate-limit";
import { hasFirebaseConfig } from "@/lib/booking/env";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { sendLeadNotificationEmail } from "@/lib/booking/brevo";
import { upsertGuestRecord } from "@/lib/booking/guests";

const MAX_EMAIL_LENGTH = 254;
const MAX_SOURCE_LENGTH = 200;

/**
 * Lead capture (email). Persists to the customer Firestore `leads` and `guests` collections.
 * Rate-limited and input size capped. Returns failure when storage fails.
 */
export async function POST(request: NextRequest) {
  let submissionId: string | null = null;
  try {
    const rl = await checkRateLimit(getClientKey(request));
    if (!rl.allowed) {
      const retryAfter = rl.retryAfterMs ? Math.ceil(rl.retryAfterMs / 1000) : 60;
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().slice(0, MAX_EMAIL_LENGTH) : "";
    const source = typeof body?.source === "string" ? body.source.slice(0, MAX_SOURCE_LENGTH) : "unknown";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Valid email required" },
        { status: 400 }
      );
    }

    const useFirestore = hasFirebaseConfig();
    if (!useFirestore) {
      console.error("[Lead] Misconfiguration: Firestore not configured; lead not persisted.");
      return NextResponse.json(
        { error: "Something went wrong" },
        { status: 500 }
      );
    }

    const db = getDb();
    const { Timestamp } = getFirestoreExports();
    const ref = db.collection("leads").doc();
    submissionId = ref.id;
    await ref.set({
      email,
      source,
      createdAt: Timestamp.now(),
    });
    try {
      await upsertGuestRecord(db, { email, source: source || "lead" });
    } catch (guestErr) {
      console.error("[Lead] Guest upsert failed", { submissionId }, guestErr);
    }

    if (process.env.BREVO_API_KEY?.trim()) {
      await sendLeadNotificationEmail(email, source);
    }

    if (submissionId) {
      console.log("[Lead] Accepted", { submissionId, source });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (submissionId) {
      console.error("[Lead] Storage or delivery failed", { submissionId }, err);
    } else {
      console.error("[Lead] Request failed", err);
    }
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
