/**
 * Default cancellation policy text used when experience/boat does not override.
 * Keep in sync with customer-facing copy (BookingModal, emails).
 */

/** Full policy text for display in booking flow and emails. */
export const DEFAULT_CANCELLATION_POLICY =
  "Free cancellations until 30 days before the booking start time. " +
  "50% refund for cancellations between 15–30 days before the booking start time. " +
  "Cancellations within 14 days of the booking start time are non-refundable. " +
  "No-shows will be charged the full price. " +
  "You will receive a full refund or credit if we cancel due to weather or other unforeseen circumstances. " +
  "Contact us by phone to cancel or inquire about a cancellation.";

/** Short summary (e.g. for compact UI). */
export const DEFAULT_CANCELLATION_SUMMARY =
  "Free cancel until 30 days before · 50% refund 15–30 days · No refund within 14 days · No-shows charged in full. Contact us by phone to cancel.";
