/**
 * Brevo (Sendinblue) — transactional email and contact upsert.
 * Server-side only. Uses BREVO_API_KEY.
 */

import { bookingEnv } from "./env";
import { DEFAULT_CANCELLATION_POLICY } from "./cancellation-policy";
import { formatMoney } from "./format-money";
import { renderBookingConfirmationHtml, isDepositFromBookingStripe } from "./email-templates";
import {
  buildReminderHtml,
  getReminderSubject,
  buildFinalPaymentRequestHtml,
  getFinalPaymentRequestSubject,
  type BookingReminderParams,
  type FinalPaymentRequestParams,
  type ReminderType,
} from "./reminder-emails";
import type { Booking } from "./types";

const BREVO_API_BASE = "https://api.brevo.com/v3";

const BREVO_FETCH_TIMEOUT_MS = 8000;
/** Exponential back-off: 1s, then 3s before final failure. */
const SEND_RETRY_DELAYS_MS = [1000, 3000];

function getHeaders(): Record<string, string> {
  return {
    "api-key": bookingEnv.brevoApiKey,
    "Content-Type": "application/json",
  };
}

function fetchOpts(): RequestInit {
  return { signal: AbortSignal.timeout(BREVO_FETCH_TIMEOUT_MS) };
}

async function sendWithRetry(
  url: string,
  body: Record<string, unknown>,
  opts?: { retries?: number }
): Promise<Response> {
  const retries = opts?.retries ?? 2;
  let lastRes: Response | null = null;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(body),
        ...fetchOpts(),
      });
      if (res.ok) return res;
      lastRes = res;
      if (attempt < retries) {
        const delayMs = SEND_RETRY_DELAYS_MS[attempt] ?? 3000;
        console.warn("[brevo] sendWithRetry attempt failed, retrying", { attempt: attempt + 1, status: res.status, delayMs });
        await new Promise((r) => setTimeout(r, delayMs));
      }
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        const delayMs = SEND_RETRY_DELAYS_MS[attempt] ?? 3000;
        console.warn("[brevo] sendWithRetry attempt threw, retrying", { attempt: attempt + 1, delayMs, error: err instanceof Error ? err.message : String(err) });
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  if (lastErr) throw lastErr;
  return lastRes!;
}

export interface BookingEmailContext {
  boatName: string;
  startAt: string;
  endAt: string;
  durationHours: number;
  locationText: string;
  cancellationPolicyText: string;
  /** True when 50% deposit was paid; remaining charged at T-48h. */
  isDeposit?: boolean;
  /** When true, remaining balance was already charged (e.g. resend for final_paid); use "was charged" not "will be charged". */
  remainingAlreadyCharged?: boolean;
  /** ISO date string for when the remaining balance will be auto-charged (when isDeposit and !remainingAlreadyCharged). */
  finalChargeAt?: string;
  /** Signed manage-booking URL (deposit flow) or receipt URL. */
  manageLink?: string;
  /** Deep link to view receipt (e.g. /booking/success?receipt_token=...). Include in confirmation email so customer has a working receipt link. */
  receiptLink?: string;
  /** Waiver signing URL to include in confirmation (when template has includeInConfirmationEmail). */
  waiverSigningUrl?: string;
  /** Shareable waiver link for other party members (when partySize > 1). */
  waiverGroupSigningUrl?: string;
  /** "ticketed" for ticket-based experiences; "charter" (or undefined) for boat charters. */
  pricingType?: "charter" | "ticketed";
  /** Pre-resolved addon names summary for confirmation email (e.g. "Cooler: qty 1, Towel: qty 2"). */
  addonsSummary?: string;
}

function getSender(): { name: string; email: string } {
  const email = process.env.BREVO_SENDER_EMAIL?.trim() || "noreply@boatbrosatx.com";
  const name = process.env.BREVO_SENDER_NAME?.trim() || "Boat Bros ATX";
  return { name, email };
}

