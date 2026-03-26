/** Session key for persisting post-booking success snapshot in the booking modal flow. */
export const BOOKING_MODAL_SESSION_SUCCESS_KEY = "bb_booking_success";
/** Success snapshot is only for immediate post-booking UX; claim token remains valid longer server-side. */
export const BOOKING_MODAL_SESSION_SUCCESS_MAX_AGE_MS = 7 * 60 * 1000;
