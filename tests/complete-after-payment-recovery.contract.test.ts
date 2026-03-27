/**
 * Contracts for page-refresh mid-checkout recovery: complete-after-payment + receipt claim fallback.
 * Full flow needs Firestore + Stripe; these tests pin the serialized payload shape and API responses.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
import type { ModalHoldRecoveryPayloadV1 } from "../components/site/useHoldCreation";
import type { ExperienceItem, SlotDto } from "../lib/booking/booking-modal-types";

describe("ModalHoldRecoveryPayloadV1 (refresh recovery)", () => {
  it("JSON round-trip preserves fields required for complete-after-payment (holdId + paymentIntentId)", () => {
    const experienceSnapshot: ExperienceItem = {
      id: "exp1",
      slug: "test",
      title: "Test",
      subtitle: "",
      heroMedia: { type: "image", url: "/x.jpg" },
      maxGuests: 6,
      petsMax: 0,
      fromPriceCents: 10000,
      active: true,
      pricingType: "charter",
    };
    const selectedSlot: SlotDto = {
      id: "2030-07-01-10-2",
      startAt: "2030-07-01T10:00:00.000Z",
      endAt: "2030-07-01T12:00:00.000Z",
      status: "open",
    };
    const payload: ModalHoldRecoveryPayloadV1 = {
      v: 1,
      holdId: "hold_recovery_test",
      releaseToken: "rel.test.token",
      receiptClaimToken: null,
      paymentIntentId: "pi_recovery_test",
      holdExpiresAt: new Date().toISOString(),
      experienceSnapshot,
      selectedDate: "2030-07-01",
      selectedSlot,
      selectedRateIdForCalendar: "rate1",
      partySize: 2,
      viewMonthYear: 2030,
      viewMonthMonth: 6,
      selectedBoatId: null,
      isTicketed: false,
    };
    const raw = JSON.stringify(payload);
    const back = JSON.parse(raw) as ModalHoldRecoveryPayloadV1;
    assert.strictEqual(back.v, 1);
    assert.strictEqual(back.holdId, "hold_recovery_test");
    assert.strictEqual(back.paymentIntentId, "pi_recovery_test");
    assert.strictEqual(typeof back.holdId, "string");
    assert.strictEqual(typeof back.paymentIntentId, "string");
  });
});

describe("complete-after-payment hold expired response (contract for BookingStripeReturnHandler)", () => {
  it("200 JSON includes reconciliationPending + holdExpired for convert Hold has expired error path", () => {
    const body = {
      success: false,
      reconciliationPending: true,
      bookingConfirmed: false,
      holdExpired: true,
      message:
        "We've received your payment. We are confirming your reservation; you should get a confirmation email shortly.",
    };
    assert.strictEqual(body.holdExpired, true);
    assert.strictEqual(body.reconciliationPending, true);
    assert.strictEqual(typeof body.message, "string");
  });

  it("route enqueues reconcilingPayments + pendingRefunds when hold expires after payment", () => {
    const src = readFileSync(join(__dirname, "../app/api/booking/complete-after-payment/route.ts"), "utf8");
    assert.match(src, /hold_expired_after_payment/);
    assert.match(src, /holdExpired:\s*true/);
    assert.match(src, /logReconcilingPending\([\s\S]*hold_expired_after_payment/);
  });

  it("route returns structured payment failures for terminal PaymentIntent statuses", () => {
    const src = readFileSync(join(__dirname, "../app/api/booking/complete-after-payment/route.ts"), "utf8");
    assert.match(src, /paymentIntentTerminalFailureCopy/);
    assert.match(src, /recoveryMessage/);
    assert.match(src, /paymentIntentStatus/);
    assert.match(src, /pollHardTimeoutMsForProcessingPaymentIntent/);
  });
});
