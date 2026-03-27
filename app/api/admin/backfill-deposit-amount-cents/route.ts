/**
 * Backfill stripe.depositAmountCents on deposit-flow bookings that have
 * stripe.depositPaymentIntentId but no stripe.depositAmountCents, using the
 * PaymentIntent amount from Stripe.
 *
 * GET: dry-run for one page (optional ?cursor=docId).
 * POST: { applyUpdates: true, cursor?: string } — retrieve each PI and update the booking.
 *
 * Requires admin session. Re-run with cursor until a page returns candidateCount 0.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import { getStripe } from "@/lib/booking/stripe-client";
import type { Booking } from "@/lib/booking/types";
import { writeAdminAuditLog } from "@/lib/booking/admin-audit-log";

const DEPOSIT_STATUSES = [
  "final_due",
  "final_processing",
  "final_paid",
  "final_requires_action",
  "final_failed",
] as const;

const PAGE_SIZE = 100;

async function runBackfill(dryRun: boolean, request: NextRequest | undefined, cursorDocId: string | null) {
  const db = getDb();
  let q = db
    .collection("bookings")
    .where("status", "in", [...DEPOSIT_STATUSES])
    .orderBy("createdAt", "asc")
    .limit(PAGE_SIZE);

  if (cursorDocId) {
    const cursorSnap = await db.collection("bookings").doc(cursorDocId).get();
    if (cursorSnap.exists) q = q.startAfter(cursorSnap);
  }

  const snap = await q.get();
  const candidates: { id: string; depositPaymentIntentId: string; fromAmountTotalCents?: number }[] = [];

  for (const doc of snap.docs) {
    const b = doc.data() as Booking;
    const s = b.stripe;
    const pi = s?.depositPaymentIntentId;
    if (typeof pi !== "string" || !pi.trim()) continue;
    if (typeof s?.depositAmountCents === "number") continue;
    if (typeof s?.amountTotalCents === "number" && s.amountTotalCents > 0) {
      candidates.push({ id: doc.id, depositPaymentIntentId: pi.trim(), fromAmountTotalCents: s.amountTotalCents });
      continue;
    }
    candidates.push({ id: doc.id, depositPaymentIntentId: pi.trim() });
  }

  const results: { id: string; depositAmountCents?: number; error?: string }[] = [];
  const stripe = dryRun ? null : getStripe();

  for (const c of candidates) {
    if (dryRun) {
      results.push({ id: c.id });
      continue;
    }
    try {
      if (typeof c.fromAmountTotalCents === "number") {
        await db.collection("bookings").doc(c.id).update({
          "stripe.depositAmountCents": c.fromAmountTotalCents,
        });
        results.push({ id: c.id, depositAmountCents: c.fromAmountTotalCents });
        continue;
      }
      const pi = await stripe!.paymentIntents.retrieve(c.depositPaymentIntentId);
      const amount = pi.amount;
      if (typeof amount !== "number") {
        results.push({ id: c.id, error: "PaymentIntent missing amount" });
        continue;
      }
      await db.collection("bookings").doc(c.id).update({
        "stripe.depositAmountCents": amount,
      });
      results.push({ id: c.id, depositAmountCents: amount });
    } catch (e) {
      results.push({ id: c.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const lastDoc = snap.docs[snap.docs.length - 1];
  const nextCursor = lastDoc?.id ?? null;

  if (!dryRun && results.some((r) => r.depositAmountCents != null) && request) {
    console.log("[backfill-deposit-amount-cents] operator action", {
      action: "backfill_deposit_amount_cents",
      updatedCount: results.filter((r) => r.depositAmountCents != null).length,
      docIds: results.filter((r) => r.depositAmountCents != null).map((r) => r.id).slice(0, 30),
      at: new Date().toISOString(),
    });
    void writeAdminAuditLog("backfill_deposit_amount_cents", {
      updatedCount: results.filter((r) => r.depositAmountCents != null).length,
      docIds: results.filter((r) => r.depositAmountCents != null).map((r) => r.id).slice(0, 30),
    });
  }

  return NextResponse.json({
    dryRun,
    pageSize: PAGE_SIZE,
    scanned: snap.size,
    candidateCount: candidates.length,
    results: results.slice(0, 50),
    nextCursor,
    hint:
      snap.size === 0
        ? "No documents in this page."
        : candidates.length === 0
          ? "No candidates on this page; continue with nextCursor if set."
          : dryRun
            ? "POST with { applyUpdates: true } to write depositAmountCents from Stripe. Repeat with cursor until done."
            : "Re-run POST with nextCursor until every page has candidateCount 0.",
  });
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;
  const cursor = request.nextUrl.searchParams.get("cursor");
  return runBackfill(true, undefined, cursor || null);
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;
  const body = (await request.json().catch(() => ({}))) as { applyUpdates?: boolean; cursor?: string | null };
  if (body.applyUpdates !== true) {
    return NextResponse.json(
      { error: "POST requires body { applyUpdates: true, cursor?: string }. Use GET for dry-run." },
      { status: 400 }
    );
  }
  return runBackfill(false, request, body.cursor ?? null);
}
