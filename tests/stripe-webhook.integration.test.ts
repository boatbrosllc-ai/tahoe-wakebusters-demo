/**
 * Webhook financial paths: idempotency, retry counter atomicity, and source contracts.
 * Full handler tests need Stripe + Firestore; these tests pin critical behavior without emulators.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync } from "fs";
import { join } from "path";
import type { CollectionReference, DocumentData, Firestore, Transaction } from "firebase-admin/firestore";
import { incrementStripeWebhookRetryCounter } from "../lib/booking/webhook/stripe-webhook-retry";

describe("incrementStripeWebhookRetryCounter (atomic read-increment-write)", () => {
  it("returns monotonic values and persists in a single transaction per call", async () => {
    const docs = new Map<string, Record<string, unknown>>();
    const db = {
      runTransaction: async <T>(fn: (tx: Transaction) => Promise<T>): Promise<T> => {
        const tx = {
          get: async (ref: { path: string }) => {
            const d = docs.get(ref.path);
            return {
              exists: d !== undefined,
              data: () => d ?? {},
            };
          },
          set: (ref: { path: string }, data: Record<string, unknown>, opts?: { merge?: boolean }) => {
            const cur = docs.get(ref.path) ?? {};
            docs.set(ref.path, opts?.merge ? { ...cur, ...data } : { ...data });
          },
        };
        return fn(tx as unknown as Transaction);
      },
    };
    const eventsRef = {
      doc: (id: string) => ({ path: `stripeEvents/${id}` }),
    } as unknown as CollectionReference<DocumentData>;
    const field = "whRetry_test_counter";
    const n1 = await incrementStripeWebhookRetryCounter(
      db as unknown as Firestore,
      eventsRef,
      "evt_atomic_1",
      field
    );
    const n2 = await incrementStripeWebhookRetryCounter(
      db as unknown as Firestore,
      eventsRef,
      "evt_atomic_1",
      field
    );
    assert.strictEqual(n1, 1);
    assert.strictEqual(n2, 2);
    assert.strictEqual(
      (docs.get("stripeEvents/evt_atomic_1") as Record<string, unknown> | undefined)?.[field],
      2
    );
  });
});

describe("stripe webhook route (source contracts)", () => {
  const webhookSrc = readFileSync(join(__dirname, "../app/api/stripe/webhook/route.ts"), "utf8");

  it("duplicate checkout completion is idempotent (hold already converted path)", () => {
    assert.match(webhookSrc, /hold already converted \(idempotent\)/);
  });

  it("reclaims stale processing lease so a retry can run the handler", () => {
    assert.match(webhookSrc, /Stale lease: reclaim/);
    assert.match(webhookSrc, /reclaimedStale:\s*true/);
  });

  it("final-stage payment_intent.succeeded uses outbox for receipt email (durable with final_paid)", () => {
    assert.match(webhookSrc, /addFinalChargeSuccessOutboxInTransaction/);
    assert.match(webhookSrc, /final_paid_idempotent/);
  });

  it("final-stage payment_intent.payment_failed updates booking and sends failure notification path", () => {
    assert.match(webhookSrc, /payment_intent\.payment_failed/);
    assert.match(webhookSrc, /sendFinalChargeFailedEmail/);
  });

  it("checkout.session.completed (paid, active hold) delegates conversion through convertHoldToBooking", () => {
    assert.ok(
      webhookSrc.includes('runCheckoutSessionActiveHoldConversion(session, eventId, "checkout_session_completed")')
    );
    assert.ok(webhookSrc.includes("await convertHoldToBooking(db, holdId, convertInput)"));
  });

  it("async_payment_succeeded missing holdId retries first before permanent dead-letter", () => {
    assert.match(webhookSrc, /WH_RETRY_ASYNC_CHECKOUT_MISSING_HOLD_ID/);
    assert.match(webhookSrc, /status:\s*"failed_retryable"/);
    assert.match(webhookSrc, /Missing holdId in session metadata/);
  });
});
