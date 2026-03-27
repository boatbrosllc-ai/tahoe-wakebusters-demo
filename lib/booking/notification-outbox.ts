/**
 * Durable notification outbox for booking confirmation sends.
 * Jobs are created transactionally with booking creation; a cron processes them
 * with retries and exponential backoff.
 *
 * **Receipt channel parity:** The booking confirmation email HTML is the canonical receipt (amounts, trip details,
 * policies). There is no separate “receipt only” email. SMS may include an optional bookmark link to
 * `/booking/success?receipt_token=…` when `RECEIPT_TOKEN_SECRET` is set; otherwise the SMS tells the guest to use email.
 */

import type { Firestore, DocumentReference } from "firebase-admin/firestore";
import { getFirestoreExports } from "./firebase-admin";
import { writeOperationalAlert } from "./operational-alerts";
import type { BookingStatus, NotificationOutboxEntry, NotificationOutboxStatus } from "./types";
import { randomUUID } from "crypto";
import { isPlaceholderCheckoutEmail } from "@/lib/booking/stripe-payment-intent-convert";
import { bookingWarn } from "@/lib/booking/debug";
import { isDepositMode } from "./deposit-mode";
import { markBookingNotificationPermanentlyFailed } from "@/lib/booking/booking-notification-failure-flag";
import { getReminderRetryQueueStatsByTemplate } from "./reminder-retry";
import { getStaleClaimCountsByTemplateKey } from "./notification-claim";
import { logNotificationSent } from "./email-log";
import { getStaffOperationsEmail } from "./brevo";

const COLLECTION = "notificationOutbox";
const MAX_ATTEMPTS = 5;

async function logDeadLetterOpsEmailAudit(params: {
  bookingId: string;
  outboxType: string;
  deliveryState: "sent" | "failed";
}): Promise<void> {
  const subject = `[Alert] Confirmation pipeline dead letter — ${params.outboxType} — ${params.bookingId}`;
  await logNotificationSent({
    channel: "email",
    to: getStaffOperationsEmail(),
    templateId: "dead_letter_ops_alert",
    subject,
    bookingId: params.bookingId,
    audience: "staff",
    deliveryState: params.deliveryState,
  }).catch(() => {});
}

/** Booking states where a customer confirmation must never be sent (terminal / non-reservation). */
function isTerminalNonConfirmableBookingStatus(status: BookingStatus): boolean {
  return status === "canceled" || status === "refunded";
}

/**
 * Per-dispatch idempotency keys for Brevo/staff. Omit `confirmationDispatchId` for the original booking send;
 * set a fresh UUID on each reschedule so provider dedupe does not swallow updated trip emails.
 */
export function buildBookingConfirmationIdempotencyKeys(
  bookingId: string,
  confirmationDispatchId?: string
): { customer: string; business: string; staff: string } {
  const tag = typeof confirmationDispatchId === "string" ? confirmationDispatchId.trim() : "";
  const suffix = tag ? `_${tag}` : "";
  return {
    customer: `${bookingId}_booking_confirmation${suffix}`,
    business: `${bookingId}_booking_confirmation_business_copy${suffix}`,
    staff: `${bookingId}_staff_booking_confirmation${suffix}`,
  };
}

const OUTBOX_SUPPRESS_CANCELED_CONFIRMATION = "booking_canceled_confirmation_suppressed";
const OUTBOX_SUPPRESS_CANCELED_FINAL_CHARGE_SUCCESS = "booking_canceled_final_charge_success_suppressed";

/**
 * After admin cancel, stop any in-flight confirmation / final-charge-success jobs so retries do not email the guest.
 */
export async function suppressPendingOutboxForBookingOnCancel(db: Firestore, bookingId: string): Promise<void> {
  const { Timestamp, FieldValue } = getFirestoreExports();
  const now = Timestamp.now();
  const neutralize = async (docIdStr: string, lastError: string) => {
    const ref = db.collection(COLLECTION).doc(docIdStr);
    const snap = await ref.get();
    if (!snap.exists) return;
    const st = (snap.data() as NotificationOutboxEntry).status;
    if (st === "sent" || st === "dead_letter") return;
    await ref.update({
      status: "dead_letter",
      lastError,
      lastAttemptAt: now,
      claimExpiresAt: FieldValue.delete(),
      claimedAt: FieldValue.delete(),
      claimedBy: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  };
  await neutralize(confirmationOutboxDocId(bookingId), OUTBOX_SUPPRESS_CANCELED_CONFIRMATION);
  await neutralize(finalChargeSuccessOutboxDocId(bookingId), OUTBOX_SUPPRESS_CANCELED_FINAL_CHARGE_SUCCESS);
}
const INITIAL_BACKOFF_MS = 60 * 1000; // 1 min
const MAX_BACKOFF_MS = 24 * 60 * 60 * 1000; // 24 h

/**
 * Lease on a claimed outbox row; if the worker dies, stale claims reset to pending after this window.
 * Kept conservatively because Netlify cold starts / slow Brevo/SMS calls can exceed ~2 minutes.
 */
const CLAIM_LEASE_MS = 8 * 60 * 1000;

function nextAttemptAt(attemptCount: number): Date {
  const delay = Math.min(INITIAL_BACKOFF_MS * Math.pow(2, attemptCount), MAX_BACKOFF_MS);
  return new Date(Date.now() + delay);
}

function claimExpiresAtTimestamp() {
  const { Timestamp } = getFirestoreExports();
  return Timestamp.fromMillis(Date.now() + CLAIM_LEASE_MS);
}

async function updateOutboxIfStillClaimed(
  db: Firestore,
  ref: DocumentReference,
  claimerId: string,
  patch: Record<string, unknown>
): Promise<boolean> {
  let ok = false;
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (!fresh.exists) return;
    const d = fresh.data() as NotificationOutboxEntry;
    if (d.status !== "claimed") return;
    const claimedByOk = d.claimedBy == null || d.claimedBy === claimerId;
    if (!claimedByOk) return;
    tx.update(ref, patch);
    ok = true;
  });
  return ok;
}

export type ConfirmationOutboxPayloadOpts = {
  rescheduled?: boolean;
  waiverPointerCleared?: boolean;
  /** Fresh UUID per reschedule dispatch; drives Brevo idempotency keys for that send. */
  confirmationDispatchId?: string;
  oldTotalCents?: number;
  newFinalCents?: number;
};

