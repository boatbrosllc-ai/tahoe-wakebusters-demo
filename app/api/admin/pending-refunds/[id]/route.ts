import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getStripe } from "@/lib/booking/stripe-client";

function parsePatchBody(
  body: unknown
): {
  status: "resolved";
  notes?: string;
  force?: boolean;
  resolvedManuallyReason?: string;
} | null {
  if (body == null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if (o.status !== "resolved") return null;
  const notes = typeof o.notes === "string" ? o.notes.trim() : undefined;
  const force = o.force === true;
  const resolvedManuallyReason =
    typeof o.resolvedManuallyReason === "string" ? o.resolvedManuallyReason.trim() : undefined;
  return {
    status: "resolved",
    ...(notes ? { notes } : {}),
    ...(force ? { force: true } : {}),
    ...(resolvedManuallyReason ? { resolvedManuallyReason } : {}),
  };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const input = parsePatchBody(body);
  if (!input) {
    return NextResponse.json(
      { error: "Body must be { status: \"resolved\", notes?, force?, resolvedManuallyReason? }" },
      { status: 400 }
    );
  }
  if (input.force === true && !input.resolvedManuallyReason) {
    return NextResponse.json(
      { error: "force: true requires resolvedManuallyReason (auditable operator note)." },
      { status: 400 }
    );
  }

  try {
    const db = getDb();
    const { Timestamp } = getFirestoreExports();
    const ref = db.collection("pendingRefunds").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const data = snap.data() as { status?: string; paymentIntentId?: string };
    if (data.status === "resolved") {
      return NextResponse.json({ ok: true, id, alreadyResolved: true });
    }

    const paymentIntentId = typeof data.paymentIntentId === "string" ? data.paymentIntentId.trim() : "";
    if (paymentIntentId && process.env.STRIPE_SECRET_KEY && input.force !== true) {
      const stripe = getStripe();
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      const piAmt = pi as unknown as { amount_received?: number; amount_refunded?: number };
      const amountReceived = typeof piAmt.amount_received === "number" ? piAmt.amount_received : 0;
      const amountRefunded = typeof piAmt.amount_refunded === "number" ? piAmt.amount_refunded : 0;
      if (amountRefunded < amountReceived) {
        return NextResponse.json(
          {
            error:
              "Stripe does not show a full refund on this PaymentIntent yet. Complete the refund in Stripe first, then retry. To override, send { force: true, resolvedManuallyReason: \"…\" }.",
            paymentIntentId,
            amountReceived,
            amountRefunded,
            remainingRefundableCents: Math.max(0, amountReceived - amountRefunded),
          },
          { status: 409 }
        );
      }
    }

    const patch: Record<string, unknown> = {
      status: "resolved",
      resolvedAt: Timestamp.now(),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    };
    if (input.force === true && input.resolvedManuallyReason) {
      patch.resolvedManually = true;
      patch.resolvedManuallyReason = input.resolvedManuallyReason;
    }

    await ref.update(patch);
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
