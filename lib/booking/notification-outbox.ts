/**
 * Durable notification outbox for booking confirmation sends.
 * Jobs are created transactionally with booking creation; a cron processes them
 * with retries and exponential backoff.
 */

import type { Firestore, DocumentReference } from "firebase-admin/firestore";
import { getFirestoreExports } from "./firebase-admin";
import { writeOperationalAlert } from "./operational-alerts";
import type { NotificationOutboxEntry, NotificationOutboxStatus } from "./types";
import { isDepositMode } from "./deposit-mode";

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

export function addConfirmationOutboxInTransaction(tx: FirebaseFirestore.Transaction, db: Firestore, bookingId: string): void {
  const ref = db.collection(COLLECTION).doc();
  const entry = createPendingConfirmationPayload(bookingId);
  tx.set(ref, entry);
}

/**
 * Resets claimed rows whose lease expired (e.g. Netlify function killed mid-send) back to pending.
 */
export async function processStaleClaims(db: Firestore): Promise<number> {
  const { Timestamp, FieldValue } = getFirestoreExports();
  const now = Timestamp.now();
  const snap = await db
    .collection(COLLECTION)
    .where("type", "==", "booking_confirmation")
    .where("status", "==", "claimed")
    .where("claimExpiresAt", "<", now)
    .get();

  if (snap.empty) return 0;

  let batch = db.batch();
  let ops = 0;
  let total = 0;
  for (const doc of snap.docs) {
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
  return total;
}

export type NotificationOutboxStats = {
  pending: number;
  deadLetter: number;
  stuckClaims: number;
};

/** Aggregate counts for admin visibility (confirmation pipeline health). */
export async function getNotificationOutboxStats(db: Firestore): Promise<NotificationOutboxStats> {
  const { Timestamp } = getFirestoreExports();
  const now = Timestamp.now();
  const base = () => db.collection(COLLECTION).where("type", "==", "booking_confirmation");
  const [pendingSnap, deadSnap, stuckSnap] = await Promise.all([
    base().where("status", "==", "pending").count().get(),
    base().where("status", "==", "dead_letter").count().get(),
    base().where("status", "==", "claimed").where("claimExpiresAt", "<", now).count().get(),
  ]);
  return {
    pending: pendingSnap.data().count,
    deadLetter: deadSnap.data().count,
    stuckClaims: stuckSnap.data().count,
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
    const { getRequestById } = await import("@/lib/waiver/firestore");
    type Booking = import("./types").Booking;
    type Experience = import("./types").Experience;

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
    /** SMS only — confirmation email does not include a separate receipt link. */
    const receiptLink = signedReceipt ? `${baseUrl}/booking/success?receipt_token=${encodeURIComponent(signedReceipt)}` : undefined;

    let waiverSigningUrl: string | undefined;
    let waiverGroupSigningUrl: string | undefined;
    if (booking.waiver?.requestId) {
      const req = await getRequestById(booking.waiver.requestId);
      if (req?.status === "pending" && req.signingUrl) {
        waiverSigningUrl = req.signingUrl;
        waiverGroupSigningUrl = (req as { groupSigningUrl?: string }).groupSigningUrl;
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

    const subject = await sendBookingConfirmationEmail(booking, emailContext);
    await sendBookingConfirmationCopyToBusiness(booking, emailContext);
    await logEmailSent({
      to: booking.customer.email,
      toName: booking.customer.name,
      templateId: "booking_confirmation",
      subject,
      bookingId,
    });

    if (booking.customer?.phone?.trim()) {
      const tripDateStr = start.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "America/Chicago",
      });
      const smsSent = await sendBookingConfirmationSms({
        phone: booking.customer.phone,
        customerName: booking.customer.name,
        experienceName: boatNameForEmail,
        tripDate: tripDateStr,
        bookingId,
        receiptLink,
      });
      if (smsSent) {
        await db.collection("bookings").doc(bookingId).update({
          confirmationSmsSentAt: Timestamp.now(),
        });
      }
    }

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
        type: "confirmation_dead_letter",
        bookingId,
        lastError: errMsg,
        source: "notification-outbox",
      });
    }
    return isDeadLetter ? "dead_letter" : "failed";
  }
}

export async function processNextPendingConfirmation(db: Firestore): Promise<"sent" | "failed" | "dead_letter" | "none"> {
  const { Timestamp, FieldValue } = getFirestoreExports();
  const now = Timestamp.now();
  const snap = await db
    .collection(COLLECTION)
    .where("type", "==", "booking_confirmation")
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
    const snap = await db
      .collection(COLLECTION)
      .where("type", "==", "booking_confirmation")
      .where("bookingId", "==", bookingId)
      .where("status", "==", "pending")
      .limit(1)
      .get();

    if (snap.empty) return;

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
        claimExpiresAt: claimExpiresAtTimestamp(),
        lastAttemptAt: now,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return true;
    });

    if (!claimed) return;

    await deliverClaimedConfirmationEntry(db, ref, bookingId, data);
  } catch (err) {
    console.warn("[notification-outbox] tryImmediateConfirmationSendForBooking failed", err);
  }
}