export function createPendingConfirmationPayload(
  bookingId: string,
  opts?: ConfirmationOutboxPayloadOpts
): Omit<NotificationOutboxEntry, "sentAt" | "lastAttemptAt" | "lastError" | "claimedAt" | "claimedBy"> {
  const { Timestamp } = getFirestoreExports();
  const now = Timestamp.now();
  const dispatchId =
    typeof opts?.confirmationDispatchId === "string" && opts.confirmationDispatchId.trim()
      ? opts.confirmationDispatchId.trim()
      : undefined;
  return {
    bookingId,
    type: "booking_confirmation",
    payload: {
      bookingId,
      ...(opts?.rescheduled ? { rescheduled: true } : {}),
      ...(opts?.waiverPointerCleared ? { waiverPointerCleared: true } : {}),
      ...(dispatchId ? { confirmationDispatchId: dispatchId } : {}),
      ...(opts?.oldTotalCents != null ? { oldTotalCents: opts.oldTotalCents } : {}),
      ...(opts?.newFinalCents != null ? { newFinalCents: opts.newFinalCents } : {}),
    },
    status: "pending",
    attemptCount: 0,
    maxAttempts: MAX_ATTEMPTS,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

/** Deterministic doc id for booking confirmation jobs (idempotent enqueue). */
export function confirmationOutboxDocId(bookingId: string): string {
  return `${bookingId}_booking_confirmation`;
}

export async function addConfirmationOutboxInTransaction(
  tx: FirebaseFirestore.Transaction,
  db: Firestore,
  bookingId: string,
  opts?: ConfirmationOutboxPayloadOpts
): Promise<void> {
  const ref = db.collection(COLLECTION).doc(confirmationOutboxDocId(bookingId));
  const snap = await tx.get(ref);
  if (snap.exists) {
    const st = (snap.data() as Partial<NotificationOutboxEntry>).status;
    // Dead-letter is terminal.
    if (st === "dead_letter") return;
    // Normal idempotency: if already sent, do not resend unless explicitly marked as rescheduled.
    if (st === "sent" && !opts?.rescheduled) return;
    // Reschedule supersedes an in-flight claim: reset to pending so cron sends the latest trip (Comment 11).
    if (st === "claimed" && opts?.rescheduled) {
      tx.set(ref, createPendingConfirmationPayload(bookingId, opts));
      return;
    }
    // If already claimed by another worker, only update payload; claim holder will read latest doc.
    if (st === "claimed") {
      const prev = (snap.data()?.payload ?? { bookingId }) as Record<string, unknown>;
      const merged: Record<string, unknown> = { ...prev };
      if (opts?.rescheduled) merged.rescheduled = true;
      if (opts?.waiverPointerCleared) merged.waiverPointerCleared = true;
      if (typeof opts?.confirmationDispatchId === "string" && opts.confirmationDispatchId.trim()) {
        merged.confirmationDispatchId = opts.confirmationDispatchId.trim();
      }
      if (opts?.oldTotalCents != null) merged.oldTotalCents = opts.oldTotalCents;
      if (opts?.newFinalCents != null) merged.newFinalCents = opts.newFinalCents;
      tx.update(ref, {
        payload: merged,
        updatedAt: getFirestoreExports().FieldValue.serverTimestamp(),
      });
      return;
    }
    // For pending/failed, or explicit reschedules, reset to pending so cron workers can resend.
    tx.set(ref, createPendingConfirmationPayload(bookingId, opts));
    return;
  }
  tx.set(ref, createPendingConfirmationPayload(bookingId, opts));
}

export function createPendingFinalChargeSuccessPayload(
  bookingId: string
): Omit<
  NotificationOutboxEntry,
  "sentAt" | "lastAttemptAt" | "lastError" | "claimedAt" | "claimedBy"
> {
  const { Timestamp } = getFirestoreExports();
  const now = Timestamp.now();
  return {
    bookingId,
    type: "final_charge_success",
    payload: { bookingId },
    status: "pending",
    attemptCount: 0,
    maxAttempts: MAX_ATTEMPTS,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

export function createPendingDiscountLimitExceededPayload(
  bookingId: string
): Omit<
  NotificationOutboxEntry,
  "sentAt" | "lastAttemptAt" | "lastError" | "claimedAt" | "claimedBy"
> {
  const { Timestamp } = getFirestoreExports();
  const now = Timestamp.now();
  return {
    bookingId,
    type: "discount_limit_exceeded_notification",
    payload: { bookingId },
    status: "pending",
    attemptCount: 0,
    maxAttempts: MAX_ATTEMPTS,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

/** Deterministic doc id for discount-limit notification jobs (idempotent enqueue). */
export function discountLimitExceededOutboxDocId(bookingId: string): string {
  return `${bookingId}_discount_limit_exceeded_notification`;
}

/**
 * Enqueue customer + ops discount-limit emails via the durable outbox (retries, dead-letter alerting).
 * No-op if a row already exists for this booking.
 */
export async function addDiscountLimitExceededOutboxIfAbsent(db: Firestore, bookingId: string): Promise<void> {
  const ref = db.collection(COLLECTION).doc(discountLimitExceededOutboxDocId(bookingId));
  const snap = await ref.get();
  if (snap.exists) {
    const st = (snap.data() as Partial<NotificationOutboxEntry>).status;
    if (st === "sent" || st === "dead_letter") return;
    return;
  }
  await ref.set(createPendingDiscountLimitExceededPayload(bookingId));
}

/** Deterministic doc id so final_paid + outbox enqueue stay atomic without duplicate jobs. */
export function finalChargeSuccessOutboxDocId(bookingId: string): string {
  return `${bookingId}_final_charge_success`;
}

/**
 * Enqueue final-balance receipt email (same durable pipeline as booking confirmations).
 * Skips if a row already exists (pending/claimed/failed) or was already sent.
 */
export async function addFinalChargeSuccessOutboxInTransaction(
  tx: FirebaseFirestore.Transaction,
  db: Firestore,
  bookingId: string
): Promise<void> {
  const ref = db.collection(COLLECTION).doc(finalChargeSuccessOutboxDocId(bookingId));
  const snap = await tx.get(ref);
  if (snap.exists) {
    const st = (snap.data() as Partial<NotificationOutboxEntry>).status;
    if (st === "sent" || st === "dead_letter") return;
    return;
  }
  tx.set(ref, createPendingFinalChargeSuccessPayload(bookingId));
}

export function createPendingWaiverInvitePayload(
  bookingId: string
): Omit<
  NotificationOutboxEntry,
  "sentAt" | "lastAttemptAt" | "lastError" | "claimedAt" | "claimedBy"
> {
  const { Timestamp } = getFirestoreExports();
  const now = Timestamp.now();
  return {
    bookingId,
    type: "waiver_invite_send",
    payload: { bookingId },
    status: "pending",
    attemptCount: 0,
    maxAttempts: MAX_ATTEMPTS,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

export function waiverInviteOutboxDocId(bookingId: string): string {
  return `${bookingId}_waiver_invite_send`;
}

/**
 * Enqueue separate waiver invite email (idempotent per booking; same pattern as final charge success outbox).
 */
export async function addWaiverInviteOutboxInTransaction(
  tx: FirebaseFirestore.Transaction,
  db: Firestore,
  bookingId: string
): Promise<void> {
  const ref = db.collection(COLLECTION).doc(waiverInviteOutboxDocId(bookingId));
  const snap = await tx.get(ref);
  if (snap.exists) {
    const st = (snap.data() as Partial<NotificationOutboxEntry>).status;
    if (st === "sent" || st === "dead_letter") return;
    return;
  }
  tx.set(ref, createPendingWaiverInvitePayload(bookingId));
}

/**
 * Resets claimed rows whose lease expired (e.g. Netlify function killed mid-send) back to pending.
 */
export async function processStaleClaims(
  db: Firestore,
  opts?: { currentClaimerId?: string }
): Promise<number> {
  const { Timestamp, FieldValue } = getFirestoreExports();
  const now = Timestamp.now();
  let total = 0;
  for (const outboxType of [
    "booking_confirmation",
    "final_charge_success",
    "discount_limit_exceeded_notification",
    "waiver_invite_send",
    "amount_integrity_mismatch_customer",
    "payment_under_manual_review_customer",
  ] as const) {
    const snap = await db
      .collection(COLLECTION)
      .where("status", "==", "claimed")
      .where("type", "==", outboxType)
      .where("claimExpiresAt", "<", now)
      .get();

    if (snap.empty) continue;

    let batch = db.batch();
    let ops = 0;
    for (const doc of snap.docs) {
      const d = doc.data() as NotificationOutboxEntry;
      if (opts?.currentClaimerId && d.claimedBy === opts.currentClaimerId) {
        continue;
      }
      // Merge: do not clear providerMessageId — Brevo may have succeeded before the status write.
      batch.update(doc.ref, {
        status: "pending",
        claimExpiresAt: FieldValue.delete(),
        claimedAt: FieldValue.delete(),
        claimedBy: FieldValue.delete(),
        nextAttemptAt: now,
        updatedAt: FieldValue.serverTimestamp(),
      });
      ops++;
      total++;
      if (ops >= 450) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();
  }
  return total;
}

export type NotificationOutboxTypeStats = {
  pending: number;
  deadLetter: number;
  stuckClaims: number;
};

export type NotificationOutboxStats = {
  /** @deprecated Use byType.booking_confirmation for new UI */
  pending: number;
  deadLetter: number;
  stuckClaims: number;
  byType: {
    booking_confirmation: NotificationOutboxTypeStats;
    final_charge_success: NotificationOutboxTypeStats;
    discount_limit_exceeded_notification: NotificationOutboxTypeStats;
    waiver_invite_send: NotificationOutboxTypeStats;
    amount_integrity_mismatch_customer: NotificationOutboxTypeStats;
    payment_under_manual_review_customer: NotificationOutboxTypeStats;
  };
  reminderRetryQueue: Awaited<ReturnType<typeof getReminderRetryQueueStatsByTemplate>>;
  /** Sum of {@link ReminderRetryPerTemplateStats.deadLetter} across reminder templates. */
  reminderRetryDeadLetterTotal: number;
  staleClaimCountsByTemplate: Record<string, number>;
};

function isMissingFirestoreIndexError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /FAILED_PRECONDITION/i.test(msg) && /requires an index|indexes\?create_composite/i.test(msg);
}

async function safeCount(
  p: Promise<import("firebase-admin/firestore").AggregateQuerySnapshot<{ count: import("firebase-admin/firestore").AggregateField<number> }>>,
  context: string
): Promise<number> {
  try {
    const snap = await p;
    return snap.data().count;
  } catch (err) {
    if (isMissingFirestoreIndexError(err)) {
      console.warn("[notification-outbox] missing Firestore index for aggregate count; returning 0", {
        context,
        error: err instanceof Error ? err.message : String(err),
      });
      return 0;
    }
    throw err;
  }
}

/** Aggregate counts for admin visibility (all outbox types + retry queue + stale claims). */
export async function getNotificationOutboxStats(db: Firestore): Promise<NotificationOutboxStats> {
  const { Timestamp } = getFirestoreExports();
  const now = Timestamp.now();
  const countForType = async (
    outboxType:
      | "booking_confirmation"
      | "final_charge_success"
      | "discount_limit_exceeded_notification"
      | "waiver_invite_send"
      | "amount_integrity_mismatch_customer"
      | "payment_under_manual_review_customer"
  ): Promise<NotificationOutboxTypeStats> => {
    const base = () => db.collection(COLLECTION).where("type", "==", outboxType);
    const [pendingCount, deadCount, stuckCount] = await Promise.all([
      safeCount(base().where("status", "==", "pending").count().get(), `${outboxType}:pending`),
      safeCount(base().where("status", "==", "dead_letter").count().get(), `${outboxType}:dead_letter`),
      safeCount(
        db
          .collection(COLLECTION)
          .where("status", "==", "claimed")
          .where("type", "==", outboxType)
          .where("claimExpiresAt", "<", now)
          .count()
          .get(),
        `${outboxType}:claimed_expired`
      ),
    ]);
    return {
      pending: pendingCount,
      deadLetter: deadCount,
      stuckClaims: stuckCount,
    };
  };
  const [bc, fc, disc, wv, aim, mur, reminderRetryQueueSettled, staleClaimCountsSettled] = await Promise.all([
    countForType("booking_confirmation"),
    countForType("final_charge_success"),
    countForType("discount_limit_exceeded_notification"),
    countForType("waiver_invite_send"),
    countForType("amount_integrity_mismatch_customer"),
    countForType("payment_under_manual_review_customer"),
    getReminderRetryQueueStatsByTemplate(db).then(
      (value) => ({ ok: true as const, value }),
      (err) => ({ ok: false as const, err })
    ),
    getStaleClaimCountsByTemplateKey(db).then(
      (value) => ({ ok: true as const, value }),
      (err) => ({ ok: false as const, err })
    ),
  ]);
  let reminderRetryQueue: Awaited<ReturnType<typeof getReminderRetryQueueStatsByTemplate>>;
  if (reminderRetryQueueSettled.ok) {
    reminderRetryQueue = reminderRetryQueueSettled.value;
  } else if (isMissingFirestoreIndexError(reminderRetryQueueSettled.err)) {
    console.warn("[notification-outbox] missing Firestore index for reminder retry stats; returning empty stats", {
      error:
        reminderRetryQueueSettled.err instanceof Error
          ? reminderRetryQueueSettled.err.message
          : String(reminderRetryQueueSettled.err),
    });
    reminderRetryQueue = {} as Awaited<ReturnType<typeof getReminderRetryQueueStatsByTemplate>>;
  } else {
    throw reminderRetryQueueSettled.err;
  }
  let staleClaimCountsByTemplate: Record<string, number>;
  if (staleClaimCountsSettled.ok) {
    staleClaimCountsByTemplate = staleClaimCountsSettled.value;
  } else if (isMissingFirestoreIndexError(staleClaimCountsSettled.err)) {
    console.warn("[notification-outbox] missing Firestore index for stale claim stats; returning empty stats", {
      error:
        staleClaimCountsSettled.err instanceof Error
          ? staleClaimCountsSettled.err.message
          : String(staleClaimCountsSettled.err),
    });
    staleClaimCountsByTemplate = {};
  } else {
    throw staleClaimCountsSettled.err;
  }
  const reminderRetryDeadLetterTotal = Object.values(reminderRetryQueue).reduce(
    (s, v) => s + (v?.deadLetter ?? 0),
    0
  );
  return {
    pending: bc.pending,
    deadLetter: bc.deadLetter,
    stuckClaims: bc.stuckClaims,
    byType: {
      booking_confirmation: bc,
      final_charge_success: fc,
      discount_limit_exceeded_notification: disc,
      waiver_invite_send: wv,
      amount_integrity_mismatch_customer: aim,
      payment_under_manual_review_customer: mur,
    },
    reminderRetryQueue,
    reminderRetryDeadLetterTotal,
    staleClaimCountsByTemplate,
  };
}

export async function alertOnStalledOutbox(db: Firestore, thresholdMinutes: number): Promise<void> {
  const { Timestamp } = getFirestoreExports();
  const now = Timestamp.now();
  const cutoff = Timestamp.fromDate(new Date(Date.now() - thresholdMinutes * 60 * 1000));

  const col = db.collection(COLLECTION);
  const [pendingStalledCount, deadLetterStalledCount] = await Promise.all([
    safeCount(
      col.where("status", "==", "pending").where("nextAttemptAt", "<=", cutoff).count().get(),
      "stalled:pending_nextAttemptAt"
    ),
    safeCount(
      col.where("status", "==", "dead_letter").where("createdAt", "<", cutoff).count().get(),
      "stalled:dead_letter_createdAt"
    ),
  ]);

  if (pendingStalledCount === 0 && deadLetterStalledCount === 0) return;

  let deadLetterByType: Record<string, number> | undefined;
  try {
    const stats = await getNotificationOutboxStats(db);
    deadLetterByType = {
      booking_confirmation: stats.byType.booking_confirmation.deadLetter,
      final_charge_success: stats.byType.final_charge_success.deadLetter,
      discount_limit_exceeded_notification: stats.byType.discount_limit_exceeded_notification.deadLetter,
      waiver_invite_send: stats.byType.waiver_invite_send.deadLetter,
      amount_integrity_mismatch_customer: stats.byType.amount_integrity_mismatch_customer.deadLetter,
      payment_under_manual_review_customer: stats.byType.payment_under_manual_review_customer.deadLetter,
    };
  } catch {
    deadLetterByType = undefined;
  }

  await writeOperationalAlert({
    type: "confirmation_outbox_stalled",
    pendingStalledCount,
    deadLetterStalledCount,
    thresholdMinutes,
    source: "process-confirmation-outbox",
    now: now.toDate ? now.toDate().toISOString() : String(now),
    ...(deadLetterByType && { deadLetterByType }),
  });
}

async function deliverClaimedConfirmationEntry(
  db: Firestore,
  ref: DocumentReference,
  bookingId: string,
  data: NotificationOutboxEntry,
  claimerId: string
): Promise<"sent" | "failed" | "dead_letter"> {
  const { Timestamp, FieldValue } = getFirestoreExports();
  const now = Timestamp.now();
  try {
    const { sendBookingConfirmationEmail, sendBookingConfirmationCopyToBusiness } = await import("./brevo");
    const { sendBookingConfirmationSms } = await import("./sms");
    const { logEmailSent } = await import("./email-log");
    const { getSlotStartEnd, parseSlotId } = await import("./experience-slots");
    const { formatSlotDateTime } = await import("./format-booking-datetime");
    const { DEFAULT_CANCELLATION_POLICY } = await import("./cancellation-policy");
    const { signReceiptToken } = await import("./receiptToken");
    const { bookingEnv } = await import("./env");
    type Booking = import("./types").Booking;
    type Experience = import("./types").Experience;

    let bookingSnap = await db.collection("bookings").doc(bookingId).get();
    if (!bookingSnap.exists) {
      await updateOutboxIfStillClaimed(db, ref, claimerId, {
        status: "failed",
        lastError: "Booking not found",
        lastAttemptAt: now,
        attemptCount: data.attemptCount + 1,
        nextAttemptAt: Timestamp.fromDate(nextAttemptAt(data.attemptCount + 1)),
        claimExpiresAt: FieldValue.delete(),
        claimedAt: FieldValue.delete(),
        claimedBy: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return "failed";
    }

    let booking = bookingSnap.data() as Booking;
    if (isTerminalNonConfirmableBookingStatus(booking.status)) {
      await updateOutboxIfStillClaimed(db, ref, claimerId, {
        status: "dead_letter",
        lastError: "booking_not_confirmable",
        lastAttemptAt: now,
        attemptCount: data.attemptCount + 1,
        nextAttemptAt: now,
        claimExpiresAt: FieldValue.delete(),
        claimedAt: FieldValue.delete(),
        claimedBy: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      void markBookingNotificationPermanentlyFailed(db, bookingId, "confirmation_outbox:booking_not_confirmable");
      return "dead_letter";
    }
    const customerEmailEarly = booking.customer?.email?.trim() ?? "";
    if (!customerEmailEarly) {
      await updateOutboxIfStillClaimed(db, ref, claimerId, {
        status: "failed",
        lastError: "Customer email not ready",
        lastAttemptAt: now,
        attemptCount: data.attemptCount + 1,
        nextAttemptAt: Timestamp.fromMillis(Date.now() + 30_000),
        claimExpiresAt: FieldValue.delete(),
        claimedAt: FieldValue.delete(),
        claimedBy: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return "failed";
    }
    if (isPlaceholderCheckoutEmail(customerEmailEarly)) {
      // Placeholder emails are a permanent delivery failure mode for this outbox row:
      // dead-letter immediately to avoid retry exhaustion + notification spam.
      await updateOutboxIfStillClaimed(db, ref, claimerId, {
        status: "dead_letter",
        lastError: "placeholder_email",
        lastAttemptAt: now,
        attemptCount: data.attemptCount + 1,
        nextAttemptAt: now,
        claimExpiresAt: FieldValue.delete(),
        claimedAt: FieldValue.delete(),
        claimedBy: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      void markBookingNotificationPermanentlyFailed(db, bookingId, "confirmation_outbox:placeholder_email");
      return "dead_letter";
    }
    const rescheduled = data.payload?.rescheduled === true;
    const waiverPointerCleared = data.payload?.waiverPointerCleared === true;

    if (!booking.waiver?.requestId && booking.customer?.email?.trim()) {
      // Reschedule flow explicitly clears booking.waiver inside the slot/booking transaction,
      // then recreates the waiver request after. Avoid auto-creating a duplicate waiver here;
      // let the outbox retry after the reschedule handler finishes.
      if (rescheduled && waiverPointerCleared) {
        throw new Error("RESCHEDULE_WAIVER_NOT_READY");
      }
      const { createWaiverForBooking } = await import("@/lib/waiver/on-booking-created");
      await createWaiverForBooking({
        bookingId,
        customerEmail: booking.customer.email.trim(),
        customerName: booking.customer.name,
      });
      bookingSnap = await db.collection("bookings").doc(bookingId).get();
      if (bookingSnap.exists) booking = bookingSnap.data() as Booking;
    }
    if (isTerminalNonConfirmableBookingStatus(booking.status)) {
      await updateOutboxIfStillClaimed(db, ref, claimerId, {
        status: "dead_letter",
        lastError: "booking_not_confirmable",
        lastAttemptAt: now,
        attemptCount: data.attemptCount + 1,
        nextAttemptAt: now,
        claimExpiresAt: FieldValue.delete(),
        claimedAt: FieldValue.delete(),
        claimedBy: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      void markBookingNotificationPermanentlyFailed(db, bookingId, "confirmation_outbox:booking_not_confirmable_post_waiver");
      return "dead_letter";
    }
    const parsed = parseSlotId(booking.slotId ?? "");
    if (!parsed) {
      await updateOutboxIfStillClaimed(db, ref, claimerId, {
        status: "failed",
        lastError: "Invalid slotId",
        lastAttemptAt: now,
        attemptCount: data.attemptCount + 1,
        nextAttemptAt: Timestamp.fromDate(nextAttemptAt(data.attemptCount + 1)),
        claimExpiresAt: FieldValue.delete(),
        claimedAt: FieldValue.delete(),
        claimedBy: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return "failed";
    }

    const { start, end } = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours ?? 2, parsed.startMinute ?? 0);
    let boatNameForEmail = "Your trip";
    let locationText = "We'll send exact meeting point after booking.";
    let cancellationPolicyText = DEFAULT_CANCELLATION_POLICY;
    let experienceName = "Your trip";

    let pricingType: "charter" | "ticketed" | undefined;
    if (booking.experienceId) {
      const expSnap = await db.collection("experiences").doc(booking.experienceId).get();
      if (expSnap.exists) {
        const exp = expSnap.data() as Experience;
        experienceName = exp.title ?? experienceName;
        locationText = exp.location?.addressText ?? locationText;
        cancellationPolicyText = exp.cancellationPolicy?.fullText ?? DEFAULT_CANCELLATION_POLICY;
        pricingType = exp.pricingType;
      }
      if (booking.boatId) {
        const boatSnap = await db.collection("boats").doc(booking.boatId).get();
        if (boatSnap.exists) {
          boatNameForEmail = (boatSnap.data() as { name?: string }).name ?? experienceName;
        } else {
          boatNameForEmail = experienceName;
        }
      } else {
        boatNameForEmail = experienceName;
      }
    }

    const baseUrl = (bookingEnv.appBaseUrl ?? "").replace(/\/$/, "");
    const signedReceipt = signReceiptToken(bookingId);
    if (!signedReceipt) {
      console.warn(
        "[notification-outbox] RECEIPT_TOKEN_SECRET not set — receipt link omitted from confirmation SMS"
      );
    }
    /** Optional SMS shortcut; email body remains the canonical receipt. */
    const receiptLink = signedReceipt
      ? `${baseUrl}/booking/success?receipt_token=${encodeURIComponent(signedReceipt)}`
      : undefined;

    let waiverSigningUrl: string | undefined;
    let waiverGroupSigningUrl: string | undefined;
    if (booking.waiver?.requestId) {
      const { getRequestById: getReq, buildWaiverSigningUrlFromTokenId, getActiveGroupSigningUrlForBooking } =
        await import("@/lib/waiver/firestore");
      const req = await getReq(booking.waiver.requestId);
      if (req?.status === "pending") {
        if (req.signingTokenId) {
          waiverSigningUrl = buildWaiverSigningUrlFromTokenId(req.signingTokenId);
        } else if (req.signingUrl) {
          waiverSigningUrl = req.signingUrl;
        }
        const party = booking.partySize ?? 1;
        if (party > 1) {
          waiverGroupSigningUrl =
            req.groupSigningUrl ?? (await getActiveGroupSigningUrlForBooking(bookingId)) ?? undefined;
        }
      }
    }

    const addonsById = new Map<string, { name?: string }>();
    if (booking.experienceId) {
      const addonsSnap = await db.collection("experiences").doc(booking.experienceId).collection("addons").get();
      addonsSnap.docs.forEach((d) => addonsById.set(d.id, d.data() as { name?: string }));
    }
    const addonsSummary =
      (booking.addonSelections?.length ?? 0) > 0
        ? (booking.addonSelections ?? [])
            .map((sel) => `${addonsById.get(sel.addonId)?.name ?? sel.addonId}: qty ${sel.qty}`)
            .join(", ")
        : "None";

    const hasValidDepositAmount =
      typeof booking.stripe?.depositAmountCents === "number" && (booking.stripe?.depositAmountCents ?? 0) > 0;
    const isDeposit = isDepositMode(booking) && hasValidDepositAmount;

    const emailContext = {
      boatName: boatNameForEmail,
      startAt: formatSlotDateTime({ toDate: () => start }),
      endAt: formatSlotDateTime({ toDate: () => end }),
      durationHours: parsed.durationHours ?? 2,
      locationText,
      cancellationPolicyText,
      isDeposit,
      remainingAlreadyCharged: booking.status === "final_paid",
      finalChargeAt:
        booking.finalChargeAt != null
          ? (booking.finalChargeAt as { toDate(): Date }).toDate().toISOString()
          : undefined,
      manageLink: undefined as string | undefined,
      waiverSigningUrl,
      waiverGroupSigningUrl,
      pricingType,
      addonsSummary,
    };

    const idemSnap = await ref.get();
    const idemData = idemSnap.data() as NotificationOutboxEntry | undefined;
    if (idemData?.status === "sent") return "sent";

    const confirmationDispatchIdRaw = idemData?.payload?.confirmationDispatchId;
    const confirmationDispatchId =
      typeof confirmationDispatchIdRaw === "string" && confirmationDispatchIdRaw.trim()
        ? confirmationDispatchIdRaw.trim()
        : undefined;
    const confirmationIdemKeys = buildBookingConfirmationIdempotencyKeys(bookingId, confirmationDispatchId);

    const bookingWithId = { ...booking, id: bookingId } as typeof booking & { id: string };
    let subject: string;
    let providerMessageId: string | undefined = idemData?.providerMessageId;

    if (!idemData?.providerMessageId) {
      const sendResult = await sendBookingConfirmationEmail(bookingWithId, emailContext, {
        idempotencyKey: confirmationIdemKeys.customer,
      });
      subject = sendResult.subject;
      providerMessageId = sendResult.providerMessageId;
      if (!providerMessageId) {
        console.warn(
          "[notification-outbox] Brevo booking confirmation returned no messageId — marking failed for retry",
          { bookingId }
        );
        await updateOutboxIfStillClaimed(db, ref, claimerId, {
          status: "failed",
          lastError: "Brevo response missing provider messageId",
          lastAttemptAt: now,
          attemptCount: data.attemptCount + 1,
          nextAttemptAt: Timestamp.fromDate(nextAttemptAt(data.attemptCount + 1)),
          claimExpiresAt: FieldValue.delete(),
          claimedAt: FieldValue.delete(),
          claimedBy: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return "failed";
      }
    } else {
      subject = "Booking confirmation (delivery recovered)";
    }

    // Comment 7: finalize providerMessageId + sent status atomically, verifying our claim still holds.
    // This prevents two concurrent workers from both proceeding past the send step.
    let finalized = false;
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      if (!fresh.exists) return;
      const d = fresh.data() as NotificationOutboxEntry;
      if (d.status !== "claimed") return;
      const claimedByOk = d.claimedBy == null || d.claimedBy === claimerId;
      if (!claimedByOk) return;

      const patch: Record<string, unknown> = {
        status: "sent",
        sentAt: now,
        claimExpiresAt: FieldValue.delete(),
        claimedAt: FieldValue.delete(),
        claimedBy: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (providerMessageId) patch.providerMessageId = providerMessageId;
      tx.update(ref, patch);
      finalized = true;
    });

    if (!finalized) return "sent";

    try {
      await db.collection("bookings").doc(bookingId).update({
        confirmationSentAt: now,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.error("[notification-outbox] confirmationSentAt update failed", bookingId, e);
    }

    const { notifyStaffBookingConfirmation } = await import("./staff-notifications");
    try {
      await sendBookingConfirmationCopyToBusiness(bookingWithId, emailContext, {
        idempotencyKey: confirmationIdemKeys.business,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await writeOperationalAlert({
        type: "staff_notification_failed",
        bookingId,
        channel: "business_confirmation_copy",
        lastError: msg,
        source: "notification-outbox",
      }).catch((w) => console.error("[notification-outbox] writeOperationalAlert business copy", w));
    }
    void logEmailSent({
      to: booking.customer.email,
      toName: booking.customer.name,
      templateId: "booking_confirmation",
      subject,
      bookingId,
    }).catch((e) => console.error("[notification-outbox] logEmailSent", e));
    try {
      await notifyStaffBookingConfirmation({
        bookingId,
        booking: bookingWithId,
        boatName: boatNameForEmail,
        startAt: emailContext.startAt,
        endAt: emailContext.endAt,
        staffConfirmationIdempotencyKey: confirmationIdemKeys.staff,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await writeOperationalAlert({
        type: "staff_notification_failed",
        bookingId,
        channel: "staff_booking_confirmation",
        lastError: msg,
        source: "notification-outbox",
      }).catch((w) => console.error("[notification-outbox] writeOperationalAlert staff booking", w));
    }

    const wStatus = booking.waiver?.status;
    if (booking.waiver?.requestId && wStatus && wStatus !== "signed") {
      void writeOperationalAlert({
        type: "confirmation_sent_waiver_not_signed",
        bookingId,
        waiverStatus: wStatus,
        source: "notification-outbox",
      }).catch((e) => console.error("[notification-outbox] writeOperationalAlert waiver", e));
    }

    if (booking.customer?.phone?.trim()) {
      const tripDateStr = start.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "America/Chicago",
      });
      void sendBookingConfirmationSms({
        phone: booking.customer.phone,
        customerName: booking.customer.name,
        experienceName: boatNameForEmail,
        tripDate: tripDateStr,
        bookingId,
        receiptLink,
      })
        .then((smsSent) => {
          if (smsSent) {
            return db.collection("bookings").doc(bookingId).update({
              confirmationSmsSentAt: Timestamp.now(),
            });
          }
        })
        .catch((e) => console.error("[notification-outbox] confirmation SMS", e));
    }

    return "sent";
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const attemptCount = data.attemptCount + 1;
    const isDeadLetter = attemptCount >= data.maxAttempts;
    const status: NotificationOutboxStatus = isDeadLetter ? "dead_letter" : "pending";
    const updated = await updateOutboxIfStillClaimed(db, ref, claimerId, {
      status,
      lastError: errMsg,
      lastAttemptAt: now,
      attemptCount,
      nextAttemptAt: isDeadLetter ? now : Timestamp.fromDate(nextAttemptAt(attemptCount)),
      claimExpiresAt: FieldValue.delete(),
      claimedAt: FieldValue.delete(),
      claimedBy: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (isDeadLetter) {
      if (updated) {
        await writeOperationalAlert({
          type: "confirmation_dead_letter",
          bookingId,
          lastError: errMsg,
          source: "notification-outbox",
        });
        const { sendNotificationOutboxDeadLetterOpsEmail } = await import("./brevo");
        try {
          await sendNotificationOutboxDeadLetterOpsEmail({
            outboxType: "booking_confirmation",
            bookingId,
            lastError: errMsg,
          });
          await logDeadLetterOpsEmailAudit({
            bookingId,
            outboxType: "booking_confirmation",
            deliveryState: "sent",
          });
        } catch (e) {
          console.error("[notification-outbox] dead letter ops email", e);
          await logDeadLetterOpsEmailAudit({
            bookingId,
            outboxType: "booking_confirmation",
            deliveryState: "failed",
          });
        }
        void markBookingNotificationPermanentlyFailed(
          db,
          bookingId,
          `confirmation_outbox:${errMsg.slice(0, 400)}`
        );
      }
    }
    return isDeadLetter ? "dead_letter" : "failed";
  }
}

async function deliverClaimedFinalChargeSuccessEntry(
  db: Firestore,
  ref: DocumentReference,
  bookingId: string,
  data: NotificationOutboxEntry,
  claimerId: string
): Promise<"sent" | "failed" | "dead_letter"> {
  const { Timestamp, FieldValue } = getFirestoreExports();
  const now = Timestamp.now();
  type Booking = import("./types").Booking;
  try {
    const { notifyFinalChargeSuccess } = await import("./notify-final-charge-success");
    const bookingSnap = await db.collection("bookings").doc(bookingId).get();
    if (!bookingSnap.exists) {
      await updateOutboxIfStillClaimed(db, ref, claimerId, {
        status: "failed",
        lastError: "Booking not found",
        lastAttemptAt: now,
        attemptCount: data.attemptCount + 1,
        nextAttemptAt: Timestamp.fromDate(nextAttemptAt(data.attemptCount + 1)),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return "failed";
    }
    const booking = bookingSnap.data() as Booking;
    if (booking.status !== "final_paid") {
      await updateOutboxIfStillClaimed(db, ref, claimerId, {
        status: "dead_letter",
        lastError: "final_charge_success_ineligible_status",
        lastAttemptAt: now,
        attemptCount: data.attemptCount + 1,
        nextAttemptAt: now,
        claimExpiresAt: FieldValue.delete(),
        claimedAt: FieldValue.delete(),
        claimedBy: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return "dead_letter";
    }
    const result = await notifyFinalChargeSuccess(db, bookingId, booking, { skipReminderRetryQueue: true });
    if (result.ok) {
      const ok = await updateOutboxIfStillClaimed(db, ref, claimerId, {
        status: "sent",
        sentAt: now,
        ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {}),
        claimExpiresAt: FieldValue.delete(),
        claimedAt: FieldValue.delete(),
        claimedBy: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return ok ? "sent" : "sent";
    }
    const attemptCount = data.attemptCount + 1;
    const isDeadLetter = attemptCount >= data.maxAttempts;
    const status: NotificationOutboxStatus = isDeadLetter ? "dead_letter" : "pending";
    const updated = await updateOutboxIfStillClaimed(db, ref, claimerId, {
      status,
      lastError: "notifyFinalChargeSuccess returned false",
      lastAttemptAt: now,
      attemptCount,
      nextAttemptAt: isDeadLetter ? now : Timestamp.fromDate(nextAttemptAt(attemptCount)),
      claimExpiresAt: FieldValue.delete(),
      claimedAt: FieldValue.delete(),
      claimedBy: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (isDeadLetter) {
      if (updated) {
        await writeOperationalAlert({
          type: "final_charge_success_outbox_dead_letter",
          bookingId,
          lastError: "notifyFinalChargeSuccess returned false",
          source: "notification-outbox",
        });
        const { sendNotificationOutboxDeadLetterOpsEmail } = await import("./brevo");
        try {
          await sendNotificationOutboxDeadLetterOpsEmail({
            outboxType: "final_charge_success",
            bookingId,
            lastError: "notifyFinalChargeSuccess returned false",
          });
          await logDeadLetterOpsEmailAudit({
            bookingId,
            outboxType: "final_charge_success",
            deliveryState: "sent",
          });
        } catch (e) {
          console.error("[notification-outbox] dead letter ops email", e);
          await logDeadLetterOpsEmailAudit({
            bookingId,
            outboxType: "final_charge_success",
            deliveryState: "failed",
          });
        }
      }
    }
    return isDeadLetter ? "dead_letter" : "failed";
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const attemptCount = data.attemptCount + 1;
    const isDeadLetter = attemptCount >= data.maxAttempts;
    const status: NotificationOutboxStatus = isDeadLetter ? "dead_letter" : "pending";
    const updated = await updateOutboxIfStillClaimed(db, ref, claimerId, {
      status,
      lastError: errMsg,
      lastAttemptAt: now,
      attemptCount,
      nextAttemptAt: isDeadLetter ? now : Timestamp.fromDate(nextAttemptAt(attemptCount)),
      claimExpiresAt: FieldValue.delete(),
      claimedAt: FieldValue.delete(),
      claimedBy: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (isDeadLetter) {
      if (updated) {
        await writeOperationalAlert({
          type: "final_charge_success_outbox_dead_letter",
          bookingId,
          lastError: errMsg,
          source: "notification-outbox",
        });
        const { sendNotificationOutboxDeadLetterOpsEmail } = await import("./brevo");
        try {
          await sendNotificationOutboxDeadLetterOpsEmail({
            outboxType: "final_charge_success",
            bookingId,
            lastError: errMsg,
          });
          await logDeadLetterOpsEmailAudit({
            bookingId,
            outboxType: "final_charge_success",
            deliveryState: "sent",
          });
        } catch (e) {
          console.error("[notification-outbox] dead letter ops email", e);
          await logDeadLetterOpsEmailAudit({
            bookingId,
            outboxType: "final_charge_success",
            deliveryState: "failed",
          });
        }
      }
    }
    return isDeadLetter ? "dead_letter" : "failed";
  }
}

async function deliverClaimedDiscountLimitExceededEntry(
  db: Firestore,
  ref: DocumentReference,
  bookingId: string,
  data: NotificationOutboxEntry,
  claimerId: string
): Promise<"sent" | "failed" | "dead_letter"> {
  const { Timestamp, FieldValue } = getFirestoreExports();
  const now = Timestamp.now();
  type Booking = import("./types").Booking;
  type Experience = import("./types").Experience;
  try {
    const { sendDiscountLimitExceededCustomerEmail, sendDiscountLimitExceededBusinessAlert } = await import("./brevo");
    const { parseSlotId, getSlotStartEnd } = await import("./experience-slots");
    const bookingSnap = await db.collection("bookings").doc(bookingId).get();
    if (!bookingSnap.exists) {
      await updateOutboxIfStillClaimed(db, ref, claimerId, {
        status: "failed",
        lastError: "Booking not found",
        lastAttemptAt: now,
        attemptCount: data.attemptCount + 1,
        nextAttemptAt: Timestamp.fromDate(nextAttemptAt(data.attemptCount + 1)),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return "failed";
    }
    const booking = bookingSnap.data() as Booking;
    const email = booking.customer?.email?.trim();
    if (!email) {
      await updateOutboxIfStillClaimed(db, ref, claimerId, {
        status: "failed",
        lastError: "No customer email",
        lastAttemptAt: now,
        attemptCount: data.attemptCount + 1,
        nextAttemptAt: Timestamp.fromDate(nextAttemptAt(data.attemptCount + 1)),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return "failed";
    }
    let experienceName = "Your trip";
    if (booking.experienceId) {
      const expSnap = await db.collection("experiences").doc(booking.experienceId).get();
      if (expSnap.exists) {
        experienceName = (expSnap.data() as Experience).title ?? experienceName;
      }
    }
    let tripDate: string | undefined;
    if (booking.slotId) {
      const parsed = parseSlotId(booking.slotId);
      if (parsed) {
        const tripStart = getSlotStartEnd(
          parsed.dateStr,
          parsed.startHour,
          parsed.durationHours ?? 2,
          parsed.startMinute ?? 0
        ).start;
        tripDate = tripStart.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "America/Chicago",
        });
      }
    }
    await sendDiscountLimitExceededCustomerEmail({
      to: email,
      customerName: booking.customer?.name?.trim() ?? "Guest",
      experienceName,
      tripDate,
      bookingId,
    });
    await sendDiscountLimitExceededBusinessAlert({
      bookingId,
      customerEmail: email,
      customerName: booking.customer?.name?.trim() ?? "Guest",
      experienceName,
      tripDate,
    });
    const ok = await updateOutboxIfStillClaimed(db, ref, claimerId, {
      status: "sent",
      sentAt: now,
      claimExpiresAt: FieldValue.delete(),
      claimedAt: FieldValue.delete(),
      claimedBy: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return ok ? "sent" : "sent";
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const attemptCount = data.attemptCount + 1;
    const isDeadLetter = attemptCount >= data.maxAttempts;
    const status: NotificationOutboxStatus = isDeadLetter ? "dead_letter" : "pending";
    const updated = await updateOutboxIfStillClaimed(db, ref, claimerId, {
      status,
      lastError: errMsg,
      lastAttemptAt: now,
      attemptCount,
      nextAttemptAt: isDeadLetter ? now : Timestamp.fromDate(nextAttemptAt(attemptCount)),
      claimExpiresAt: FieldValue.delete(),
      claimedAt: FieldValue.delete(),
      claimedBy: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (isDeadLetter) {
      if (updated) {
        await writeOperationalAlert({
          type: "discount_limit_exceeded_notification_dead_letter",
          bookingId,
          lastError: errMsg,
          source: "notification-outbox",
        });
        const { sendNotificationOutboxDeadLetterOpsEmail } = await import("./brevo");
        try {
          await sendNotificationOutboxDeadLetterOpsEmail({
            outboxType: "discount_limit_exceeded_notification",
            bookingId,
            lastError: errMsg,
          });
          await logDeadLetterOpsEmailAudit({
            bookingId,
            outboxType: "discount_limit_exceeded_notification",
            deliveryState: "sent",
          });
        } catch (e) {
          console.error("[notification-outbox] dead letter ops email", e);
          await logDeadLetterOpsEmailAudit({
            bookingId,
            outboxType: "discount_limit_exceeded_notification",
            deliveryState: "failed",
          });
        }
      }
    }
    return isDeadLetter ? "dead_letter" : "failed";
  }
}

async function deliverClaimedWaiverInviteEntry(
  db: Firestore,
  ref: DocumentReference,
  bookingId: string,
  data: NotificationOutboxEntry,
  claimerId: string
): Promise<"sent" | "failed" | "dead_letter"> {
  const { Timestamp, FieldValue } = getFirestoreExports();
  const now = Timestamp.now();
  type Booking = import("./types").Booking;
  try {
    const {
      getRequestById,
      buildWaiverSigningUrlFromTokenId,
      getActiveGroupSigningUrlForBooking,
    } = await import("@/lib/waiver/firestore");
    const { sendWaiverInviteAndMarkSent } = await import("@/lib/waiver/on-booking-created");
    const { parseSlotId, getSlotStartEnd } = await import("./experience-slots");
    const { formatBookingTime } = await import("./format-booking-datetime");
    const bookingSnap = await db.collection("bookings").doc(bookingId).get();
    if (!bookingSnap.exists) {
      await updateOutboxIfStillClaimed(db, ref, claimerId, {
        status: "failed",
        lastError: "Booking not found",
        lastAttemptAt: now,
        attemptCount: data.attemptCount + 1,
        nextAttemptAt: Timestamp.fromDate(nextAttemptAt(data.attemptCount + 1)),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return "failed";
    }
    const booking = bookingSnap.data() as Booking;
    const reqId = booking.waiver?.requestId;
    if (!reqId) {
      await updateOutboxIfStillClaimed(db, ref, claimerId, {
        status: "failed",
        lastError: "Booking has no waiver request",
        lastAttemptAt: now,
        attemptCount: data.attemptCount + 1,
        nextAttemptAt: Timestamp.fromDate(nextAttemptAt(data.attemptCount + 1)),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return "failed";
    }
    const req = await getRequestById(reqId);
    if (!req) {
      await updateOutboxIfStillClaimed(db, ref, claimerId, {
        status: "failed",
        lastError: "Waiver request not found",
        lastAttemptAt: now,
        attemptCount: data.attemptCount + 1,
        nextAttemptAt: Timestamp.fromDate(nextAttemptAt(data.attemptCount + 1)),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return "failed";
    }
    const sent = req.sent as { initialSentAt?: unknown } | undefined;
    if (sent?.initialSentAt != null) {
      await updateOutboxIfStillClaimed(db, ref, claimerId, {
        status: "sent",
        sentAt: now,
        claimExpiresAt: FieldValue.delete(),
        claimedAt: FieldValue.delete(),
        claimedBy: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return "sent";
    }
    let experienceName = "Your trip";
    let tripDate = "";
    let startTime: string | undefined;
    let endTime: string | undefined;
    if (booking.experienceId) {
      const expSnap = await db.collection("experiences").doc(booking.experienceId).get();
      if (expSnap.exists) {
        experienceName = (expSnap.data() as { title?: string })?.title ?? experienceName;
      }
    }
    tripDate = booking.startDateStr ?? "";
    const parsed = booking.slotId ? parseSlotId(booking.slotId) : null;
    if (parsed) {
      tripDate = parsed.dateStr;
      const { start, end } = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute ?? 0);
      startTime = formatBookingTime(start);
      endTime = formatBookingTime(end);
    }
    const email = booking.customer?.email?.trim() ?? "";
    if (!email) {
      await updateOutboxIfStillClaimed(db, ref, claimerId, {
        status: "failed",
        lastError: "No customer email",
        lastAttemptAt: now,
        attemptCount: data.attemptCount + 1,
        nextAttemptAt: Timestamp.fromDate(nextAttemptAt(data.attemptCount + 1)),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return "failed";
    }
    const signingUrlForEmail = req.signingTokenId
      ? buildWaiverSigningUrlFromTokenId(req.signingTokenId)
      : req.signingUrl;
    const partyN = booking.partySize ?? 1;
    const groupUrlForEmail =
      partyN > 1
        ? req.groupSigningUrl ?? (await getActiveGroupSigningUrlForBooking(bookingId)) ?? undefined
        : undefined;
    await sendWaiverInviteAndMarkSent({
      requestId: req.id,
      signingUrl: signingUrlForEmail,
      groupSigningUrl: groupUrlForEmail,
      includeInConfirmationEmail: false,
      sendSeparateWaiverInvite: true,
      bookingSummary: {
        experienceName,
        tripDate,
        startTime,
        endTime,
        partySize: booking.partySize,
      },
      to: email,
      name: (booking.customer?.name ?? "Guest").trim(),
    });
    await updateOutboxIfStillClaimed(db, ref, claimerId, {
      status: "sent",
      sentAt: now,
      claimExpiresAt: FieldValue.delete(),
      claimedAt: FieldValue.delete(),
      claimedBy: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return "sent";
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const attemptCount = data.attemptCount + 1;
    const isDeadLetter = attemptCount >= data.maxAttempts;
    const status: NotificationOutboxStatus = isDeadLetter ? "dead_letter" : "pending";
    const updated = await updateOutboxIfStillClaimed(db, ref, claimerId, {
      status,
      lastError: errMsg,
      lastAttemptAt: now,
      attemptCount,
      nextAttemptAt: isDeadLetter ? now : Timestamp.fromDate(nextAttemptAt(attemptCount)),
      claimExpiresAt: FieldValue.delete(),
      claimedAt: FieldValue.delete(),
      claimedBy: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (isDeadLetter) {
      if (updated) {
        await writeOperationalAlert({
          type: "waiver_invite_outbox_dead_letter",
          bookingId,
          lastError: errMsg,
          source: "notification-outbox",
        });
        const { sendNotificationOutboxDeadLetterOpsEmail } = await import("./brevo");
        try {
          await sendNotificationOutboxDeadLetterOpsEmail({
            outboxType: "waiver_invite_send",
            bookingId,
            lastError: errMsg,
          });
          await logDeadLetterOpsEmailAudit({
            bookingId,
            outboxType: "waiver_invite_send",
            deliveryState: "sent",
          });
        } catch (e) {
          console.error("[notification-outbox] dead letter ops email waiver invite", e);
          await logDeadLetterOpsEmailAudit({
            bookingId,
            outboxType: "waiver_invite_send",
            deliveryState: "failed",
          });
        }
      }
    }
    return isDeadLetter ? "dead_letter" : "failed";
  }
}

export async function processNextPendingFinalChargeSuccess(
  db: Firestore,
  claimerId?: string
): Promise<"sent" | "failed" | "dead_letter" | "none"> {
  const { Timestamp, FieldValue } = getFirestoreExports();
  const now = Timestamp.now();
  const cid = claimerId ?? randomUUID();
  const snap = await db
    .collection(COLLECTION)
    .where("type", "==", "final_charge_success")
    .where("status", "==", "pending")
    .where("nextAttemptAt", "<=", now)
    .limit(1)
    .get();

  if (snap.empty) return "none";

  const doc = snap.docs[0];
  const data = doc.data() as NotificationOutboxEntry;
  const bookingId = data.bookingId as string;

  const ref = doc.ref;
  const claimed = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (!fresh.exists) return false;
    const d = fresh.data() as NotificationOutboxEntry;
    if (d.status !== "pending") return false;
    tx.update(ref, {
      status: "claimed",
      claimedAt: now,
      claimedBy: cid,
      claimExpiresAt: claimExpiresAtTimestamp(),
      lastAttemptAt: now,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });

  if (!claimed) return "none";

  return deliverClaimedFinalChargeSuccessEntry(db, ref, bookingId, data, cid);
}

export async function processNextPendingDiscountLimitExceeded(
  db: Firestore,
  claimerId?: string
): Promise<"sent" | "failed" | "dead_letter" | "none"> {
  const { Timestamp, FieldValue } = getFirestoreExports();
  const now = Timestamp.now();
  const cid = claimerId ?? randomUUID();
  const snap = await db
    .collection(COLLECTION)
    .where("type", "==", "discount_limit_exceeded_notification")
    .where("status", "==", "pending")
    .where("nextAttemptAt", "<=", now)
    .limit(1)
    .get();

  if (snap.empty) return "none";

  const doc = snap.docs[0];
  const data = doc.data() as NotificationOutboxEntry;
  const bookingId = data.bookingId as string;
  const ref = doc.ref;
  const claimed = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (!fresh.exists) return false;
    const d = fresh.data() as NotificationOutboxEntry;
    if (d.status !== "pending") return false;
    tx.update(ref, {
      status: "claimed",
      claimedAt: now,
      claimedBy: cid,
      claimExpiresAt: claimExpiresAtTimestamp(),
      lastAttemptAt: now,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });

  if (!claimed) return "none";

  return deliverClaimedDiscountLimitExceededEntry(db, ref, bookingId, data, cid);
}

export async function processNextPendingWaiverInvite(
  db: Firestore,
  claimerId?: string
): Promise<"sent" | "failed" | "dead_letter" | "none"> {
  const { Timestamp, FieldValue } = getFirestoreExports();
  const now = Timestamp.now();
  const cid = claimerId ?? randomUUID();
  const snap = await db
    .collection(COLLECTION)
    .where("type", "==", "waiver_invite_send")
    .where("status", "==", "pending")
    .where("nextAttemptAt", "<=", now)
    .limit(1)
    .get();

  if (snap.empty) return "none";

  const doc = snap.docs[0];
  const data = doc.data() as NotificationOutboxEntry;
  const bookingId = data.bookingId as string;

  const ref = doc.ref;
  const claimed = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (!fresh.exists) return false;
    const d = fresh.data() as NotificationOutboxEntry;
    if (d.status !== "pending") return false;
    tx.update(ref, {
      status: "claimed",
      claimedAt: now,
      claimedBy: cid,
      claimExpiresAt: claimExpiresAtTimestamp(),
      lastAttemptAt: now,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });

  if (!claimed) return "none";

  return deliverClaimedWaiverInviteEntry(db, ref, bookingId, data, cid);
}

export async function processNextPendingConfirmation(
  db: Firestore,
  claimerId?: string
): Promise<"sent" | "failed" | "dead_letter" | "none"> {
  const { Timestamp, FieldValue } = getFirestoreExports();
  const now = Timestamp.now();
  const cid = claimerId ?? randomUUID();
  const col = db.collection(COLLECTION);
  const directPendingSnap = await col
    .where("type", "==", "booking_confirmation")
    .where("status", "==", "pending")
    .where("nextAttemptAt", "<=", now)
    .limit(1)
    .get();
  const directFailedSnap = await col
    .where("type", "==", "booking_confirmation")
    .where("status", "==", "failed")
    .where("nextAttemptAt", "<=", now)
    .limit(1)
    .get();
  let snap = !directPendingSnap.empty ? directPendingSnap : directFailedSnap;

  if (snap.empty) return "none";

  const doc = snap.docs[0];
  const data = doc.data() as NotificationOutboxEntry;
  const bookingId = data.bookingId as string;

  const ref = doc.ref;
  const claimed = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (!fresh.exists) return false;
    const d = fresh.data() as NotificationOutboxEntry;
    if (d.status !== "pending" && d.status !== "failed") return false;
    tx.update(ref, {
      status: "claimed",
      claimedAt: now,
      claimedBy: cid,
      claimExpiresAt: claimExpiresAtTimestamp(),
      lastAttemptAt: now,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });

  if (!claimed) return "none";

  return deliverClaimedConfirmationEntry(db, ref, bookingId, data, cid);
}

/**
 * Best-effort immediate send for a single booking after conversion (fire-and-forget from convert-hold-to-booking).
 * Claims the pending outbox row for this bookingId, sends, and marks sent on success; on failure leaves pending for cron.
 * Never throws.
 */
export async function tryImmediateConfirmationSendForBooking(db: Firestore, bookingId: string): Promise<void> {
  try {
    const { Timestamp, FieldValue } = getFirestoreExports();
    const now = Timestamp.now();
    const claimerId = randomUUID();
    const ref = db.collection(COLLECTION).doc(confirmationOutboxDocId(bookingId));
    const primarySnap = await ref.get();
    let data: NotificationOutboxEntry | null = primarySnap.exists
      ? (primarySnap.data() as NotificationOutboxEntry)
      : null;
    let claimRef = ref;
    if (!data || data.type !== "booking_confirmation" || data.bookingId !== bookingId || data.status !== "pending") {
      const legacySnap = await db
        .collection(COLLECTION)
        .where("type", "==", "booking_confirmation")
        .where("bookingId", "==", bookingId)
        .where("status", "==", "pending")
        .limit(1)
        .get();
      if (legacySnap.empty) return;
      const legacyDoc = legacySnap.docs[0];
      claimRef = legacyDoc.ref;
      data = legacyDoc.data() as NotificationOutboxEntry;
    }

    const claimed = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(claimRef);
      if (!fresh.exists) return false;
      const d = fresh.data() as NotificationOutboxEntry;
      if (d.status !== "pending") return false;
      tx.update(claimRef, {
        status: "claimed",
        claimedAt: now,
        claimedBy: claimerId,
        claimExpiresAt: claimExpiresAtTimestamp(),
        lastAttemptAt: now,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return true;
    });

    if (!claimed) return;

    await deliverClaimedConfirmationEntry(db, claimRef, bookingId, data, claimerId);
  } catch (err) {
    console.warn("[notification-outbox] tryImmediateConfirmationSendForBooking failed", err);
  }
}

/** Best-effort immediate waiver invite send after conversion (same pattern as confirmation). Never throws. */
export async function tryImmediateWaiverInviteSendForBooking(db: Firestore, bookingId: string): Promise<void> {
  try {
    const { Timestamp, FieldValue } = getFirestoreExports();
    const now = Timestamp.now();
    const claimerId = randomUUID();
    const ref = db.collection(COLLECTION).doc(waiverInviteOutboxDocId(bookingId));
    const snap = await ref.get();
    if (!snap.exists) return;
    const data = snap.data() as NotificationOutboxEntry;
    if (data.type !== "waiver_invite_send" || data.status !== "pending") return;

    const claimed = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      if (!fresh.exists) return false;
      const d = fresh.data() as NotificationOutboxEntry;
      if (d.status !== "pending") return false;
      tx.update(ref, {
        status: "claimed",
        claimedAt: now,
        claimedBy: claimerId,
        claimExpiresAt: claimExpiresAtTimestamp(),
        lastAttemptAt: now,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return true;
    });

    if (!claimed) return;

    await deliverClaimedWaiverInviteEntry(db, ref, bookingId, data, claimerId);
  } catch (err) {
    console.warn("[notification-outbox] tryImmediateWaiverInviteSendForBooking failed", err);
  }
}

export function amountIntegrityMismatchCustomerOutboxDocId(holdId: string): string {
  return `${holdId}_amount_integrity_mismatch_customer`;
}

export function paymentUnderManualReviewCustomerOutboxDocId(holdId: string): string {
  return `${holdId}_payment_under_manual_review_customer`;
}

function createPendingHoldCustomerEmailPayload(
  holdId: string,
  type: "amount_integrity_mismatch_customer" | "payment_under_manual_review_customer",
  payload: { customerEmail: string; customerName: string }
): Omit<
  NotificationOutboxEntry,
  "sentAt" | "lastAttemptAt" | "lastError" | "claimedAt" | "claimedBy"
> {
  const { Timestamp } = getFirestoreExports();
  const now = Timestamp.now();
  return {
    bookingId: holdId,
    type,
    payload: { holdId, ...payload },
    status: "pending",
    attemptCount: 0,
    maxAttempts: MAX_ATTEMPTS,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

/** Durable customer notice after amount-integrity rollback (replaces fire-and-forget Brevo in conversion path). */
export async function enqueueAmountIntegrityMismatchCustomerOutbox(
  db: Firestore,
  params: { holdId: string; customerEmail: string; customerName: string }
): Promise<void> {
  const ref = db.collection(COLLECTION).doc(amountIntegrityMismatchCustomerOutboxDocId(params.holdId));
  const snap = await ref.get();
  if (snap.exists) {
    const st = (snap.data() as Partial<NotificationOutboxEntry>).status;
    if (st === "sent" || st === "dead_letter") return;
  }
  await ref.set(
    createPendingHoldCustomerEmailPayload(params.holdId, "amount_integrity_mismatch_customer", {
      customerEmail: params.customerEmail,
      customerName: params.customerName,
    })
  );
}

export async function enqueuePaymentUnderManualReviewCustomerOutbox(
  db: Firestore,
  params: { holdId: string; customerEmail: string; customerName: string }
): Promise<void> {
  const ref = db.collection(COLLECTION).doc(paymentUnderManualReviewCustomerOutboxDocId(params.holdId));
  const snap = await ref.get();
  if (snap.exists) {
    const st = (snap.data() as Partial<NotificationOutboxEntry>).status;
    if (st === "sent" || st === "dead_letter") return;
  }
  await ref.set(
    createPendingHoldCustomerEmailPayload(params.holdId, "payment_under_manual_review_customer", {
      customerEmail: params.customerEmail,
      customerName: params.customerName,
    })
  );
}

async function deliverClaimedHoldScopedCustomerEmail(
  db: Firestore,
  ref: DocumentReference,
  data: NotificationOutboxEntry,
  claimerId: string,
  kind: "amount_integrity_mismatch_customer" | "payment_under_manual_review_customer"
): Promise<"sent" | "failed" | "dead_letter"> {
  const { Timestamp, FieldValue } = getFirestoreExports();
  const now = Timestamp.now();
  const pl = data.payload as { holdId?: string; customerEmail?: string; customerName?: string };
  const holdId = pl.holdId ?? data.bookingId;
  const to = pl.customerEmail?.trim() ?? "";
  const customerName = pl.customerName?.trim() || "Guest";
  if (!to) {
    await updateOutboxIfStillClaimed(db, ref, claimerId, {
      status: "dead_letter",
      lastError: "missing_customer_email",
      lastAttemptAt: now,
      attemptCount: data.attemptCount + 1,
      nextAttemptAt: now,
      claimExpiresAt: FieldValue.delete(),
      claimedAt: FieldValue.delete(),
      claimedBy: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return "dead_letter";
  }
  try {
    const {
      sendAmountIntegrityMismatchCustomerEmail,
      sendPaymentUnderManualReviewCustomerEmail,
    } = await import("./brevo");
    if (kind === "amount_integrity_mismatch_customer") {
      await sendAmountIntegrityMismatchCustomerEmail({ to, customerName, holdId });
    } else {
      await sendPaymentUnderManualReviewCustomerEmail({ to, customerName, holdId });
    }
    await updateOutboxIfStillClaimed(db, ref, claimerId, {
      status: "sent",
      sentAt: now,
      claimExpiresAt: FieldValue.delete(),
      claimedAt: FieldValue.delete(),
      claimedBy: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return "sent";
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const attemptCount = data.attemptCount + 1;
    const isDeadLetter = attemptCount >= data.maxAttempts;
    const status: NotificationOutboxStatus = isDeadLetter ? "dead_letter" : "pending";
    await updateOutboxIfStillClaimed(db, ref, claimerId, {
      status,
      lastError: errMsg,
      lastAttemptAt: now,
      attemptCount,
      nextAttemptAt: isDeadLetter ? now : Timestamp.fromDate(nextAttemptAt(attemptCount)),
      claimExpiresAt: FieldValue.delete(),
      claimedAt: FieldValue.delete(),
      claimedBy: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (isDeadLetter) {
      await writeOperationalAlert({
        type: "hold_customer_notice_dead_letter",
        source: "notification-outbox",
        holdId,
        outboxType: kind,
        lastError: errMsg,
      }).catch(() => {});
    }
    return isDeadLetter ? "dead_letter" : "failed";
  }
}

async function claimAndDeliverNextHoldCustomerEmail(
  db: Firestore,
  kind: "amount_integrity_mismatch_customer" | "payment_under_manual_review_customer",
  claimerId: string
): Promise<"sent" | "failed" | "dead_letter" | "none"> {
  const { Timestamp, FieldValue } = getFirestoreExports();
  const now = Timestamp.now();
  const snap = await db
    .collection(COLLECTION)
    .where("type", "==", kind)
    .where("status", "==", "pending")
    .where("nextAttemptAt", "<=", now)
    .limit(1)
    .get();
  if (snap.empty) return "none";
  const doc = snap.docs[0];
  const data = doc.data() as NotificationOutboxEntry;
  const ref = doc.ref;
  const claimed = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (!fresh.exists) return false;
    const d = fresh.data() as NotificationOutboxEntry;
    if (d.status !== "pending") return false;
    tx.update(ref, {
      status: "claimed",
      claimedAt: now,
      claimedBy: claimerId,
      claimExpiresAt: claimExpiresAtTimestamp(),
      lastAttemptAt: now,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
  if (!claimed) return "none";
  return deliverClaimedHoldScopedCustomerEmail(db, ref, data, claimerId, kind);
}

export async function processNextPendingAmountIntegrityMismatchCustomer(
  db: Firestore,
  claimerId?: string
): Promise<"sent" | "failed" | "dead_letter" | "none"> {
  return claimAndDeliverNextHoldCustomerEmail(
    db,
    "amount_integrity_mismatch_customer",
    claimerId ?? randomUUID()
  );
}

export async function processNextPendingPaymentUnderManualReviewCustomer(
  db: Firestore,
  claimerId?: string
): Promise<"sent" | "failed" | "dead_letter" | "none"> {
  return claimAndDeliverNextHoldCustomerEmail(
    db,
    "payment_under_manual_review_customer",
    claimerId ?? randomUUID()
  );
}

/** Resets old dead_letter booking_confirmation rows so a transient provider outage can recover. */
export async function resetStaleDeadLetterBookingConfirmations(
  db: Firestore,
  opts?: { maxAgeHours?: number; maxDocs?: number }
): Promise<number> {
  const maxAgeHours = opts?.maxAgeHours ?? parseInt(process.env.OUTBOX_DEAD_LETTER_RESET_HOURS ?? "24", 10);
  const maxDocs = opts?.maxDocs ?? 20;
  const safeHours = Number.isFinite(maxAgeHours) && maxAgeHours >= 1 ? Math.min(maxAgeHours, 168) : 24;
  const cutoffMs = Date.now() - safeHours * 60 * 60 * 1000;
  const { Timestamp, FieldValue } = getFirestoreExports();
  const snap = await db
    .collection(COLLECTION)
    .where("type", "==", "booking_confirmation")
    .where("status", "==", "dead_letter")
    .limit(80)
    .get();
  let reset = 0;
  const now = Timestamp.now();
  for (const doc of snap.docs) {
    if (reset >= maxDocs) break;
    const d = doc.data() as NotificationOutboxEntry;
    const c = d.createdAt?.toDate?.()?.getTime() ?? 0;
    if (c === 0 || c > cutoffMs) continue;
    await doc.ref.update({
      status: "pending",
      attemptCount: 0,
      nextAttemptAt: now,
      lastError: FieldValue.delete(),
      claimExpiresAt: FieldValue.delete(),
      claimedAt: FieldValue.delete(),
      claimedBy: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    reset++;
  }
  return reset;
}