/**
 * Send booking confirmation email to the customer email from the booking details form.
 * Uses transactional send endpoint. If BREVO_BOOKING_TEMPLATE_ID is set, use template; else send HTML from email-templates.
 * Pass context for formatted date/time and boat/location/cancellation text.
 * Returns the subject line used so callers can log it (e.g. email audit).
 */
export async function sendBookingConfirmationEmail(booking: Booking, context: BookingEmailContext): Promise<string> {
  const toEmail = booking.customer?.email?.trim();
  if (!toEmail) {
    throw new Error("Booking customer email is required to send confirmation");
  }
  const html = renderBookingConfirmationHtml(booking, context);

  const templateId = bookingEnv.brevoBookingTemplateId;
  const { boatName, startAt, endAt, durationHours, locationText, cancellationPolicyText, waiverSigningUrl, addonsSummary: addonsSummaryFromContext } = context;
  // Only use deposit-specific copy when we have valid stripe.depositAmountCents (defensive guard; matches email-templates).
  const stripe = booking.stripe as { totalAmountCents?: number; depositAmountCents?: number; finalAmountCents?: number } | undefined;
  const hasValidDepositAmount = typeof stripe?.depositAmountCents === "number" && stripe.depositAmountCents > 0;
  const isDepositFromContextOrBooking = context.isDeposit === true || isDepositFromBookingStripe(booking);
  const isDepositForTemplate = isDepositFromContextOrBooking && hasValidDepositAmount;
  if (isDepositFromContextOrBooking && !hasValidDepositAmount) {
    console.warn("[brevo] sendBookingConfirmationEmail: deposit mode indicated but depositAmountCents missing or zero; using full-payment copy", { bookingId: (booking as { id?: string }).id });
  }
  const duration = `${durationHours} hour${durationHours !== 1 ? "s" : ""}`;
  const addonsSummary =
    addonsSummaryFromContext !== undefined
      ? addonsSummaryFromContext
      : booking.addonSelections.length > 0
        ? booking.addonSelections.map((s) => `${s.addonId}: qty ${s.qty}`).join(", ")
        : "None";
  // Use same source as confirmation HTML: Stripe amounts reflect actual charges (all in cents).
  const totalAmountCents = stripe?.totalAmountCents ?? booking.pricing.totalCents;
  const depositPaidCents = hasValidDepositAmount ? (stripe!.depositAmountCents as number) : booking.pricing.totalCents;
  const remainingCents =
    stripe?.finalAmountCents != null
      ? stripe.finalAmountCents
      : Math.max(0, booking.pricing.totalCents - depositPaidCents);
  const totalPaid = formatMoney(totalAmountCents);
  const depositPaidFormatted = formatMoney(depositPaidCents);
  const remainingFormatted = formatMoney(remainingCents);
  /** Amount paid in this transaction: deposit when 50/50, full total when full payment. Use this in templates for "You paid X" to avoid showing full total for deposit. */
  const amountPaidNowFormatted = isDepositForTemplate ? depositPaidFormatted : totalPaid;
  const cancellationPolicy = cancellationPolicyText || DEFAULT_CANCELLATION_POLICY;

  const subjectForDeposit = isDepositForTemplate ? " (deposit received)" : "";
  const subjectBase = waiverSigningUrl ? "Booking Confirmation & Waiver" : "Booking Confirmation";
  const subjectSuffix = " – Boat Bros ATX";
  const emailSubject = `${subjectBase}${subjectForDeposit}${subjectSuffix}`;

  const toName = booking.customer?.name?.trim() ?? "";
  const payload: Record<string, unknown> = templateId
    ? {
        templateId,
        to: [{ email: toEmail, name: toName }],
        params: {
          customerName: booking.customer.name,
          boatName,
          startAt,
          endAt,
          duration,
          addonsSummary,
          totalPaid,
          /** Use for "You paid X" in template: deposit amount when isDeposit, full total when full payment. */
          amountPaidNowFormatted,
          depositPaidFormatted,
          remainingFormatted,
          cancellationPolicy,
          locationText,
          isDeposit: isDepositForTemplate,
          waiverSigningUrl: waiverSigningUrl ?? "",
          manageLink: "", // Intentionally empty so Brevo template does not show "Manage booking"
          receiptLink: context.receiptLink ?? "",
        },
      }
    : {
        sender: getSender(),
        to: [{ email: toEmail, name: toName }],
        subject: emailSubject,
        htmlContent: html,
      };

  const url = `${BREVO_API_BASE}/smtp/email`;
  const body = templateId
    ? { templateId, to: payload.to, params: payload.params }
    : { sender: payload.sender, to: payload.to, subject: payload.subject, htmlContent: payload.htmlContent };

  const res = await sendWithRetry(url, body as Record<string, unknown>);
  if (!res.ok) {
    const text = await res.text();
    const errMsg = `Brevo send failed: ${res.status} ${text}`;
    console.error("[brevo] sendBookingConfirmationEmail", errMsg);
    throw new Error(errMsg);
  }
  return emailSubject;
}

