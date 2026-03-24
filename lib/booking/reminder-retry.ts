/**
 * Durable retry queue for failed reminder and final-payment sends.
 * Process due retries first (nextAttemptAt <= now), then fresh sends.
 * Max attempts, dead-letter, and admin-visible failed records.
 */

import type { Firestore } from "firebase-admin/firestore";
import { getFirestoreExports } from "./firebase-admin";
import type { ReminderRetryEntry, ReminderRetryStatus } from "./types";

const COLLECTION = "reminderRetryQueue";
const MAX_ATTEMPTS = 5;
const INITIAL_BACKOFF_MS = 2 * 60 * 1000; // 2 min
const MAX_BACKOFF_MS = 24 * 60 * 60 * 1000; // 24 h

export type ReminderTemplateKey =
  | "reminder_1week"
  | "reminder_24h"
  | "reminder_dayof"
  | "final_payment_request"
  | "final_charge_success";

function nextAttemptAt(attemptCount: number): Date {
  const delay = Math.min(INITIAL_BACKOFF_MS * Math.pow(2, attemptCount), MAX_BACKOFF_MS);
  return new Date(Date.now() + delay);
}

function docId(bookingId: string, templateKey: string): string {
  return `${bookingId}_${templateKey}`;
}

export async function addToRetryQueue(
  db: Firestore,
  bookingId: string,
  templateKey: ReminderTemplateKey,
  lastError: string
): Promise<void> {
  const { Timestamp, FieldValue } = getFirestoreExports();
  const ref = db.collection(COLLECTION).doc(docId(bookingId, templateKey));
  const now = Timestamp.now();

  const snap = await ref.get();
  const existing = snap.exists ? (snap.data() as ReminderRetryEntry) : null;
  const attemptCount = existing ? (existing.attemptCount ?? 0) + 1 : 1;
  const isDeadLetter = attemptCount >= MAX_ATTEMPTS;
  const status: ReminderRetryStatus = isDeadLetter ? "dead_letter" : "pending";

  const entry: Partial<ReminderRetryEntry> = {
    bookingId,
    templateKey,
    attemptCount,
    maxAttempts: MAX_ATTEMPTS,
    nextAttemptAt: isDeadLetter ? now : Timestamp.fromDate(nextAttemptAt(attemptCount)),
    status,
    lastError,
    lastAttemptAt: now,
    updatedAt: now,
  };

  if (existing) {
    await ref.update(entry);
  } else {
    await ref.set({
      ...entry,
      createdAt: now,
    });
  }

  if (isDeadLetter) {
    console.warn("[reminder-retry] dead_letter", { bookingId, templateKey, attemptCount });
  }
}

/**
 * Get due retry entries (nextAttemptAt <= now, status pending). Returns at most limit.
 */
export async function getDueRetries(
  db: Firestore,
  limit: number
): Promise<{ id: string; bookingId: string; templateKey: ReminderTemplateKey }[]> {
  const now = getFirestoreExports().Timestamp.now();
  const snap = await db
    .collection(COLLECTION)
    .where("status", "==", "pending")
    .where("nextAttemptAt", "<=", now)
    .orderBy("nextAttemptAt", "asc")
    .limit(limit)
    .get();

  return snap.docs.map((d) => {
    const data = d.data() as ReminderRetryEntry;
    return { id: d.id, bookingId: data.bookingId, templateKey: data.templateKey };
  });
}

export async function markRetrySent(
  db: Firestore,
  bookingId: string,
  templateKey: string,
  opts?: { providerMessageId?: string }
): Promise<void> {
  const { FieldValue } = getFirestoreExports();
  const ref = db.collection(COLLECTION).doc(docId(bookingId, templateKey));
  await ref.update({
    status: "sent",
    sentAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    ...(opts?.providerMessageId ? { providerMessageId: opts.providerMessageId } : {}),
  });
}

