/**
 * Single source of truth for booking modal step + payment phase (Comment 6).
 * Discriminated-style actions keep transitions explicit; guards use effectsPhase().
 */

export type BookingModalPaymentPhase =
  | "form"
  | "loading"
  | "stripe"
  | "completing"
  | "completeAfterPaymentRetry"
  | "success"
  | "successWithWarning"
  | "successRecoveryFailed";

export type BookingModalState = {
  step: 1 | 2 | 3 | 4;
  paymentPhase: BookingModalPaymentPhase;
};

export type BookingModalAction =
  | { type: "SET_STEP"; step: 1 | 2 | 3 | 4 }
  | { type: "SET_PAYMENT_PHASE"; paymentPhase: BookingModalPaymentPhase }
  | {
      type: "RESET_ON_OPEN";
      step: 1 | 2 | 3 | 4;
    };

export const BOOKING_MODAL_INITIAL_STATE: BookingModalState = {
  step: 1,
  paymentPhase: "form",
};

export function bookingModalReducer(state: BookingModalState, action: BookingModalAction): BookingModalState {
  switch (action.type) {
    case "SET_STEP":
      return { ...state, step: action.step };
    case "SET_PAYMENT_PHASE":
      return { ...state, paymentPhase: action.paymentPhase };
    case "RESET_ON_OPEN":
      return { step: action.step, paymentPhase: "form" };
    default:
      return state;
  }
}

/**
 * Slot auto-select, rate invalidation, and similar effects must not run during active checkout on Stripe.
 * Mirrors the former `paymentPhase === 'stripe' || ...` guard as a single check.
 */
export function bookingModalEffectsPhase(state: BookingModalState): "selection" | "checkout" {
  const p = state.paymentPhase;
  if (p === "stripe" || p === "loading" || p === "completing") return "checkout";
  return "selection";
}