const BUSINESS_EMAIL = process.env.CONTACT_EMAIL?.trim() || "boatbrosllc@gmail.com";

/**
 * Send customer email when discount code hit its usage limit at conversion; customer was charged and a partial refund will be issued.
 */
export async function sendDiscountLimitExceededCustomerEmail(params: {
  to: string;
  customerName: string;
  experienceName: string;
  tripDate?: string;
}): Promise<void> {
  const { to, customerName, experienceName, tripDate } = params;
  const subject = "Your discount could not be applied – partial refund – Boat Bros ATX";
  const tripLine = tripDate ? `<p><strong>Trip date:</strong> ${tripDate.replace(/</g, "&lt;")}</p>` : "";
  const html = `
<!DOCTYPE html>
<html><body style="font-family: sans-serif; padding: 24px;">
  <p>Hi ${customerName.replace(/</g, "&lt;")},</p>
  <p>Your booking was completed successfully. However, the discount code you used had reached its usage limit, so we were unable to apply it to your booking.</p>
  <p><strong>Experience:</strong> ${experienceName.replace(/</g, "&lt;")}</p>
  ${tripLine}
  <p><strong>A partial refund will be processed within 1–2 business days</strong> and credited to your original payment method.</p>
  <p>If you have any questions, please reply to this email or contact us.</p>
  <p style="margin-top: 24px; font-size: 12px; color: #666;">— Boat Bros ATX</p>
</body></html>`;
  try {
    const res = await sendWithRetry(
      `${BREVO_API_BASE}/smtp/email`,
      {
        sender: getSender(),
        to: [{ email: to.trim(), name: customerName.trim() || undefined }],
        subject,
        htmlContent: html,
      } as Record<string, unknown>
    );
    if (!res.ok) {
      const text = await res.text();
      console.error("[brevo] sendDiscountLimitExceededCustomerEmail", res.status, text);
    }
  } catch (err) {
    console.error("[brevo] sendDiscountLimitExceededCustomerEmail", err);
  }
}

/**
 * Send business alert when discount limit was exceeded at conversion so the team can process the refund promptly.
 */
export async function sendDiscountLimitExceededBusinessAlert(params: {
  bookingId: string;
  customerEmail: string;
  customerName: string;
  experienceName: string;
  tripDate?: string;
}): Promise<void> {
  const { bookingId, customerEmail, customerName, experienceName, tripDate } = params;
  const subject = `[Action] Discount limit exceeded – booking ${bookingId} – process partial refund`;
  const tripLine = tripDate ? `<p><strong>Trip date:</strong> ${tripDate.replace(/</g, "&lt;")}</p>` : "";
  const html = `
<!DOCTYPE html>
<html><body style="font-family: sans-serif; padding: 24px;">
  <p><strong>Discount limit exceeded at conversion.</strong> Customer was charged full amount; a partial refund must be processed.</p>
  <p><strong>Booking ID:</strong> ${bookingId.replace(/</g, "&lt;")}</p>
  <p><strong>Customer:</strong> ${customerName.replace(/</g, "&lt;")} &lt;${customerEmail.replace(/</g, "&lt;")}&gt;</p>
  <p><strong>Experience:</strong> ${experienceName.replace(/</g, "&lt;")}</p>
  ${tripLine}
  <p>Process the refund in Stripe and mark the pendingRefunds record as resolved.</p>
  <p style="margin-top: 24px; font-size: 12px; color: #666;">— Boat Bros booking system</p>
</body></html>`;
  try {
    const res = await sendWithRetry(`${BREVO_API_BASE}/smtp/email`, {
      sender: getSender(),
      to: [{ email: BUSINESS_EMAIL }],
      subject,
      htmlContent: html,
    } as Record<string, unknown>);
    if (!res.ok) {
      const text = await res.text();
      console.error("[brevo] sendDiscountLimitExceededBusinessAlert", res.status, text);
    }
  } catch (err) {
    console.error("[brevo] sendDiscountLimitExceededBusinessAlert", err);
  }
}

