/**
 * Cron: process pending booking confirmation outbox jobs.
 * Run every 1–2 minutes. Processes up to MAX_PER_RUN jobs per run to avoid multi-minute
 * delivery delays when multiple bookings arrive simultaneously. Sends confirmation email (+ SMS),
 * then marks sent or retries with exponential backoff. Dead-letter jobs surface in admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { randomUUID } from "crypto";
import {
  processNextPendingConfirmation,
  processNextPendingDiscountLimitExceeded,
  processNextPendingFinalChargeSuccess,
  processNextPendingWaiverInvite,
  processNextPendingAmountIntegrityMismatchCustomer,
  processNextPendingPaymentUnderManualReviewCustomer,
  processStaleClaims,
  alertOnStalledOutbox,
  getNotificationOutboxStats,
  resetStaleDeadLetterBookingConfirmations,
} from "@/lib/booking/notification-outbox";
import {
  alertOnStalePendingWaiverCreation,
  processPendingWaiverCreationQueue,
} from "@/lib/booking/pending-waiver-reconciliation";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
import { assertCronPostAuthorized } from "@/lib/booking/cron-auth";
import { processStaleReconcilingPayments } from "@/lib/booking/reconciling-payments";
import { alertOnStripeEventsProcessingStale } from "@/lib/booking/stripe-events-stale";

const MAX_PER_RUN = 10;
const STALLED_OUTBOX_ALERT_THRESHOLD_MINUTES = 10;
const STRIPE_EVENTS_PROCESSING_STALE_MINUTES = 5;

export async function POST(request: NextRequest) {
  const authErr = await assertCronPostAuthorized(request);
  if (authErr) return authErr;

  const db = getDb();
  const claimerId = randomUUID();
  const staleClaimsReset = await processStaleClaims(db, { currentClaimerId: claimerId });
  await alertOnStalledOutbox(db, STALLED_OUTBOX_ALERT_THRESHOLD_MINUTES);
  const deadLetterResetCount = await resetStaleDeadLetterBookingConfirmations(db);
  const pendingWaiverQueue = await processPendingWaiverCreationQueue(db);
  await alertOnStalePendingWaiverCreation(db);
  const outboxStats = await getNotificationOutboxStats(db);
  const reconcilingPayments = await processStaleReconcilingPayments(db);
  const staleStripeEvents = await alertOnStripeEventsProcessingStale(db, STRIPE_EVENTS_PROCESSING_STALE_MINUTES);

  let sentCount = 0;
  let failedCount = 0;
  let noneCount = 0;

  for (let i = 0; i < MAX_PER_RUN; i++) {
    const result = await processNextPendingConfirmation(db, claimerId);
    if (result === "sent") sentCount++;
    else if (result === "failed" || result === "dead_letter") failedCount++;
    else {
      noneCount++;
      break;
    }
  }

  let finalChargeSentCount = 0;
  let finalChargeFailedCount = 0;
  let finalChargeNoneCount = 0;

  for (let i = 0; i < MAX_PER_RUN; i++) {
    const result = await processNextPendingFinalChargeSuccess(db, claimerId);
    if (result === "sent") finalChargeSentCount++;
    else if (result === "failed" || result === "dead_letter") finalChargeFailedCount++;
    else {
      finalChargeNoneCount++;
      break;
    }
  }

  let discountLimitSentCount = 0;
  let discountLimitFailedCount = 0;
  let discountLimitNoneCount = 0;
  for (let i = 0; i < MAX_PER_RUN; i++) {
    const result = await processNextPendingDiscountLimitExceeded(db, claimerId);
    if (result === "sent") discountLimitSentCount++;
    else if (result === "failed" || result === "dead_letter") discountLimitFailedCount++;
    else {
      discountLimitNoneCount++;
      break;
    }
  }

  let waiverInviteSentCount = 0;
  let waiverInviteFailedCount = 0;
  let waiverInviteNoneCount = 0;
  for (let i = 0; i < MAX_PER_RUN; i++) {
    const result = await processNextPendingWaiverInvite(db, claimerId);
    if (result === "sent") waiverInviteSentCount++;
    else if (result === "failed" || result === "dead_letter") waiverInviteFailedCount++;
    else {
      waiverInviteNoneCount++;
      break;
    }
  }

  let holdNoticeSent = 0;
  let holdNoticeFailed = 0;
  for (let i = 0; i < MAX_PER_RUN; i++) {
    const a = await processNextPendingAmountIntegrityMismatchCustomer(db, claimerId);
    const b = await processNextPendingPaymentUnderManualReviewCustomer(db, claimerId);
    for (const r of [a, b]) {
      if (r === "sent") holdNoticeSent++;
      else if (r === "failed" || r === "dead_letter") holdNoticeFailed++;
    }
    if (a === "none" && b === "none") break;
  }

  if (
    failedCount > 0 ||
    finalChargeFailedCount > 0 ||
    discountLimitFailedCount > 0 ||
    waiverInviteFailedCount > 0 ||
    holdNoticeFailed > 0
  ) {
    await writeOperationalAlert({
      type: "confirmation_outbox_cron_failures",
      failedCount:
        failedCount +
        finalChargeFailedCount +
        discountLimitFailedCount +
        waiverInviteFailedCount +
        holdNoticeFailed,
      source: "process-confirmation-outbox",
    });
  }

  return NextResponse.json({
    ok: true,
    staleClaimsReset,
    deadLetterResetCount,
    pendingWaiverQueue,
    holdNoticeSent,
    holdNoticeFailed,
    sentCount,
    failedCount,
    noneCount,
    finalChargeSentCount,
    finalChargeFailedCount,
    finalChargeNoneCount,
    discountLimitSentCount,
    discountLimitFailedCount,
    discountLimitNoneCount,
    waiverInviteSentCount,
    waiverInviteFailedCount,
    waiverInviteNoneCount,
    notificationOutboxStats: outboxStats,
    reconcilingPayments,
    staleStripeEventsProcessingCount: staleStripeEvents,
  });
}
