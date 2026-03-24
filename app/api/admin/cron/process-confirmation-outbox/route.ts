/**
 * Cron: process pending booking confirmation outbox jobs.
 * Run every 1–2 minutes. Processes up to MAX_PER_RUN jobs per run to avoid multi-minute
 * delivery delays when multiple bookings arrive simultaneously. Sends confirmation email (+ SMS),
 * then marks sent or retries with exponential backoff. Dead-letter jobs surface in admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import {
  processNextPendingConfirmation,
  processNextPendingDiscountLimitExceeded,
  processNextPendingFinalChargeSuccess,
  processNextPendingWaiverInvite,
  processStaleClaims,
} from "@/lib/booking/notification-outbox";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
import { assertCronPostAuthorized } from "@/lib/booking/cron-auth";

const MAX_PER_RUN = 10;

export async function POST(request: NextRequest) {
  const authErr = await assertCronPostAuthorized(request);
  if (authErr) return authErr;

  const db = getDb();
  const staleClaimsReset = await processStaleClaims(db);

  let sentCount = 0;
  let failedCount = 0;
  let noneCount = 0;

  for (let i = 0; i < MAX_PER_RUN; i++) {
    const result = await processNextPendingConfirmation(db);
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
    const result = await processNextPendingFinalChargeSuccess(db);
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
    const result = await processNextPendingDiscountLimitExceeded(db);
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
    const result = await processNextPendingWaiverInvite(db);
    if (result === "sent") waiverInviteSentCount++;
    else if (result === "failed" || result === "dead_letter") waiverInviteFailedCount++;
    else {
      waiverInviteNoneCount++;
      break;
    }
  }

  if (failedCount > 0 || finalChargeFailedCount > 0 || discountLimitFailedCount > 0 || waiverInviteFailedCount > 0) {
    await writeOperationalAlert({
      type: "confirmation_outbox_cron_failures",
      failedCount: failedCount + finalChargeFailedCount + discountLimitFailedCount + waiverInviteFailedCount,
      source: "process-confirmation-outbox",
    });
  }

  return NextResponse.json({
    ok: true,
    staleClaimsReset,
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
  });
}