/**
 * Send a copy of the booking confirmation to the business (boatbrosllc@gmail.com) so they know they have a new booking.
 * Same HTML as customer; subject indicates new booking. Does not throw so customer flow is not blocked.
 */
export async function sendBookingConfirmationCopyToBusiness(booking: Booking, context: BookingEmailContext): Promise<void> {
  const html = renderBookingConfirmationHtml(booking, context);
  const customerName = booking.customer?.name?.trim() ?? "Guest";
  const { boatName, startAt } = context;
  const subject = `New booking: ${boatName} – ${startAt} – ${customerName}`;
  try {
    const res = await sendWithRetry(`${BREVO_API_BASE}/smtp/email`, {
      sender: getSender(),
      to: [{ email: BUSINESS_EMAIL }],
      subject,
      htmlContent: html,
    } as Record<string, unknown>);
    if (!res.ok) {
      const text = await res.text();
      console.error("[brevo] sendBookingConfirmationCopyToBusiness", res.status, text);
    }
  } catch (err) {
    console.error("[brevo] sendBookingConfirmationCopyToBusiness", err);
  }
}

/**
 * Send booking reminder (1-week, 24h, or day-of). Uses reminder-emails HTML.
 */
export async function sendBookingReminderEmail(
  type: ReminderType,
  params: BookingReminderParams
): Promise<void> {
  const html = buildReminderHtml(type, params);
  const subject = getReminderSubject(type, params.experienceName);
  const body = {
    sender: getSender(),
    to: [{ email: params.to.trim(), name: params.customerName.trim() || undefined }],
    subject,
    htmlContent: html,
  };
  const res = await sendWithRetry(`${BREVO_API_BASE}/smtp/email`, body);
  if (!res.ok) {
    const text = await res.text();
    console.error("[brevo] sendBookingReminderEmail final failure", type, res.status, text);
    throw new Error(`Brevo reminder send failed: ${res.status} ${text}`);
  }
}

/**
 * Send "final payment request" email (48h before trip) to customers with final_due status.
 * Includes a secure link to pay remaining balance; after payment, webhook marks booking final_paid.
 */
export async function sendFinalPaymentRequestEmail(params: FinalPaymentRequestParams): Promise<void> {
  const html = buildFinalPaymentRequestHtml(params);
  const subject = getFinalPaymentRequestSubject();
  const body = {
    sender: getSender(),
    to: [{ email: params.to.trim(), name: params.customerName.trim() || undefined }],
    subject,
    htmlContent: html,
  };
  const res = await sendWithRetry(`${BREVO_API_BASE}/smtp/email`, body);
  if (!res.ok) {
    const text = await res.text();
    console.error("[brevo] sendFinalPaymentRequestEmail final failure", res.status, text);
    throw new Error(`Brevo send failed: ${res.status} ${text}`);
  }
}

/**
 * Send "final charge failed" or "action required" email. When manageLink is provided,
 * includes a prominent CTA button to update card and pay; otherwise asks guest to contact us.
 */
export interface FinalChargeSuccessEmailParams {
  to: string;
  customerName: string;
  experienceName: string;
  tripDate: string;
  startTime: string;
  amountFormatted: string;
}

/**
 * Receipt email after the final balance PaymentIntent succeeds (deposit flow).
 */
