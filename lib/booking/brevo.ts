/**
 * Brevo (Sendinblue) — transactional email and contact upsert.
 * Server-side only. Uses BREVO_API_KEY.
 *
 * Booking confirmation: rendered HTML is the canonical customer receipt. Template param `receiptLink` is an optional
 * bookmark to the success page when `RECEIPT_TOKEN_SECRET` is set (same optional shortcut as SMS), not a separate receipt email.
 * `manageLink` is passed empty so signed manage URLs are not embedded in the message body.
 */

import { brand } from "@/content/brand";
import { getNoreplyEmail, getSenderName, getContactEmail } from "@/config/site";
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
import { signReceiptToken } from "./receiptToken";
import { DEPOSIT_FRACTION } from "./constants";

const BREVO_API_BASE = "https://api.brevo.com/v3";

const BREVO_FETCH_TIMEOUT_MS = 8000;
/** Exponential back-off: 1s, then 3s before final failure. */
const SEND_RETRY_DELAYS_MS = [1000, 3000];

const SKIPPED_EMAIL_MESSAGE_ID = "skipped:email-unconfigured";

function isBrevoConfigured(): boolean {
  return Boolean(bookingEnv.brevoApiKey.trim());
}

function getHeaders(): Record<string, string> {
  return {
    "api-key": bookingEnv.brevoApiKey,
    "Content-Type": "application/json",
  };
}

function fetchOpts(): RequestInit {
  return { signal: AbortSignal.timeout(BREVO_FETCH_TIMEOUT_MS) };
}

/** Brevo returns `{ messageId: string }` on successful transactional sends. */
export async function parseBrevoProviderMessageId(res: Response): Promise<string | undefined> {
  try {
    const json = (await res.clone().json()) as { messageId?: string };
    return typeof json.messageId === "string" ? json.messageId : undefined;
  } catch {
    return undefined;
  }
}