export async function markRetrySkipped(
  db: Firestore,
  bookingId: string,
  templateKey: ReminderTemplateKey,
  reason: string
): Promise<void> {
  const { FieldValue } = getFirestoreExports();
  const ref = db.collection(COLLECTION).doc(docId(bookingId, templateKey));
  await ref.update({
    status: "skipped",
    skipReason: reason,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function markRetryFailed(
  db: Firestore,
  bookingId: string,
  templateKey: string,
  lastError: string
): Promise<void> {
  const { Timestamp, FieldValue } = getFirestoreExports();
  const ref = db.collection(COLLECTION).doc(docId(bookingId, templateKey));
  const snap = await ref.get();
  const data = snap.exists ? (snap.data() as ReminderRetryEntry) : null;
  const attemptCount = (data?.attemptCount ?? 0) + 1;
  const maxAttempts = data?.maxAttempts ?? MAX_ATTEMPTS;
  const isDeadLetter = attemptCount >= maxAttempts;
  await ref.update({
    attemptCount,
    nextAttemptAt: isDeadLetter ? Timestamp.now() : Timestamp.fromDate(nextAttemptAt(attemptCount)),
    status: isDeadLetter ? "dead_letter" : "pending",
    lastError,
    lastAttemptAt: Timestamp.now(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

const ALL_TEMPLATE_KEYS: ReminderTemplateKey[] = [
  "reminder_1week",
  "reminder_24h",
  "reminder_dayof",
  "final_payment_request",
  "final_charge_success",
];

export type ReminderRetryPerTemplateStats = {
  pending: number;
  sent: number;
  deadLetter: number;
  skipped: number;
  /** Recent error text for failed / queued retries (admin visibility). */
  lastErrorSnippet?: string;
};

/** Counts and last error snippet per template for admin health dashboards. */
export async function getReminderRetryQueueStatsByTemplate(
  db: Firestore
): Promise<Record<ReminderTemplateKey, ReminderRetryPerTemplateStats>> {
  const empty = (): ReminderRetryPerTemplateStats => ({
    pending: 0,
    sent: 0,
    deadLetter: 0,
    skipped: 0,
  });
  const out: Record<ReminderTemplateKey, ReminderRetryPerTemplateStats> = {
    reminder_1week: empty(),
    reminder_24h: empty(),
    reminder_dayof: empty(),
    final_payment_request: empty(),
    final_charge_success: empty(),
  };

  const countTasks = ALL_TEMPLATE_KEYS.flatMap((templateKey) =>
    (["pending", "sent", "dead_letter", "skipped"] as ReminderRetryStatus[]).map(async (status) => {
      const snap = await db
        .collection(COLLECTION)
        .where("templateKey", "==", templateKey)
        .where("status", "==", status)
        .count()
        .get();
      const n = snap.data().count;
      if (status === "pending") out[templateKey].pending = n;
      else if (status === "sent") out[templateKey].sent = n;
      else if (status === "dead_letter") out[templateKey].deadLetter = n;
      else out[templateKey].skipped = n;
    })
  );

  const snippetTasks = ALL_TEMPLATE_KEYS.map(async (templateKey) => {
    const dead = await db
      .collection(COLLECTION)
      .where("templateKey", "==", templateKey)
      .where("status", "==", "dead_letter")
      .orderBy("lastAttemptAt", "desc")
      .limit(1)
      .get();
    if (!dead.empty) {
      const err = (dead.docs[0].data() as ReminderRetryEntry).lastError;
      if (err) out[templateKey].lastErrorSnippet = err.slice(0, 220);
      return;
    }
    const pend = await db
      .collection(COLLECTION)
      .where("templateKey", "==", templateKey)
      .where("status", "==", "pending")
      .orderBy("lastAttemptAt", "desc")
      .limit(1)
      .get();
    if (!pend.empty) {
      const err = (pend.docs[0].data() as ReminderRetryEntry).lastError;
      if (err) out[templateKey].lastErrorSnippet = err.slice(0, 220);
    }
  });

  await Promise.all([...countTasks, ...snippetTasks]);
  return out;
}