export async function sendFinalChargeSuccessEmail(params: FinalChargeSuccessEmailParams): Promise<void> {
  const subject = `Payment received — ${params.experienceName} – Boat Bros ATX`;
  const html = `
<!DOCTYPE html>
<html><body style="font-family: sans-serif; padding: 24px; max-width: 560px;">
  <p>Hi ${params.customerName.replace(/</g, "&lt;")},</p>
  <p>We&apos;ve successfully charged <strong>${params.amountFormatted.replace(/</g, "&lt;")}</strong> for the remaining balance on your upcoming trip.</p>
  <p><strong>${params.experienceName.replace(/</g, "&lt;")}</strong><br />
  ${params.tripDate.replace(/</g, "&lt;")} at ${params.startTime.replace(/</g, "&lt;")}</p>
  <p>Thank you — you&apos;re all set. We&apos;ll see you on the water!</p>
  <p style="margin-top: 24px; font-size: 12px; color: #666;">— Boat Bros ATX</p>
</body></html>`;
  const reqBody = {
    sender: getSender(),
    to: [{ email: params.to.trim(), name: params.customerName.trim() || undefined }],
    subject,
    htmlContent: html,
  };
  const res = await sendWithRetry(`${BREVO_API_BASE}/smtp/email`, reqBody);
  if (!res.ok) {
    const text = await res.text();
    console.error("[brevo] sendFinalChargeSuccessEmail final failure", res.status, text);
    throw new Error(`Brevo send failed: ${res.status} ${text}`);
  }
}

export async function sendFinalChargeFailedEmail(
  toEmail: string,
  toName: string,
  manageLink: string | undefined,
  requiresAction: boolean
): Promise<void> {
  const subject = requiresAction
    ? "Action needed to complete your booking – Boat Bros ATX"
    : "Payment failed for your upcoming trip – Boat Bros ATX";
  const body = requiresAction
    ? "Your card requires verification to complete the remaining balance. Please reply to this email or contact us to update your card or complete payment."
    : "We couldn't charge the remaining balance for your upcoming trip. Please reply to this email or contact us to update your card or pay the remaining balance.";
  const ctaHtml =
    manageLink
      ? `<p style="margin-top: 24px;"><a href="${manageLink.replace(/"/g, "&quot;")}" style="display: inline-block; background: #0d9488; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Update your card and pay now</a></p>`
      : "";
  const html = `
<!DOCTYPE html>
<html><body style="font-family: sans-serif; padding: 24px;">
  <p>Hi ${toName.replace(/</g, "&lt;")},</p>
  <p>${body.replace(/</g, "&lt;")}</p>
  ${ctaHtml}
  <p style="margin-top: 24px; font-size: 12px; color: #666;">— Boat Bros ATX</p>
</body></html>`;
  const reqBody = {
    sender: getSender(),
    to: [{ email: toEmail.trim(), name: toName.trim() || undefined }],
    subject,
    htmlContent: html,
  };
  const res = await sendWithRetry(`${BREVO_API_BASE}/smtp/email`, reqBody);
  if (!res.ok) {
    const text = await res.text();
    console.error("[brevo] sendFinalChargeFailedEmail final failure", res.status, text);
    throw new Error(`Brevo send failed: ${res.status} ${text}`);
  }
}

/**
 * Send an urgent alert to the business when no active waiver template exists at booking creation.
 * Fire-and-forget: wraps send in try/catch and does not rethrow. Call when createWaiverForBooking would return null due to no active template.
 */
