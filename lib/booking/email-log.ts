/**
 * Log sent transactional emails and SMS to Firestore for admin visibility.
 * Server-side only. Channel and eventSubtype support audit and observability.
 */

import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import type { EmailTemplateId } from "./email-templates";

export type NotificationChannel = "email" | "sms";

export type NotificationEventSubtype =
  | EmailTemplateId
  | "booking_cancellation"
  | "final_charge_failed"
  | "final_charge_failed_missing_payment_method"
  | "final_charge_success"
  | "dead_letter_ops_alert"
  | "waiver_invite"
  | "waiver_reminder"
  | "staff_booking_confirmation"
  | "staff_reminder"
  | "staff_final_payment_request"
  | "staff_final_charge_success";

export type NotificationAudience = "customer" | "staff";

export interface EmailLogEntry {
  to: string;
  toName?: string;
  templateId: EmailTemplateId;
  subject: string;
  bookingId?: string;
  sentAt: FirebaseFirestore.Timestamp;
  channel?: NotificationChannel;
  eventSubtype?: NotificationEventSubtype;
  /** When `staff`, internal captain/ops notification (distinct from guest sends). */
  audience?: NotificationAudience;
}

/**
 * Record that a notification was sent (email or SMS). Use for all outbound customer messages.
 */
export async function logNotificationSent(params: {
  channel: NotificationChannel;
  to: string;
  toName?: string;
  templateId: EmailTemplateId | NotificationEventSubtype;
  subject?: string;
  bookingId?: string;
  eventSubtype?: NotificationEventSubtype;
  /** For SMS: message body or snippet. */
  bodySnippet?: string;
  audience?: NotificationAudience;
  /** Delivery failure state for staff/ops channel (optional). */
  deliveryState?: "sent" | "failed";
}): Promise<void> {
  const db = getDb();
  const { Timestamp } = getFirestoreExports();
  await db.collection("emailLog").add({
    channel: params.channel,
    to: params.to,
    toName: params.toName ?? null,
    templateId: params.templateId,
    subject: params.subject ?? null,
    bookingId: params.bookingId ?? null,
    eventSubtype: params.eventSubtype ?? params.templateId,
    bodySnippet: params.bodySnippet ?? null,
    audience: params.audience ?? "customer",
    deliveryState: params.deliveryState ?? null,
    sentAt: Timestamp.now(),
  });
}

/**
 * Record that an email was sent (call after successful Brevo send).
 */
export async function logEmailSent(params: {
  to: string;
  toName?: string;
  templateId: EmailTemplateId | NotificationEventSubtype;
  subject: string;
  bookingId?: string;
  eventSubtype?: NotificationEventSubtype;
  audience?: NotificationAudience;
  deliveryState?: "sent" | "failed";
}): Promise<void> {
  await logNotificationSent({
    channel: "email",
    to: params.to,
    toName: params.toName,
    templateId: params.templateId as EmailTemplateId | NotificationEventSubtype,
    subject: params.subject,
    bookingId: params.bookingId,
    eventSubtype: params.eventSubtype ?? (params.templateId as NotificationEventSubtype),
    audience: params.audience,
    deliveryState: params.deliveryState,
  });
}

/**
 * Record that an SMS was sent (call after successful send).
 */
export async function logSmsSent(params: {
  to: string;
  toName?: string;
  templateId: EmailTemplateId | NotificationEventSubtype;
  bookingId?: string;
  bodySnippet?: string;
}): Promise<void> {
  await logNotificationSent({
    channel: "sms",
    to: params.to,
    toName: params.toName,
    templateId: params.templateId,
    bookingId: params.bookingId,
    eventSubtype: params.templateId,
    bodySnippet: params.bodySnippet,
  });
}
