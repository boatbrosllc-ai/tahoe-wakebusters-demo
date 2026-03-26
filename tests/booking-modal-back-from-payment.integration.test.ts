/**
 * Booking modal: leaving the payment step must reset checkout state (step + payment phase)
 * so the flow can return to the calendar without staying on Stripe.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  bookingModalReducer,
  BOOKING_MODAL_INITIAL_STATE,
} from "../lib/booking/booking-modal-state";

describe("BookingModal back from payment (reducer integration)", () => {
  it("sequential SET_PAYMENT_PHASE form then SET_STEP mirrors handleBack leaving step 4 checkout", () => {
    let state = { ...BOOKING_MODAL_INITIAL_STATE, step: 4 as const, paymentPhase: "stripe" as const };
    state = bookingModalReducer(state, { type: "SET_PAYMENT_PHASE", paymentPhase: "form" });
    assert.strictEqual(state.paymentPhase, "form");
    assert.strictEqual(state.step, 4);
    state = bookingModalReducer(state, { type: "SET_STEP", step: 2 });
    assert.strictEqual(state.step, 2);
    assert.strictEqual(state.paymentPhase, "form");
  });
});