export async function sendWaiverTemplateMissingAlert(
  bookingId: string,
  customer: { name: string; email: string; phone?: string },
  tripDate: string
): Promise<void> {
  try {
    const subject = `⚠️ URGENT: No active waiver template — manual waiver needed (Booking ${bookingId})`;
    const phoneDisplay = customer.phone?.trim() ?? "—";
    const html = `
<!DOCTYPE html>
<html><body style="font-family: sans-serif; padding: 24px;">
  <h2 style="color: #b91c1c;">URGENT — No Active Waiver Template</h2>
  <table style="border-collapse: collapse;">
    <tr><td style="padding: 4px 12px 4px 0; font-weight: bold;">Booking ID:</td><td>${bookingId.replace(/</g, "&lt;")}</td></tr>
    <tr><td style="padding: 4px 12px 4px 0; font-weight: bold;">Customer name:</td><td>${customer.name.replace(/</g, "&lt;")}</td></tr>
    <tr><td style="padding: 4px 12px 4px 0; font-weight: bold;">Customer email:</td><td>${customer.email.replace(/</g, "&lt;")}</td></tr>
    <tr><td style="padding: 4px 12px 4px 0; font-weight: bold;">Customer phone:</td><td>${phoneDisplay.replace(/</g, "&lt;")}</td></tr>
    <tr><td style="padding: 4px 12px 4px 0; font-weight: bold;">Trip date:</td><td>${tripDate.replace(/</g, "&lt;")}</td></tr>
  </table>
  <p style="margin-top: 24px;">No active waiver template was found at booking creation time. Please create an active waiver template and send the waiver to this customer manually before their trip date.</p>
  <p style="margin-top: 24px; font-size: 12px; color: #666;">— Boat Bros ATX (automated alert)</p>
</body></html>`;
    const res = await sendWithRetry(`${BREVO_API_BASE}/smtp/email`, {
      sender: getSender(),
      to: [{ email: BUSINESS_EMAIL }],
      subject,
      htmlContent: html,
    } as Record<string, unknown>);
    if (!res.ok) {
      const text = await res.text();
      console.error("[brevo] sendWaiverTemplateMissingAlert", res.status, text);
      return;
    }
    console.warn("[brevo] sendWaiverTemplateMissingAlert sent", bookingId);
  } catch (err) {
    console.error("[brevo] sendWaiverTemplateMissingAlert", err);
  }
}

/**
 * Send cancellation email to the customer. Refund amounts are derived from actual Stripe refund
 * objects; only confirmed successful refunds are shown as a final amount. Pending refunds use
 * wording that reflects pending settlement.
 */
export async function sendBookingCancellationEmail(params: {
  to: string;
  customerName: string;
  experienceName: string;
  tripDate?: string;
  /** Confirmed successful refund total (from Stripe refund objects). */
  refundAmount?: string;
  /** True when at least one refund is pending; use pending wording instead of final amount. */
  refundPending?: boolean;
  /** Optional amount for pending refund(s); when set with refundPending, "refund of $X is being processed". */
  pendingRefundAmount?: string;
}): Promise<void> {
  const { to, customerName, experienceName, tripDate, refundAmount, refundPending, pendingRefundAmount } = params;
  const subject = "Booking canceled – Boat Bros ATX";
  const tripLine = tripDate ? `<p><strong>Trip date:</strong> ${tripDate.replace(/</g, "&lt;")}</p>` : "";
  const parts: string[] = [];
  if (refundAmount) {
    parts.push(`<p><strong>Refund amount:</strong> ${refundAmount.replace(/</g, "&lt;")}</p>`);
  }
  if (refundPending) {
    parts.push(
      pendingRefundAmount != null && pendingRefundAmount !== ""
        ? `<p><strong>Refund in progress:</strong> A refund of ${pendingRefundAmount.replace(/</g, "&lt;")} is being processed and will be credited to your original payment method once complete.</p>`
        : `<p><strong>Refund in progress:</strong> Your refund is being processed and will be credited to your original payment method once the refund is complete.</p>`
    );
  }
  const refundLine = parts.join("");
  const html = `
<!DOCTYPE html>
<html><body style="font-family: sans-serif; padding: 24px;">
  <p>Hi ${customerName.replace(/</g, "&lt;")},</p>
  <p>Your booking has been canceled.</p>
  <p><strong>Experience:</strong> ${experienceName.replace(/</g, "&lt;")}</p>
  ${tripLine}
  ${refundLine}
  <p>If you have any questions, please reply to this email or contact us.</p>
  <p style="margin-top: 24px; font-size: 12px; color: #666;">— Boat Bros ATX</p>
</body></html>`;
  const res = await sendWithRetry(`${BREVO_API_BASE}/smtp/email`, {
    sender: getSender(),
    to: [{ email: to.trim(), name: customerName.trim() || undefined }],
    subject,
    htmlContent: html,
  } as Record<string, unknown>);
  if (!res.ok) {
    const text = await res.text();
    console.error("[brevo] sendBookingCancellationEmail", res.status, text);
    throw new Error(`Brevo send failed: ${res.status}`);
  }
}

