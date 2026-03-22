/**
 * Email format check shared by booking UI and create-hold API validation.
 */
export const BOOKING_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidBookingEmail(email: string): boolean {
  return BOOKING_EMAIL_REGEX.test(email);
}
