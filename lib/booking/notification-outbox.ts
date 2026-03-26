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
import type { NotificationOutboxEntry, NotificationOutboxStatus } from "./types";
import { isPlaceholderCheckoutEmail } from "@/lib/booking/stripe-payment-intent-convert";
import { isDepositMode } from "./deposit-mode";
import { getReminderRetryQueueStatsByTemplate } from "./reminder-retry";
import { getStaleClaimCountsByTemplateKey } from "./notification-claim";

const COLLECTION = "notificationOutbox";
const MAX_ATTEMPTS = 5;
const INITIAL_BACKOFF_MS = 60 * 1000; // 1 min
const MAX_BACKOFF_MS = 24 * 60 * 60 * 1000; // 24 h

/** Lease on a claimed outbox row; if the worker dies, stale claims reset to pending after this window. */
const CLAIM_LEASE_MS = 2 * 60 * 1000;

function nextAttemptAt(attemptCount: number): Date {
  const delay = Math.min(INITIAL_BACKOFF_MS * Math.pow(2, attemptCount), MAX_BACKOFF_MS);
  return new Date(Date.now() + delay);
}

function claimExpiresAtTimestamp() {
  const { Timestamp } = getFirestoreExports();
  return Timestamp.fromMillis(Date.now() + CLAIM_LEASE_MS);
}

