/**
 * HttpOnly cookie binds manage-booking token (bookingId) to verified customer email after the first successful
 * POST /api/booking/manage/get — avoids storing token + email together in sessionStorage (XSS).
 */

import { createHmac, timingSafeEqual } from "crypto";

export const MANAGE_BOOKING_EMAIL_BIND_COOKIE = "manage_booking_email_bind";

function getSecret(): string | null {
  const s = process.env.MANAGE_BOOKING_SECRET?.trim();
  return s || null;
}

/** Signed payload: bookingId, emailLower, exp (unix sec). */
export function signManageBookingEmailBind(bookingId: string, emailLower: string, maxAgeSec = 3600): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const exp = Math.floor(Date.now() / 1000) + maxAgeSec;
  const data = `${bookingId}\x00${emailLower}\x00${exp}`;
  const sig = createHmac("sha256", secret).update(data).digest("base64url");
  const payloadB64 = Buffer.from(data, "utf8").toString("base64url");
  return `${payloadB64}.${sig}`;
}

export function verifyManageBookingEmailBind(
  cookieValue: string | undefined,
  expectedBookingId: string,
): string | null {
  const secret = getSecret();
  if (!secret || !cookieValue) return null;
  const parts = cookieValue.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  let data: string;
  try {
    data = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expectedSig = createHmac("sha256", secret).update(data).digest("base64url");
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
  } catch {
    return null;
  }
  const segments = data.split("\x00");
  if (segments.length !== 3) return null;
  const [bid, email, expStr] = segments;
  if (bid !== expectedBookingId) return null;
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  return email;
}