async function sendWithRetry(
  url: string,
  body: Record<string, unknown>,
  opts?: { retries?: number; idempotencyKey?: string }
): Promise<Response> {
  if (!isBrevoConfigured()) {
    return new Response(JSON.stringify({ messageId: SKIPPED_EMAIL_MESSAGE_ID }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  const retries = opts?.retries ?? 2;
  const headers: Record<string, string> = { ...getHeaders() };
  if (opts?.idempotencyKey) {
    headers["Idempotency-Key"] = opts.idempotencyKey;
  }
  let lastRes: Response | null = null;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
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
  /** True when deposit (see DEPOSIT_FRACTION) was paid; remaining charged at T-48h. */
  isDeposit?: boolean;
  /** When true, remaining balance was already charged (e.g. resend for final_paid); use "was charged" not "will be charged". */
  remainingAlreadyCharged?: boolean;
  /** ISO date string for when the remaining balance will be auto-charged (when isDeposit and !remainingAlreadyCharged). */
  finalChargeAt?: string;
  /**
   * Intentionally omitted from customer confirmation: manage links embed a signed token; we pass an empty string in
   * Brevo template params so templates do not surface a full-token URL in email. SMS may still use a separate optional receipt bookmark.
   */
  manageLink?: string;
  /**
   * @deprecated Optional Brevo param name only — not a second “receipt email”. Confirmation HTML is the receipt;
   * when set, this is an optional bookmark URL for templates that still reference `receiptLink` (same as SMS shortcut when secret is set).
   */
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
  const email = getNoreplyEmail();
  const name = getSenderName();
  return { name, email };
}

export type BrevoSendResult = {
  /** Email subject line (customer-facing). */
  subject: string;
  /** Brevo `messageId` when present in API response. */
  providerMessageId?: string;
};

/**
 * Send booking confirmation email to the customer email from the booking details form.
 * Uses transactional send endpoint. If BREVO_BOOKING_TEMPLATE_ID is set, use template; else send HTML from email-templates.
 * Pass context for formatted date/time and boat/location/cancellation text.
 * Returns subject and optional provider message id for durable idempotency.
 */
export async function sendBookingConfirmationEmail(
  booking: Booking,
  context: BookingEmailContext,
  opts?: { idempotencyKey?: string }
): Promise<BrevoSendResult> {
  const toEmail = booking.customer?.email?.trim();
  if (!toEmail) {
    throw new Error("Booking customer email is required to send confirmation");
  }
  const html = renderBookingConfirmationHtml(booking, context);

  const templateId = bookingEnv.brevoBookingTemplateId;
  const {
    boatName,
    startAt,
    endAt,
    durationHours,
    locationText,
    cancellationPolicyText,
    waiverSigningUrl,
    waiverGroupSigningUrl,
    addonsSummary: addonsSummaryFromContext,
  } = context;
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
  const depositPct = Math.round(DEPOSIT_FRACTION * 100);
  /** Amount paid in this transaction: deposit when partial deposit flow, full total when full payment. Use this in templates for "You paid X" to avoid showing full total for deposit. */
  const amountPaidNowFormatted = isDepositForTemplate ? depositPaidFormatted : totalPaid;
  const cancellationPolicy = cancellationPolicyText || DEFAULT_CANCELLATION_POLICY;

  const bookingIdForLink = (booking as { id?: string }).id?.trim();
  const longLivedReceiptToken = bookingIdForLink ? signReceiptToken(bookingIdForLink) : null;
  const receiptLinkResolved =
    longLivedReceiptToken != null
      ? `${bookingEnv.appBaseUrl}/booking/success?receipt_token=${encodeURIComponent(longLivedReceiptToken)}`
      : "";

  const subjectForDeposit = isDepositForTemplate ? " (deposit received)" : "";
  const subjectBase = waiverSigningUrl ? "Booking Confirmation & Waiver" : "Booking Confirmation";
  const subjectSuffix = ` – ${brand.companyName}`;
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
          depositPct,
          cancellationPolicy,
          locationText,
          isDeposit: isDepositForTemplate,
          waiverSigningUrl: waiverSigningUrl ?? "",
          waiverGroupSigningUrl: waiverGroupSigningUrl ?? "",
          manageLink: "",
          /** Optional bookmark when `RECEIPT_TOKEN_SECRET` is set; empty string otherwise. Confirmation HTML is the receipt — not a separate receipt link. */
          receiptLink: receiptLinkResolved,
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

  const bookingIdForIdem = (booking as { id?: string }).id?.trim();
  const idempotencyKey = opts?.idempotencyKey ?? (bookingIdForIdem ? `${bookingIdForIdem}_booking_confirmation` : undefined);

  const res = await sendWithRetry(url, body as Record<string, unknown>, { idempotencyKey });
  if (!res.ok) {
    const text = await res.text();
    const errMsg = `Brevo send failed: ${res.status} ${text}`;
    console.error("[brevo] sendBookingConfirmationEmail", errMsg);
    throw new Error(errMsg);
  }
  const providerMessageId = await parseBrevoProviderMessageId(res);
  return { subject: emailSubject, providerMessageId };
}

const BUSINESS_EMAIL = getContactEmail();

/** Ops / captain / staff (distinct from guest-facing noreply). */
export function getStaffOperationsEmail(): string {
  return process.env.STAFF_OPERATIONS_EMAIL?.trim() || BUSINESS_EMAIL;
}

/** Ops inbox when amount integrity blocks conversion (supplements Firestore operationalAlerts). */
export async function sendAmountIntegrityMismatchOpsEmail(params: {
  holdId: string;
  paymentIntentId?: string;
  source: string;
}): Promise<void> {
  const piLine = params.paymentIntentId
    ? `<p><strong>PaymentIntent:</strong> ${params.paymentIntentId.replace(/</g, "&lt;")}</p>`
    : "";
  await sendStaffInternalEmail({
    subject: `[Alert] Amount integrity mismatch — hold ${params.holdId}`,
    htmlContent: `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:16px;">
<p><strong>Amount integrity mismatch</strong> — booking not created; pending refund / review may apply.</p>
<p><strong>Hold:</strong> ${params.holdId.replace(/</g, "&lt;")}</p>
${piLine}
<p><strong>Source:</strong> ${params.source.replace(/</g, "&lt;")}</p>
<p>See Firestore <code>operationalAlerts</code> and <code>pendingRefunds</code>.</p>
</body></html>`,
    idempotencyKey: `amount_integrity_ops_${params.holdId}_${params.paymentIntentId ?? ""}`,
  });
}

/** Guest-facing email when payment succeeded but amount integrity blocked conversion. */
export async function sendAmountIntegrityMismatchCustomerEmail(params: {
  to: string;
  customerName: string;
  holdId: string;
}): Promise<void> {
  const { to, customerName, holdId } = params;
  const subject = `We received your payment — your booking is under review – ${brand.companyName}`;
  const html = `
<!DOCTYPE html>
<html><body style="font-family: sans-serif; padding: 24px;">
  <p>Hi ${customerName.replace(/</g, "&lt;")},</p>
  <p>We successfully received your payment. We need to complete a quick review of your reservation details before your booking is finalized.</p>
  <p><strong>You do not need to pay again.</strong> Our team will contact you within <strong>2 hours</strong> with an update. If you do not hear from us by then, please reply to this email or call us.</p>
  <p style="font-size: 12px; color: #666;">Reference: hold ${holdId.replace(/</g, "&lt;")}</p>
  <p style="margin-top: 24px; font-size: 12px; color: #666;">— ${brand.companyName}</p>
</body></html>`;
  const res = await sendWithRetry(
    `${BREVO_API_BASE}/smtp/email`,
    {
      sender: getSender(),
      to: [{ email: to.trim(), name: customerName.trim() || undefined }],
      subject,
      htmlContent: html,
    } as Record<string, unknown>,
    { idempotencyKey: `amount_integrity_notice_${holdId}` }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo send failed: ${res.status} ${text}`);
  }
}

/** Guest email when payment stage required manual review before conversion (rollback path). */
export async function sendPaymentUnderManualReviewCustomerEmail(params: {
  to: string;
  customerName: string;
  holdId: string;
}): Promise<void> {
  const { to, customerName, holdId } = params;
  const subject = `We received your payment — manual review – ${brand.companyName}`;
  const html = `
<!DOCTYPE html>
<html><body style="font-family: sans-serif; padding: 24px;">
  <p>Hi ${customerName.replace(/</g, "&lt;")},</p>
  <p>We received your payment. Your reservation is under review while we confirm a few details with our payment partner.</p>
  <p><strong>You do not need to pay again.</strong> We will contact you within <strong>one business day</strong> with an update. If you have urgent questions, reply to this email or call us.</p>
  <p style="font-size: 12px; color: #666;">Reference: hold ${holdId.replace(/</g, "&lt;")}</p>
  <p style="margin-top: 24px; font-size: 12px; color: #666;">— ${brand.companyName}</p>
</body></html>`;
  const res = await sendWithRetry(
    `${BREVO_API_BASE}/smtp/email`,
    {
      sender: getSender(),
      to: [{ email: to.trim(), name: customerName.trim() || undefined }],
      subject,
      htmlContent: html,
    } as Record<string, unknown>,
    { idempotencyKey: `manual_review_notice_${holdId}` }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo send failed: ${res.status} ${text}`);
  }
}

/**
 * Email ops when a notification outbox row reaches dead_letter (in addition to Firestore operationalAlerts).
 */
export async function sendNotificationOutboxDeadLetterOpsEmail(params: {
  outboxType: string;
  bookingId: string;
  lastError: string;
}): Promise<void> {
  const { outboxType, bookingId, lastError } = params;
  const safeErr = lastError.replace(/</g, "&lt;").slice(0, 2000);
  await sendStaffInternalEmail({
    subject: `[Alert] Confirmation pipeline dead letter — ${outboxType} — ${bookingId}`,
    htmlContent: `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:16px;">
<p><strong>Notification outbox dead letter</strong></p>
<p><strong>Type:</strong> ${outboxType.replace(/</g, "&lt;")}</p>
<p><strong>Booking ID:</strong> ${bookingId.replace(/</g, "&lt;")}</p>
<p><strong>Last error:</strong> ${safeErr}</p>
<p>Investigate in Admin (outbox stats) and contact the guest if confirmation never arrived.</p>
</body></html>`,
    idempotencyKey: `dead_letter_ops_${bookingId}_${outboxType}`,
  });
}

/**
 * Internal staff email (Brevo). Throws on transport failure; callers treat logging as best-effort.
 */
export async function sendStaffInternalEmail(params: {
  subject: string;
  htmlContent: string;
  idempotencyKey?: string;
}): Promise<{ providerMessageId?: string }> {
  const res = await sendWithRetry(
    `${BREVO_API_BASE}/smtp/email`,
    {
      sender: getSender(),
      to: [{ email: getStaffOperationsEmail() }],
      subject: params.subject,
      htmlContent: params.htmlContent,
    } as Record<string, unknown>,
    { idempotencyKey: params.idempotencyKey }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo staff send failed: ${res.status} ${text}`);
  }
  return { providerMessageId: await parseBrevoProviderMessageId(res) };
}

/**
 * Send customer email when discount code hit its usage limit at conversion; customer was charged and a partial refund will be issued.
 */
export async function sendDiscountLimitExceededCustomerEmail(params: {
  to: string;
  customerName: string;
  experienceName: string;
  tripDate?: string;
  /** For Brevo idempotency when booking id is known */
  bookingId?: string;
}): Promise<void> {
  const { to, customerName, experienceName, tripDate, bookingId } = params;
  const subject = `Your discount could not be applied – partial refund – ${brand.companyName}`;
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
  <p style="margin-top: 24px; font-size: 12px; color: #666;">— ${brand.companyName}</p>
</body></html>`;
  const res = await sendWithRetry(
    `${BREVO_API_BASE}/smtp/email`,
    {
      sender: getSender(),
      to: [{ email: to.trim(), name: customerName.trim() || undefined }],
      subject,
      htmlContent: html,
    } as Record<string, unknown>,
    { idempotencyKey: bookingId ? `discount_limit_customer_${bookingId}` : `discount_limit_customer_${to.trim().slice(0, 48)}` }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo send failed: ${res.status} ${text}`);
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
  <p style="margin-top: 24px; font-size: 12px; color: #666;">— ${brand.companyName} booking system</p>
</body></html>`;
  const res = await sendWithRetry(`${BREVO_API_BASE}/smtp/email`, {
    sender: getSender(),
    to: [{ email: getStaffOperationsEmail() }],
    subject,
    htmlContent: html,
  } as Record<string, unknown>, { idempotencyKey: `discount_limit_biz_${bookingId}` });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo send failed: ${res.status} ${text}`);
  }
}

/**
 * Alert operators when automated pending-refund processing permanently fails so refunds can be completed manually.
 */
export async function sendPendingRefundPermanentFailureAlert(params: {
  pendingRefundId: string;
  paymentIntentId?: string;
  reason?: string;
  error: string;
}): Promise<void> {
  const { pendingRefundId, paymentIntentId, reason, error } = params;
  const subject = `[Action] Pending refund permanently failed – ${pendingRefundId}`;
  const piLine = paymentIntentId
    ? `<p><strong>PaymentIntent:</strong> ${paymentIntentId.replace(/</g, "&lt;")}</p>`
    : "";
  const reasonLine = reason
    ? `<p><strong>Reason:</strong> ${String(reason).replace(/</g, "&lt;")}</p>`
    : "";
  const html = `
<!DOCTYPE html>
<html><body style="font-family: sans-serif; padding: 24px;">
  <p><strong>Automated refund processing gave up after max retries.</strong> Process the refund in Stripe and update the pendingRefunds record.</p>
  <p><strong>Pending refund ID:</strong> ${pendingRefundId.replace(/</g, "&lt;")}</p>
  ${piLine}
  ${reasonLine}
  <p><strong>Last error:</strong> ${error.replace(/</g, "&lt;").slice(0, 2000)}</p>
  <p style="margin-top: 24px; font-size: 12px; color: #666;">— ${brand.companyName} booking system</p>
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
      console.error("[brevo] sendPendingRefundPermanentFailureAlert", res.status, text);
    }
  } catch (err) {
    console.error("[brevo] sendPendingRefundPermanentFailureAlert", err);
  }
}

/**
 * Send a copy of the booking confirmation to the business inbox so they know they have a new booking.
 * Same HTML as customer; subject indicates new booking. Throws on transport failure (outbox caller records operational alert).
 */
export async function sendBookingConfirmationCopyToBusiness(
  booking: Booking,
  context: BookingEmailContext,
  opts?: { idempotencyKey?: string }
): Promise<void> {
  const html = renderBookingConfirmationHtml(booking, context);
  const customerName = booking.customer?.name?.trim() ?? "Guest";
  const { boatName, startAt } = context;
  const subject = `New booking: ${boatName} – ${startAt} – ${customerName}`;
  const bookingIdForIdem = (booking as { id?: string }).id?.trim();
  const idempotencyKey =
    opts?.idempotencyKey ??
    (bookingIdForIdem ? `${bookingIdForIdem}_booking_confirmation_business_copy` : undefined);
  const res = await sendWithRetry(`${BREVO_API_BASE}/smtp/email`, {
    sender: getSender(),
    to: [{ email: BUSINESS_EMAIL }],
    subject,
    htmlContent: html,
  } as Record<string, unknown>, { idempotencyKey });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo business copy send failed: ${res.status} ${text}`);
  }
}

/**
 * Send booking reminder (1-week, 24h, or day-of). Uses reminder-emails HTML.
 * Returns optional Brevo message id after confirmed delivery.
 */
export async function sendBookingReminderEmail(
  type: ReminderType,
  params: BookingReminderParams,
  opts?: { idempotencyKey?: string }
): Promise<{ providerMessageId?: string }> {
  const html = buildReminderHtml(type, params);
  const subject = getReminderSubject(type, params.experienceName);
  const body = {
    sender: getSender(),
    to: [{ email: params.to.trim(), name: params.customerName.trim() || undefined }],
    subject,
    htmlContent: html,
  };
  const res = await sendWithRetry(`${BREVO_API_BASE}/smtp/email`, body, { idempotencyKey: opts?.idempotencyKey });
  if (!res.ok) {
    const text = await res.text();
    console.error("[brevo] sendBookingReminderEmail final failure", type, res.status, text);
    throw new Error(`Brevo reminder send failed: ${res.status} ${text}`);
  }
  return { providerMessageId: await parseBrevoProviderMessageId(res) };
}

/**
 * Send "final payment request" email (48h before trip) to customers with final_due status.
 * Includes a secure link to pay remaining balance; after payment, webhook marks booking final_paid.
 */
export async function sendFinalPaymentRequestEmail(
  params: FinalPaymentRequestParams,
  opts?: { idempotencyKey?: string }
): Promise<{ providerMessageId?: string }> {
  const html = buildFinalPaymentRequestHtml(params);
  const subject = getFinalPaymentRequestSubject();
  const body = {
    sender: getSender(),
    to: [{ email: params.to.trim(), name: params.customerName.trim() || undefined }],
    subject,
    htmlContent: html,
  };
  const res = await sendWithRetry(`${BREVO_API_BASE}/smtp/email`, body, { idempotencyKey: opts?.idempotencyKey });
  if (!res.ok) {
    const text = await res.text();
    console.error("[brevo] sendFinalPaymentRequestEmail final failure", res.status, text);
    throw new Error(`Brevo send failed: ${res.status} ${text}`);
  }
  return { providerMessageId: await parseBrevoProviderMessageId(res) };
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
export async function sendFinalChargeSuccessEmail(
  params: FinalChargeSuccessEmailParams,
  opts?: { idempotencyKey?: string }
): Promise<{ providerMessageId?: string }> {
  const subject = `Payment received — ${params.experienceName} – ${brand.companyName}`;
  const html = `
<!DOCTYPE html>
<html><body style="font-family: sans-serif; padding: 24px; max-width: 560px;">
  <p>Hi ${params.customerName.replace(/</g, "&lt;")},</p>
  <p>We&apos;ve successfully charged <strong>${params.amountFormatted.replace(/</g, "&lt;")}</strong> for the remaining balance on your upcoming trip.</p>
  <p><strong>${params.experienceName.replace(/</g, "&lt;")}</strong><br />
  ${params.tripDate.replace(/</g, "&lt;")} at ${params.startTime.replace(/</g, "&lt;")}</p>
  <p>Thank you — you&apos;re all set. We&apos;ll see you on the water!</p>
  <p style="margin-top: 24px; font-size: 12px; color: #666;">— ${brand.companyName}</p>
</body></html>`;
  const reqBody = {
    sender: getSender(),
    to: [{ email: params.to.trim(), name: params.customerName.trim() || undefined }],
    subject,
    htmlContent: html,
  };
  const res = await sendWithRetry(`${BREVO_API_BASE}/smtp/email`, reqBody, { idempotencyKey: opts?.idempotencyKey });
  if (!res.ok) {
    const text = await res.text();
    console.error("[brevo] sendFinalChargeSuccessEmail final failure", res.status, text);
    throw new Error(`Brevo send failed: ${res.status} ${text}`);
  }
  return { providerMessageId: await parseBrevoProviderMessageId(res) };
}

export interface FinalChargeFailedEmailTripDetails {
  experienceName?: string;
  tripDate?: string;
  startTime?: string;
}

function finalChargeFailedTripDetailsHtml(trip?: FinalChargeFailedEmailTripDetails): string {
  if (!trip) return "";
  const exp = trip.experienceName?.trim();
  const td = trip.tripDate?.trim();
  const st = trip.startTime?.trim();
  if (!exp && !td && !st) return "";
  const esc = (s: string) => s.replace(/</g, "&lt;");
  const strong = exp ? `<strong>${esc(exp)}</strong>` : "";
  const when = td && st ? `${esc(td)} at ${esc(st)}` : td ? esc(td) : st ? esc(st) : "";
  if (strong && when) return `<p>${strong}<br />${when}</p>`;
  if (strong) return `<p>${strong}</p>`;
  if (when) return `<p>${when}</p>`;
  return "";
}

export async function sendFinalChargeFailedEmail(
  toEmail: string,
  toName: string,
  manageLink: string | undefined,
  requiresAction: boolean,
  tripDetails?: FinalChargeFailedEmailTripDetails
): Promise<void> {
  const subject = requiresAction
    ? `Action needed to complete your booking – ${brand.companyName}`
    : `Payment failed for your upcoming trip – ${brand.companyName}`;
  const body = requiresAction
    ? "Your card requires verification to complete the remaining balance. Please reply to this email or contact us to update your card or complete payment."
    : "We couldn't charge the remaining balance for your upcoming trip. Please reply to this email or contact us to update your card or pay the remaining balance.";
  const ctaHtml =
    manageLink
      ? `<p style="margin-top: 24px;"><a href="${manageLink.replace(/"/g, "&quot;")}" style="display: inline-block; background: #0d9488; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Update your card and pay now</a></p>`
      : "";
  const tripHtml = finalChargeFailedTripDetailsHtml(tripDetails);
  const html = `
<!DOCTYPE html>
<html><body style="font-family: sans-serif; padding: 24px;">
  <p>Hi ${toName.replace(/</g, "&lt;")},</p>
  <p>${body.replace(/</g, "&lt;")}</p>
  ${tripHtml}
  ${ctaHtml}
  <p style="margin-top: 24px; font-size: 12px; color: #666;">— ${brand.companyName}</p>
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
  <p style="margin-top: 24px; font-size: 12px; color: #666;">— ${brand.companyName} (automated alert)</p>
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
  /** Aligns body copy with SMS and actual cancel/refund result. */
  refundOutcome?: "succeeded" | "pending" | "failed" | "skipped";
}): Promise<void> {
  const {
    to,
    customerName,
    experienceName,
    tripDate,
    refundAmount,
    refundPending,
    pendingRefundAmount,
    refundOutcome,
  } = params;
  const subject = `Booking canceled – ${brand.companyName}`;
  const tripLine = tripDate ? `<p><strong>Trip date:</strong> ${tripDate.replace(/</g, "&lt;")}</p>` : "";
  let refundLine = "";
  if (refundOutcome === "skipped") {
    refundLine =
      "<p><strong>Refund:</strong> No refund is being issued for this cancellation.</p>";
  } else if (refundOutcome === "failed") {
    refundLine =
      "<p><strong>Refund:</strong> We were unable to complete your refund automatically. Please reply to this email and we&apos;ll help you as soon as possible.</p>";
  } else if (refundOutcome === "succeeded") {
    const parts: string[] = [];
    if (refundAmount) {
      parts.push(`<p><strong>Refund amount:</strong> ${refundAmount.replace(/</g, "&lt;")}</p>`);
    }
    parts.push(
      "<p>Your refund will be credited to your original payment method. Timing depends on your bank or card issuer.</p>"
    );
    refundLine = parts.join("");
  } else if (refundOutcome === "pending") {
    const parts: string[] = [];
    if (refundPending) {
      parts.push(
        pendingRefundAmount != null && pendingRefundAmount !== ""
          ? `<p><strong>Refund in progress:</strong> A refund of ${pendingRefundAmount.replace(/</g, "&lt;")} is being processed and will be credited to your original payment method once complete.</p>`
          : `<p><strong>Refund in progress:</strong> Your refund is being processed and will be credited to your original payment method once the refund is complete.</p>`
      );
    } else {
      parts.push(
        "<p><strong>Refund in progress:</strong> Your refund is being processed and will be credited to your original payment method once complete.</p>"
      );
    }
    refundLine = parts.join("");
  } else {
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
    refundLine = parts.join("");
  }
  const html = `
<!DOCTYPE html>
<html><body style="font-family: sans-serif; padding: 24px;">
  <p>Hi ${customerName.replace(/</g, "&lt;")},</p>
  <p>Your booking has been canceled.</p>
  <p><strong>Experience:</strong> ${experienceName.replace(/</g, "&lt;")}</p>
  ${tripLine}
  ${refundLine}
  <p>If you have any questions, please reply to this email or contact us.</p>
  <p style="margin-top: 24px; font-size: 12px; color: #666;">— ${brand.companyName}</p>
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
 * Send contact form submission to the business email (CONTACT_EMAIL).
 * Uses same Brevo transactional API as booking emails.
 */
export async function sendContactFormEmail(name: string, email: string, message: string): Promise<void> {
  const toEmail = getContactEmail();
  const subject = `Contact form – ${brand.companyName}`;
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
  <p style="margin-top: 24px; font-size: 12px; color: #666;">Sent from ${brand.companyName} contact form</p>
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
  const toEmail = getContactEmail();
  const subject = `Lead capture – ${brand.companyName}`;
  const escapedEmail = email.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const escapedSource = String(source).replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `
<!DOCTYPE html>
<html><body style="font-family: sans-serif; padding: 24px;">
  <p><strong>New lead signup</strong></p>
  <p><strong>Email:</strong> ${escapedEmail}</p>
  <p><strong>Source:</strong> ${escapedSource}</p>
  <p style="margin-top: 24px; font-size: 12px; color: #666;">Sent from ${brand.companyName} lead capture</p>
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
