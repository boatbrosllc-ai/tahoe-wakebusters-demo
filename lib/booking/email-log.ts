/**
 * Log sent transactional emails to Firestore for admin visibility.
 * Server-side only.
 */

import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import type { EmailTemplateId } from "./email-templates";

export interface EmailLogEntry {
  to: string;
  toName?: string;
  templateId: EmailTemplateId;
  subject: string;
  bookingId?: string;
  sentAt: FirebaseFirestore.Timestamp;
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
}): Promise<void> {
  const db = getDb();
  const { Timestamp } = getFirestoreExports();
  await db.collection("emailLog").add({
    to: params.to,
    toName: params.toName ?? null,
    templateId: params.templateId,
    subject: params.subject,
    bookingId: params.bookingId ?? null,
    sentAt: Timestamp.now(),
  });
}