/**
 * Send contact form submission to the business email (CONTACT_EMAIL or boatbrosllc@gmail.com).
 * Uses same Brevo transactional API as booking emails.
 */
export async function sendContactFormEmail(name: string, email: string, message: string): Promise<void> {
  const toEmail = (process.env.CONTACT_EMAIL ?? "boatbrosllc@gmail.com").trim();
  const subject = "Contact form – Boat Bros";
  const escapedName = name.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const escapedEmail = email.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const escapedMessage = message.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
  const html = `
<!DOCTYPE html>
<html><body style="font-family: sans-serif; padding: 24px;">
  <p><strong>New contact form submission</strong></p>
  <p><strong>Name:</strong> ${escapedName}</p>
  <p><strong>Email:</strong> ${escapedEmail}</p>
  <p><strong>Message:</strong></p>
  <p style="white-space: pre-wrap;">${escapedMessage}</p>
  <p style="margin-top: 24px; font-size: 12px; color: #666;">Sent from Boat Bros contact form</p>
</body></html>`;
  const res = await sendWithRetry(`${BREVO_API_BASE}/smtp/email`, {
    sender: getSender(),
    to: [{ email: toEmail }],
    replyTo: email.trim(),
    subject,
    htmlContent: html,
  } as Record<string, unknown>);
  if (!res.ok) {
    const text = await res.text();
    console.error("[brevo] sendContactFormEmail", res.status, text);
    throw new Error(`Brevo send failed: ${res.status}`);
  }
}

/**
 * Send lead capture notification to the business email (CONTACT_EMAIL or default).
 * Body: email and source; used so leads are delivered even if Firestore is unavailable.
 */
export async function sendLeadNotificationEmail(email: string, source: string): Promise<void> {
  const toEmail = (process.env.CONTACT_EMAIL ?? "boatbrosllc@gmail.com").trim();
  const subject = "Lead capture – Boat Bros";
  const escapedEmail = email.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const escapedSource = String(source).replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `
<!DOCTYPE html>
<html><body style="font-family: sans-serif; padding: 24px;">
  <p><strong>New lead signup</strong></p>
  <p><strong>Email:</strong> ${escapedEmail}</p>
  <p><strong>Source:</strong> ${escapedSource}</p>
  <p style="margin-top: 24px; font-size: 12px; color: #666;">Sent from Boat Bros lead capture</p>
</body></html>`;
  const res = await sendWithRetry(`${BREVO_API_BASE}/smtp/email`, {
    sender: getSender(),
    to: [{ email: toEmail }],
    replyTo: email.trim(),
    subject,
    htmlContent: html,
  } as Record<string, unknown>);
  if (!res.ok) {
    const text = await res.text();
    console.error("[brevo] sendLeadNotificationEmail", res.status, text);
    throw new Error(`Brevo send failed: ${res.status}`);
  }
}

/**
 * Add or update contact in Brevo and optionally add to list (marketing opt-in).
 */
export async function upsertBrevoContact(
  email: string,
  name: string,
  phone: string,
  listId?: number
): Promise<void> {
  const listIds = listId != null ? [listId] : [];
  const res = await sendWithRetry(`${BREVO_API_BASE}/contacts`, {
    email,
    attributes: { FIRSTNAME: name.split(" ")[0] ?? name, LASTNAME: name.split(" ").slice(1).join(" ") || "", SMS: phone },
    listIds,
    updateEnabled: true,
  } as Record<string, unknown>);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo contact upsert failed: ${res.status} ${text}`);
  }
}
