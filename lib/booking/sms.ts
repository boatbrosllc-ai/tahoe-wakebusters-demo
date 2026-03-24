/**
 * SMS notification channel for booking confirmations, reminders, and cancellation.
 * Uses Twilio when TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER are set.
 * When not configured, send functions no-op and return false (no throw).
 */

import { bookingEnv } from "./env";
import { validatePhone } from "./validate-phone";
import { logNotificationSent, logSmsSent, type NotificationEventSubtype } from "./email-log";
import type { EmailTemplateId } from "./email-templates";

const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";

function getAuthHeader(): string | null {
  const sid = bookingEnv.twilioAccountSid;
  const token = bookingEnv.twilioAuthToken;
  if (!sid || !token) return null;
  const encoded = Buffer.from(`${sid}:${token}`).toString("base64");
  return `Basic ${encoded}`;
}

/** Normalize US phone to E.164 (+1XXXXXXXXXX) for Twilio. */
function toE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function isSmsEnabled(): boolean {
  return bookingEnv.smsEnabled;
}

const TWILIO_FETCH_TIMEOUT_MS = 8000;

async function sendTwilioSms(toE164: string, body: string): Promise<boolean> {
  const auth = getAuthHeader();
  const from = bookingEnv.twilioFromNumber;
  if (!auth || !from) return false;
  const url = `${TWILIO_API_BASE}/Accounts/${bookingEnv.twilioAccountSid}/Messages.json`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: toE164,
        From: from,
        Body: body,
      }).toString(),
      signal: AbortSignal.timeout(TWILIO_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("[sms] Twilio send failed", res.status, text);
      return false;
    }
    return true;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.warn("[sms] Twilio fetch timed out after", TWILIO_FETCH_TIMEOUT_MS, "ms");
      return false;
    }
    throw err;
  }
}

/**
 * Send SMS if channel is enabled and phone is valid. Logs to emailLog (channel sms).
 * Returns true if sent, false if skipped or failed.
 */
async function sendAndLog(params: {
  phone: string;
  toName?: string;
  body: string;
  templateId: EmailTemplateId | NotificationEventSubtype;
  bookingId?: string;
}): Promise<boolean> {
  if (!bookingEnv.smsEnabled) return false;
  const result = validatePhone(params.phone);
  if (!result.valid) return false;
  const e164 = toE164(params.phone);
  if (!e164) return false;
  const ok = await sendTwilioSms(e164, params.body);
  if (ok && params.bookingId) {
    await logSmsSent({
      to: e164,
      toName: params.toName,
      templateId: params.templateId,
      bookingId: params.bookingId,
      bodySnippet: params.body.slice(0, 100),
    }).catch((err) => console.error("[sms] logSmsSent failed", err));
  }
  return ok;
}

/** Booking confirmation SMS (short trip summary + receipt link if provided). */
export async function sendBookingConfirmationSms(params: {
  phone: string;
  customerName: string;
  experienceName: string;
  tripDate: string;
  bookingId: string;
  receiptLink?: string;
}): Promise<boolean> {
  const { phone, customerName, experienceName, tripDate, bookingId, receiptLink } = params;
  let body = `Boat Bros: You're booked! ${experienceName} on ${tripDate}.`;
  if (receiptLink) {
    body += ` Receipt: ${receiptLink}`;
  } else {
    body += " Check your email for your full confirmation and receipt details.";
  }
  return sendAndLog({
    phone,
    toName: customerName,
    body,
    templateId: "booking_confirmation",
    bookingId,
  });
}

/** Reminder SMS (1-week, 24h, or day-of). */
export async function sendBookingReminderSms(params: {
  phone: string;
  customerName: string;
  experienceName: string;
  tripDate: string;
  reminderType: "1week" | "24h" | "dayof";
  bookingId: string;
  waiverSigningUrl?: string | null;
}): Promise<boolean> {
  const { phone, customerName, experienceName, tripDate, reminderType, bookingId, waiverSigningUrl } = params;
  const line =
    reminderType === "1week"
      ? "Reminder: Your trip is in 1 week"
      : reminderType === "24h"
        ? "Reminder: Your trip is tomorrow"
        : "Reminder: Your trip is today";
  let body = `Boat Bros – ${line}. ${experienceName}, ${tripDate}.`;
  if (waiverSigningUrl) body += ` Sign waiver: ${waiverSigningUrl}`;
  return sendAndLog({
    phone,
    toName: customerName,
    body,
    templateId: `booking_reminder_${reminderType === "1week" ? "1week" : reminderType === "24h" ? "24h" : "dayof"}` as "booking_reminder_1week" | "booking_reminder_24h" | "booking_reminder_dayof",
    bookingId,
  });
}

/** Final payment request SMS (48h before; include pay link). */
export async function sendFinalPaymentRequestSms(params: {
  phone: string;
  customerName: string;
  experienceName: string;
  tripDate: string;
  amountFormatted: string;
  payLink: string;
  bookingId: string;
}): Promise<boolean> {
  const { phone, customerName, amountFormatted, payLink, bookingId } = params;
  const body = `Boat Bros: Pay remaining balance (${amountFormatted}) before your trip: ${payLink}`;
  return sendAndLog({
    phone,
    toName: customerName,
    body,
    templateId: "final_payment_request",
    bookingId,
  });
}

/**
 * Optional internal SMS to STAFF_SMS_PHONE for ops visibility (Twilio).
 * No-op when unset or SMS disabled. Logs with audience `staff`.
 */
export async function sendStaffEventSms(params: {
  bookingId: string;
  body: string;
  templateId: NotificationEventSubtype;
}): Promise<boolean> {
  const raw = process.env.STAFF_SMS_PHONE?.trim();
  if (!raw || !bookingEnv.smsEnabled) return false;
  const result = validatePhone(raw);
  if (!result.valid) return false;
  const e164 = toE164(raw);
  if (!e164) return false;
  const ok = await sendTwilioSms(e164, params.body);
  if (ok) {
    await logNotificationSent({
      channel: "sms",
      to: e164,
      templateId: params.templateId,
      bookingId: params.bookingId,
      eventSubtype: params.templateId,
      bodySnippet: params.body.slice(0, 100),
      audience: "staff",
      deliveryState: "sent",
    }).catch((err) => console.error("[sms] staff log failed", err));
  }
  return ok;
}

/** Cancellation SMS. */
export async function sendBookingCancellationSms(params: {
  phone: string;
  customerName: string;
  experienceName: string;
  tripDate?: string;
  bookingId: string;
}): Promise<boolean> {
  const { phone, customerName, experienceName, tripDate, bookingId } = params;
  const trip = tripDate ? ` for ${tripDate}` : "";
  const body = `Boat Bros: Your booking${trip} (${experienceName}) has been canceled. Refund will be processed to your original payment method.`;
  return sendAndLog({
    phone,
    toName: customerName,
    body,
    templateId: "booking_cancellation",
    bookingId,
  });
}
