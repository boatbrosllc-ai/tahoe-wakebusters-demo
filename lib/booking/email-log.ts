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
  | "final_charge_success"
  | "waiver_invite"
  | "waiver_reminder";

export interface EmailLogEntry {
  to: string;
  toName?: string;
  templateId: EmailTemplateId;
  subject: string;
  bookingId?: string;
  sentAt: FirebaseFirestore.Timestamp;
  channel?: NotificationChannel;
  eventSubtype?: NotificationEventSubtype;
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
    sentAt: Timestamp.now(),
  });
}

/**
 * Record that an email was sent (call after successful Brevo send).
 */
export async function logEmailSent(params: {
  to: string;
  toName?: string;
  templateId: EmailTemplateId;
  subject: string;
  bookingId?: string;
  eventSubtype?: NotificationEventSubtype;
}): Promise<void> {
  await logNotificationSent({
    channel: "email",
    to: params.to,
    toName: params.toName,
    templateId: params.templateId,
    subject: params.subject,
    bookingId: params.bookingId,
    eventSubtype: params.eventSubtype ?? params.templateId,
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
