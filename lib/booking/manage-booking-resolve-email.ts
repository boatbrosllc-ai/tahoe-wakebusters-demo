import type { NextRequest } from "next/server";
import {
  MANAGE_BOOKING_EMAIL_BIND_COOKIE,
  verifyManageBookingEmailBind,
} from "@/lib/booking/manage-booking-bind-cookie";

/**
 * Prefer email from JSON body; if absent, use HttpOnly bind cookie from a prior successful manage/get.
 */
export function resolveManageCustomerEmail(
  request: NextRequest,
  bookingId: string,
  bodyEmail: string | null | undefined,
): string | null {
  const trimmed = typeof bodyEmail === "string" ? bodyEmail.trim().toLowerCase() : null;
  if (trimmed) return trimmed;
  const cookieVal = request.cookies.get(MANAGE_BOOKING_EMAIL_BIND_COOKIE)?.value;
  return verifyManageBookingEmailBind(cookieVal, bookingId);
}