export function createPendingConfirmationPayload(bookingId: string): Omit<NotificationOutboxEntry, "sentAt" | "lastAttemptAt" | "lastError" | "claimedAt" | "claimedBy"> {
  const { Timestamp } = getFirestoreExports();
  const now = Timestamp.now();
  return {
    bookingId,
    type: "booking_confirmation",
    payload: { bookingId },
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
  bookingId: string
): Promise<void> {
  const ref = db.collection(COLLECTION).doc(confirmationOutboxDocId(bookingId));
  const snap = await tx.get(ref);
  if (snap.exists) {
    const st = (snap.data() as Partial<NotificationOutboxEntry>).status;
    if (st === "sent" || st === "dead_letter") return;
    return;
  }
  tx.set(ref, createPendingConfirmationPayload(bookingId));
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
export async function processStaleClaims(db: Firestore): Promise<number> {
  const { Timestamp, FieldValue } = getFirestoreExports();
  const now = Timestamp.now();
  let total = 0;
  for (const outboxType of [
    "booking_confirmation",
    "final_charge_success",
    "discount_limit_exceeded_notification",
    "waiver_invite_send",
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
      // Merge: do not clear providerMessageId — Brevo may have succeeded before the status write.
      batch.update(doc.ref, {
        status: "pending",
        claimExpiresAt: FieldValue.delete(),
        claimedAt: FieldValue.delete(),
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
  };
  reminderRetryQueue: Awaited<ReturnType<typeof getReminderRetryQueueStatsByTemplate>>;
  staleClaimCountsByTemplate: Record<string, number>;
};

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
  ): Promise<NotificationOutboxTypeStats> => {
    const base = () => db.collection(COLLECTION).where("type", "==", outboxType);
    const [pendingSnap, deadSnap, stuckSnap] = await Promise.all([
      base().where("status", "==", "pending").count().get(),
      base().where("status", "==", "dead_letter").count().get(),
      db
        .collection(COLLECTION)
        .where("status", "==", "claimed")
        .where("type", "==", outboxType)
        .where("claimExpiresAt", "<", now)
        .count()
        .get(),
    ]);
    return {
      pending: pendingSnap.data().count,
      deadLetter: deadSnap.data().count,
      stuckClaims: stuckSnap.data().count,
    };
  };
  const [bc, fc, disc, wv, reminderRetryQueue, staleClaimCountsByTemplate] = await Promise.all([
    countForType("booking_confirmation"),
    countForType("final_charge_success"),
    countForType("discount_limit_exceeded_notification"),
    countForType("waiver_invite_send"),
    getReminderRetryQueueStatsByTemplate(db),
    getStaleClaimCountsByTemplateKey(db),
  ]);
  return {
    pending: bc.pending,
    deadLetter: bc.deadLetter,
    stuckClaims: bc.stuckClaims,
    byType: {
      booking_confirmation: bc,
      final_charge_success: fc,
      discount_limit_exceeded_notification: disc,
      waiver_invite_send: wv,
    },
    reminderRetryQueue,
    staleClaimCountsByTemplate,
  };
}

async function deliverClaimedConfirmationEntry(
  db: Firestore,
  ref: DocumentReference,
  bookingId: string,
  data: NotificationOutboxEntry
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
      await ref.update({
        status: "failed",
        lastError: "Booking not found",
        lastAttemptAt: now,
        attemptCount: data.attemptCount + 1,
        nextAttemptAt: Timestamp.fromDate(nextAttemptAt(data.attemptCount + 1)),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return "failed";
    }

    let booking = bookingSnap.data() as Booking;
    const customerEmailEarly = booking.customer?.email?.trim() ?? "";
    if (!customerEmailEarly || isPlaceholderCheckoutEmail(customerEmailEarly)) {
      await ref.update({
        status: "failed",
        lastError: !customerEmailEarly
          ? "Customer email not ready"
          : "Customer email is placeholder checkout address",
        lastAttemptAt: now,
        attemptCount: data.attemptCount + 1,
        nextAttemptAt: Timestamp.fromMillis(Date.now() + 30_000),
        claimExpiresAt: FieldValue.delete(),
        claimedAt: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return "failed";
    }
    if (!booking.waiver?.requestId && booking.customer?.email?.trim()) {
      const { createWaiverForBooking } = await import("@/lib/waiver/on-booking-created");
      await createWaiverForBooking({
        bookingId,
        customerEmail: booking.customer.email.trim(),
        customerName: booking.customer.name,
      });
      bookingSnap = await db.collection("bookings").doc(bookingId).get();
      if (bookingSnap.exists) booking = bookingSnap.data() as Booking;
    }
    const parsed = parseSlotId(booking.slotId ?? "");
    if (!parsed) {
      await ref.update({
        status: "failed",
        lastError: "Invalid slotId",
        lastAttemptAt: now,
        attemptCount: data.attemptCount + 1,
        nextAttemptAt: Timestamp.fromDate(nextAttemptAt(data.attemptCount + 1)),
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

    const bookingWithId = { ...booking, id: bookingId } as typeof booking & { id: string };
    let subject: string;
    let providerMessageId: string | undefined = idemData?.providerMessageId;

    if (!idemData?.providerMessageId) {
      const sendResult = await sendBookingConfirmationEmail(bookingWithId, emailContext, {
        idempotencyKey: `${bookingId}_booking_confirmation`,
      });
      subject = sendResult.subject;
      providerMessageId = sendResult.providerMessageId;
      if (!providerMessageId) {
        console.warn(
          "[notification-outbox] Brevo booking confirmation returned no messageId — marking failed for retry",
          { bookingId }
        );
        await ref.update({
          status: "failed",
          lastError: "Brevo response missing provider messageId",
          lastAttemptAt: now,
          attemptCount: data.attemptCount + 1,
          nextAttemptAt: Timestamp.fromDate(nextAttemptAt(data.attemptCount + 1)),
          claimExpiresAt: FieldValue.delete(),
          claimedAt: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return "failed";
      }
      await ref.update({
        providerMessageId,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      subject = "Booking confirmation (delivery recovered)";
    }

    await ref.update({
      status: "sent",
      sentAt: now,
      claimExpiresAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const { notifyStaffBookingConfirmation } = await import("./staff-notifications");
    try {
      await sendBookingConfirmationCopyToBusiness(bookingWithId, emailContext);
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
    await ref.update({
      status,
      lastError: errMsg,
      lastAttemptAt: now,
      attemptCount,
      nextAttemptAt: isDeadLetter ? now : Timestamp.fromDate(nextAttemptAt(attemptCount)),
      claimExpiresAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (isDeadLetter) {
      await writeOperationalAlert({
        type: "confirmation_dead_letter",
        bookingId,
        lastError: errMsg,
        source: "notification-outbox",
      });
      const { sendNotificationOutboxDeadLetterOpsEmail } = await import("./brevo");
      await sendNotificationOutboxDeadLetterOpsEmail({
        outboxType: "booking_confirmation",
        bookingId,
        lastError: errMsg,
      }).catch((e) => console.error("[notification-outbox] dead letter ops email", e));
    }
    return isDeadLetter ? "dead_letter" : "failed";
  }
}

async function deliverClaimedFinalChargeSuccessEntry(
  db: Firestore,
  ref: DocumentReference,
  bookingId: string,
  data: NotificationOutboxEntry
): Promise<"sent" | "failed" | "dead_letter"> {
  const { Timestamp, FieldValue } = getFirestoreExports();
  const now = Timestamp.now();
  type Booking = import("./types").Booking;
  try {
    const { notifyFinalChargeSuccess } = await import("./notify-final-charge-success");
    const bookingSnap = await db.collection("bookings").doc(bookingId).get();
    if (!bookingSnap.exists) {
      await ref.update({
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
    const result = await notifyFinalChargeSuccess(db, bookingId, booking, { skipReminderRetryQueue: true });
    if (result.ok) {
      await ref.update({
        status: "sent",
        sentAt: now,
        ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {}),
        claimExpiresAt: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return "sent";
    }
    const attemptCount = data.attemptCount + 1;
    const isDeadLetter = attemptCount >= data.maxAttempts;
    const status: NotificationOutboxStatus = isDeadLetter ? "dead_letter" : "pending";
    await ref.update({
      status,
      lastError: "notifyFinalChargeSuccess returned false",
      lastAttemptAt: now,
      attemptCount,
      nextAttemptAt: isDeadLetter ? now : Timestamp.fromDate(nextAttemptAt(attemptCount)),
      claimExpiresAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (isDeadLetter) {
      await writeOperationalAlert({
        type: "final_charge_success_outbox_dead_letter",
        bookingId,
        lastError: "notifyFinalChargeSuccess returned false",
        source: "notification-outbox",
      });
      const { sendNotificationOutboxDeadLetterOpsEmail } = await import("./brevo");
      await sendNotificationOutboxDeadLetterOpsEmail({
        outboxType: "final_charge_success",
        bookingId,
        lastError: "notifyFinalChargeSuccess returned false",
      }).catch((e) => console.error("[notification-outbox] dead letter ops email", e));
    }
    return isDeadLetter ? "dead_letter" : "failed";
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const attemptCount = data.attemptCount + 1;
    const isDeadLetter = attemptCount >= data.maxAttempts;
    const status: NotificationOutboxStatus = isDeadLetter ? "dead_letter" : "pending";
    await ref.update({
      status,
      lastError: errMsg,
      lastAttemptAt: now,
      attemptCount,
      nextAttemptAt: isDeadLetter ? now : Timestamp.fromDate(nextAttemptAt(attemptCount)),
      claimExpiresAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (isDeadLetter) {
      await writeOperationalAlert({
        type: "final_charge_success_outbox_dead_letter",
        bookingId,
        lastError: errMsg,
        source: "notification-outbox",
      });
      const { sendNotificationOutboxDeadLetterOpsEmail } = await import("./brevo");
      await sendNotificationOutboxDeadLetterOpsEmail({
        outboxType: "final_charge_success",
        bookingId,
        lastError: errMsg,
      }).catch((e) => console.error("[notification-outbox] dead letter ops email", e));
    }
    return isDeadLetter ? "dead_letter" : "failed";
  }
}

async function deliverClaimedDiscountLimitExceededEntry(
  db: Firestore,
  ref: DocumentReference,
  bookingId: string,
  data: NotificationOutboxEntry
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
      await ref.update({
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
      await ref.update({
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
    await ref.update({
      status: "sent",
      sentAt: now,
      claimExpiresAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return "sent";
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const attemptCount = data.attemptCount + 1;
    const isDeadLetter = attemptCount >= data.maxAttempts;
    const status: NotificationOutboxStatus = isDeadLetter ? "dead_letter" : "pending";
    await ref.update({
      status,
      lastError: errMsg,
      lastAttemptAt: now,
      attemptCount,
      nextAttemptAt: isDeadLetter ? now : Timestamp.fromDate(nextAttemptAt(attemptCount)),
      claimExpiresAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (isDeadLetter) {
      await writeOperationalAlert({
        type: "discount_limit_exceeded_notification_dead_letter",
        bookingId,
        lastError: errMsg,
        source: "notification-outbox",
      });
      const { sendNotificationOutboxDeadLetterOpsEmail } = await import("./brevo");
      await sendNotificationOutboxDeadLetterOpsEmail({
        outboxType: "discount_limit_exceeded_notification",
        bookingId,
        lastError: errMsg,
      }).catch((e) => console.error("[notification-outbox] dead letter ops email", e));
    }
    return isDeadLetter ? "dead_letter" : "failed";
  }
}

async function deliverClaimedWaiverInviteEntry(
  db: Firestore,
  ref: DocumentReference,
  bookingId: string,
  data: NotificationOutboxEntry
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
      await ref.update({
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
      await ref.update({
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
      await ref.update({
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
      await ref.update({
        status: "sent",
        sentAt: now,
        claimExpiresAt: FieldValue.delete(),
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
      await ref.update({
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
    await ref.update({
      status: "sent",
      sentAt: now,
      claimExpiresAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return "sent";
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const attemptCount = data.attemptCount + 1;
    const isDeadLetter = attemptCount >= data.maxAttempts;
    const status: NotificationOutboxStatus = isDeadLetter ? "dead_letter" : "pending";
    await ref.update({
      status,
      lastError: errMsg,
      lastAttemptAt: now,
      attemptCount,
      nextAttemptAt: isDeadLetter ? now : Timestamp.fromDate(nextAttemptAt(attemptCount)),
      claimExpiresAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (isDeadLetter) {
      await writeOperationalAlert({
        type: "waiver_invite_outbox_dead_letter",
        bookingId,
        lastError: errMsg,
        source: "notification-outbox",
      });
      const { sendNotificationOutboxDeadLetterOpsEmail } = await import("./brevo");
      await sendNotificationOutboxDeadLetterOpsEmail({
        outboxType: "waiver_invite_send",
        bookingId,
        lastError: errMsg,
      }).catch((e) => console.error("[notification-outbox] dead letter ops email waiver invite", e));
    }
    return isDeadLetter ? "dead_letter" : "failed";
  }
}

export async function processNextPendingFinalChargeSuccess(
  db: Firestore
): Promise<"sent" | "failed" | "dead_letter" | "none"> {
  const { Timestamp, FieldValue } = getFirestoreExports();
  const now = Timestamp.now();
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
      claimExpiresAt: claimExpiresAtTimestamp(),
      lastAttemptAt: now,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });

  if (!claimed) return "none";

  return deliverClaimedFinalChargeSuccessEntry(db, ref, bookingId, data);
}

export async function processNextPendingDiscountLimitExceeded(
  db: Firestore
): Promise<"sent" | "failed" | "dead_letter" | "none"> {
  const { Timestamp, FieldValue } = getFirestoreExports();
  const now = Timestamp.now();
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
      claimExpiresAt: claimExpiresAtTimestamp(),
      lastAttemptAt: now,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });

  if (!claimed) return "none";

  return deliverClaimedDiscountLimitExceededEntry(db, ref, bookingId, data);
}

export async function processNextPendingWaiverInvite(
  db: Firestore
): Promise<"sent" | "failed" | "dead_letter" | "none"> {
  const { Timestamp, FieldValue } = getFirestoreExports();
  const now = Timestamp.now();
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
      claimExpiresAt: claimExpiresAtTimestamp(),
      lastAttemptAt: now,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });

  if (!claimed) return "none";

  return deliverClaimedWaiverInviteEntry(db, ref, bookingId, data);
}

export async function processNextPendingConfirmation(db: Firestore): Promise<"sent" | "failed" | "dead_letter" | "none"> {
  const { Timestamp, FieldValue } = getFirestoreExports();
  const now = Timestamp.now();
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
      claimExpiresAt: claimExpiresAtTimestamp(),
      lastAttemptAt: now,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });

  if (!claimed) return "none";

  return deliverClaimedConfirmationEntry(db, ref, bookingId, data);
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
        claimExpiresAt: claimExpiresAtTimestamp(),
        lastAttemptAt: now,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return true;
    });

    if (!claimed) return;

    await deliverClaimedConfirmationEntry(db, claimRef, bookingId, data);
  } catch (err) {
    console.warn("[notification-outbox] tryImmediateConfirmationSendForBooking failed", err);
  }
}

/** Best-effort immediate waiver invite send after conversion (same pattern as confirmation). Never throws. */
export async function tryImmediateWaiverInviteSendForBooking(db: Firestore, bookingId: string): Promise<void> {
  try {
    const { Timestamp, FieldValue } = getFirestoreExports();
    const now = Timestamp.now();
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
        claimExpiresAt: claimExpiresAtTimestamp(),
        lastAttemptAt: now,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return true;
    });

    if (!claimed) return;

    await deliverClaimedWaiverInviteEntry(db, ref, bookingId, data);
  } catch (err) {
    console.warn("[notification-outbox] tryImmediateWaiverInviteSendForBooking failed", err);
  }
}
