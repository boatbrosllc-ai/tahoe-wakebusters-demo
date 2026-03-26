/**
 * Applies pending Stripe PaymentIntent metadata patches stored on holds when the inline
 * `paymentIntents.update` failed after checkout session create. Clears `pendingPiMetadataUpdate` on success.
 * POST with Bearer CRON_SECRET + X-Cron-Timestamp (see assertCronPostAuthorized).
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getStripe } from "@/lib/booking/stripe-client";
import { assertCronPostAuthorized } from "@/lib/booking/cron-auth";

export async function POST(request: NextRequest) {
  try {
    const authErr = await assertCronPostAuthorized(request);
    if (authErr) return authErr;
    if (!process.env.STRIPE_SECRET_KEY?.trim()) {
      return NextResponse.json({ ok: false, error: "STRIPE_SECRET_KEY not configured" }, { status: 503 });
    }

    const db = getDb();
    const { FieldValue } = getFirestoreExports();
    const stripe = getStripe();

    const snap = await db.collection("holds").where("pendingPiMetadataUpdate", "!=", null).limit(50).get();

    let processed = 0;
    let cleared = 0;
    let failed = 0;

    for (const doc of snap.docs) {
      processed++;
      const holdId = doc.id;
      const data = doc.data() as {
        pendingPiMetadataUpdate?: { checkoutSessionId?: string };
        fullPaymentIntentId?: string;
      };
      const pending = data.pendingPiMetadataUpdate;
      const checkoutSessionId =
        typeof pending?.checkoutSessionId === "string" ? pending.checkoutSessionId.trim() : "";
      const piId = typeof data.fullPaymentIntentId === "string" ? data.fullPaymentIntentId.trim() : "";

      if (!checkoutSessionId || !piId) {
        try {
          await doc.ref.update({
            pendingPiMetadataUpdate: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          cleared++;
        } catch (e) {
          console.error("[reconcile-pending-pi-metadata] clear invalid pendingPiMetadataUpdate failed", holdId, e);
          failed++;
        }
        continue;
      }

      try {
        const piExisting = await stripe.paymentIntents.retrieve(piId);
        await stripe.paymentIntents.update(piId, {
          metadata: { ...piExisting.metadata, checkoutSessionId },
        });
        await doc.ref.update({
          pendingPiMetadataUpdate: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        cleared++;
      } catch (e) {
        console.error("[reconcile-pending-pi-metadata] stripe update or hold clear failed", holdId, piId, e);
        failed++;
      }
    }

    return NextResponse.json({ ok: true, matched: snap.size, processed, cleared, failed });
  } catch (err) {
    console.error("[admin/cron/reconcile-pending-pi-metadata]", err);
    return NextResponse.json({ error: "reconcile-pending-pi-metadata failed" }, { status: 500 });
  }
}
