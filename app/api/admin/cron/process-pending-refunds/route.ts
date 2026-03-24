/**
 * Processes pendingRefunds documents: Stripe refunds with idempotency key = document id.
 * POST with Authorization: Bearer CRON_SECRET (same as other admin crons).
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { getStripe } from "@/lib/booking/stripe-client";
import { processPendingRefundsBatch } from "@/lib/booking/process-pending-refunds";
import { assertCronPostAuthorized } from "@/lib/booking/cron-auth";

export async function POST(request: NextRequest) {
  try {
    const authErr = await assertCronPostAuthorized(request);
    if (authErr) return authErr;
    const db = getDb();
    const stripe = getStripe();
    const stats = await processPendingRefundsBatch(db, stripe);
    return NextResponse.json({ ok: true, ...stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[process-pending-refunds]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
