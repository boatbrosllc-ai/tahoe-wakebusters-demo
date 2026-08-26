import { marketplaceLog } from "@/lib/integrations/marketplaces/log";
import { processGmailMarketplaceMessage } from "@/lib/integrations/marketplaces/process-message";
import { backfillZeroDollarMarketplacePayouts } from "@/lib/integrations/marketplaces/booking-service";
import {
  operationalAlertDedupeDocId,
  writeOperationalAlert,
  writeOperationalAlertIfNewDocId,
} from "@/lib/booking/operational-alerts";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { GMAIL_RETRY_COLLECTION, MARKETPLACE_GMAIL_QUERIES } from "./constants";
import {
  collectHistoryMessageIds,
  gmailGetMessage,
  gmailGetProfile,
  gmailListHistory,
  gmailSearchMessages,
  isStaleHistoryError,
} from "./client";
import { getGmailAccessToken } from "./token-store";
import { loadGmailWatchState, patchGmailWatchState } from "./watch";
import type { GmailPushNotification } from "./pubsub";

const SEARCH_PAGE_SIZE = 100;
const SEARCH_IDS_PER_PROVIDER_CAP = 500;
const MAX_GMAIL_RETRY_ATTEMPTS = 5;

type MessageProcessCounts = {
  processed: number;
  skipped: number;
  failed: number;
  parseFailed: number;
  unmapped: number;
};

function emptyCounts(): MessageProcessCounts {
  return { processed: 0, skipped: 0, failed: 0, parseFailed: 0, unmapped: 0 };
}

function addCounts(target: MessageProcessCounts, extra: MessageProcessCounts): void {
  target.processed += extra.processed;
  target.skipped += extra.skipped;
  target.failed += extra.failed;
  target.parseFailed += extra.parseFailed;
  target.unmapped += extra.unmapped;
}

async function emitGmailRetryDeadLetterAlert(
  messageId: string,
  error: string,
  attempts: number
): Promise<void> {
  const docId = operationalAlertDedupeDocId(["gmail_retry_dead_letter", messageId]);
  await writeOperationalAlertIfNewDocId(docId, {
    type: "gmail_retry_dead_letter",
    source: "gmail-retry-queue",
    messageId,
    error,
    attempts,
  });
}

async function markGmailRetryDeadLetter(messageId: string, error: string, attempts: number): Promise<void> {
  const { Timestamp } = getFirestoreExports();
  await getDb().collection(GMAIL_RETRY_COLLECTION).doc(messageId).set(
    {
      status: "dead_letter",
      error,
      attempts,
      deadLetteredAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
  await emitGmailRetryDeadLetterAlert(messageId, error, attempts);
}

async function loadGmailRetryQueue(): Promise<{ retryIds: string[]; deadLetteredIds: Set<string> }> {
  const snap = await getDb().collection(GMAIL_RETRY_COLLECTION).limit(100).get();
  const retryIds: string[] = [];
  const deadLetteredIds = new Set<string>();
  for (const d of snap.docs) {
    const data = (d.data() ?? {}) as { status?: string; attempts?: number; error?: string };
    const attempts = typeof data.attempts === "number" ? data.attempts : 0;
    if (data.status === "dead_letter") {
      deadLetteredIds.add(d.id);
      continue;
    }
    if (attempts >= MAX_GMAIL_RETRY_ATTEMPTS) {
      await markGmailRetryDeadLetter(
        d.id,
        typeof data.error === "string" ? data.error : "max retry attempts exceeded",
        attempts
      );
      deadLetteredIds.add(d.id);
      continue;
    }
    retryIds.push(d.id);
  }
  return { retryIds, deadLetteredIds };
}

async function enqueueGmailRetry(
  messageId: string,
  error: string
): Promise<{ attempts: number; deadLettered: boolean; newlyDeadLettered: boolean }> {
  const { Timestamp } = getFirestoreExports();
  const ref = getDb().collection(GMAIL_RETRY_COLLECTION).doc(messageId);
  return getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.data() as { attempts?: number; status?: string } | undefined;
    const prevAttempts = typeof prev?.attempts === "number" ? prev.attempts : 0;
    const alreadyDeadLettered = prev?.status === "dead_letter";
    const attempts = prevAttempts + 1;
    const deadLettered = alreadyDeadLettered || attempts >= MAX_GMAIL_RETRY_ATTEMPTS;
    const newlyDeadLettered = deadLettered && !alreadyDeadLettered;
    const payload: Record<string, unknown> = {
      error,
      failedAtMs: Date.now(),
      updatedAt: Timestamp.now(),
      attempts,
      status: deadLettered ? "dead_letter" : "pending",
    };
    if (newlyDeadLettered) {
      payload.deadLetteredAt = Timestamp.now();
    }
    tx.set(ref, payload, { merge: true });
    return { attempts, deadLettered, newlyDeadLettered };
  });
}

async function dequeueGmailRetry(messageId: string): Promise<void> {
  await getDb().collection(GMAIL_RETRY_COLLECTION).doc(messageId).delete().catch(() => {});
}

async function processMessageIds(
  accessToken: string,
  ids: string[],
  options?: { force?: boolean }
): Promise<MessageProcessCounts> {
  const counts = emptyCounts();
  for (const id of ids) {
    try {
      const message = await gmailGetMessage(accessToken, id);
      const result = await processGmailMarketplaceMessage(message, { force: options?.force === true });
      if (result.reason === "in_flight") {
        counts.failed++;
      } else if (result.status === "sync_failed") {
        const error = result.reason || "sync_failed";
        try {
          const queued = await enqueueGmailRetry(id, error);
          if (queued.newlyDeadLettered) {
            await emitGmailRetryDeadLetterAlert(id, error, queued.attempts);
          }
          if (!queued.deadLettered) {
            counts.failed++;
          }
        } catch {
          counts.failed++;
        }
      } else if (result.skipped) {
        counts.skipped++;
        const intentionallyIgnored =
          result.status === "ignored" || result.reason === "unsupported_sender";
        const alreadyProcessed = result.reason === "duplicate_gmail_message";
        if (intentionallyIgnored || alreadyProcessed) {
          await dequeueGmailRetry(id);
        }
      } else if (result.status === "parse_failed") {
        counts.parseFailed++;
        await dequeueGmailRetry(id);
      } else if (result.status === "unmapped") {
        counts.unmapped++;
        await dequeueGmailRetry(id);
      } else {
        counts.processed++;
        await dequeueGmailRetry(id);
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      try {
        const queued = await enqueueGmailRetry(id, error);
        if (queued.newlyDeadLettered) {
          await emitGmailRetryDeadLetterAlert(id, error, queued.attempts);
        }
        if (!queued.deadLettered) {
          counts.failed++;
        }
      } catch {
        counts.failed++;
      }
    }
  }
  return counts;
}

async function signalPartialFailure(
  source: "gmail-history" | "gmail-search",
  counts: MessageProcessCounts,
  extra?: Record<string, unknown>
): Promise<void> {
  marketplaceLog("gmail_sync_partial_failure", {
    source,
    failed: counts.failed,
    processed: counts.processed,
    skipped: counts.skipped,
    parseFailed: counts.parseFailed,
    unmapped: counts.unmapped,
    ...extra,
  });
  await writeOperationalAlert({
    type: "gmail_sync_partial_failure",
    source,
    failed: counts.failed,
    processed: counts.processed,
    skipped: counts.skipped,
    parseFailed: counts.parseFailed,
    unmapped: counts.unmapped,
    ...extra,
  });
}

export async function processGmailHistoryNotification(notification: GmailPushNotification): Promise<{
  processed: number;
  skipped: number;
  failed: number;
  parseFailed: number;
  unmapped: number;
  recoveredFromSearch: boolean;
}> {
  marketplaceLog("gmail_notification_received", { historyId: notification.historyId });
  const accessToken = await getGmailAccessToken();
  const state = await loadGmailWatchState();
  const startHistoryId = state?.historyId || notification.historyId;
  if (!startHistoryId) {
    return { processed: 0, skipped: 0, failed: 0, parseFailed: 0, unmapped: 0, recoveredFromSearch: false };
  }

  const counts = emptyCounts();
  let recoveredFromSearch = false;
  let latestHistoryId = notification.historyId || startHistoryId;

  try {
    let pageToken: string | undefined;
    const ids: string[] = [];
    do {
      const page = await gmailListHistory(accessToken, startHistoryId, pageToken);
      ids.push(...collectHistoryMessageIds(page));
      if (page.historyId) latestHistoryId = page.historyId;
      pageToken = page.nextPageToken;
    } while (pageToken);

    const { retryIds, deadLetteredIds } = await loadGmailRetryQueue();
    const ordered = [...retryIds];
    const seen = new Set(ordered);
    for (const id of ids) {
      if (deadLetteredIds.has(id) || seen.has(id)) continue;
      seen.add(id);
      ordered.push(id);
    }
    addCounts(counts, await processMessageIds(accessToken, ordered));
  } catch (err) {
    if (isStaleHistoryError(err)) {
      recoveredFromSearch = true;
      const recovered = await syncRecentMarketplaceEmails(7);
      addCounts(counts, {
        processed: recovered.processed,
        skipped: recovered.skipped,
        failed: recovered.failed,
        parseFailed: recovered.parseFailed,
        unmapped: recovered.unmapped,
      });
      if (counts.failed === 0) {
        const profile = await gmailGetProfile(accessToken);
        if (profile.historyId) latestHistoryId = profile.historyId;
      }
    } else {
      throw err;
    }
  }

  const watchPatch: { historyId?: string; lastNotificationAtMs: number; lastSuccessfulSyncAtMs?: number; lastGmailEventProcessedAtMs?: number } = {
    lastNotificationAtMs: Date.now(),
  };
  if (counts.failed === 0) {
    watchPatch.historyId = latestHistoryId;
    watchPatch.lastSuccessfulSyncAtMs = Date.now();
    watchPatch.lastGmailEventProcessedAtMs = Date.now();
  } else if (!recoveredFromSearch) {
    await signalPartialFailure("gmail-history", counts, { historyId: startHistoryId });
  }
  await patchGmailWatchState(watchPatch);
  return { ...counts, recoveredFromSearch };
}

export async function syncRecentMarketplaceEmails(
  days: number,
  options?: { force?: boolean }
): Promise<{
  processed: number;
  skipped: number;
  failed: number;
  parseFailed: number;
  unmapped: number;
  deadLettered: number;
  messageIds: string[];
  payoutsFilled: number;
}> {
  const accessToken = await getGmailAccessToken();
  const after = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
  const queries = [
    `${MARKETPLACE_GMAIL_QUERIES.boatsetter} after:${after}`,
    `${MARKETPLACE_GMAIL_QUERIES.viator} after:${after}`,
    `${MARKETPLACE_GMAIL_QUERIES.getmyboat} after:${after}`,
  ];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const q of queries) {
    let pageToken: string | undefined;
    let providerCount = 0;
    do {
      const listed = await gmailSearchMessages(accessToken, q, SEARCH_PAGE_SIZE, pageToken);
      for (const m of listed.messages ?? []) {
        if (providerCount >= SEARCH_IDS_PER_PROVIDER_CAP) break;
        if (!seen.has(m.id)) {
          seen.add(m.id);
          ids.push(m.id);
          providerCount++;
        }
      }
      if (providerCount >= SEARCH_IDS_PER_PROVIDER_CAP) break;
      pageToken = listed.nextPageToken;
    } while (pageToken);
  }
  const force = options?.force === true;
  const { retryIds, deadLetteredIds } = await loadGmailRetryQueue();
  // Forced manual pulls reprocess dead-lettered ids; success dequeues the retry
  // doc and thereby resets their attempt counters.
  const deadLettered = force ? 0 : ids.filter((id) => deadLetteredIds.has(id)).length;
  const processIds = force ? [...ids] : ids.filter((id) => !deadLetteredIds.has(id));
  for (const id of retryIds) {
    if (!seen.has(id)) {
      seen.add(id);
      processIds.push(id);
    }
  }
  // Gmail messages.list returns newest-first; reverse so older events apply before later modifications/cancels.
  processIds.reverse();
  const counts = await processMessageIds(accessToken, processIds, { force });
  if (counts.failed === 0) {
    await patchGmailWatchState({ lastSuccessfulSyncAtMs: Date.now() });
  } else {
    await signalPartialFailure("gmail-search", counts, { days });
  }
  let payoutsFilled = 0;
  try {
    const filled = await backfillZeroDollarMarketplacePayouts();
    payoutsFilled = filled.updated;
  } catch {
    payoutsFilled = 0;
  }
  return { ...counts, deadLettered, messageIds: processIds, payoutsFilled };
}
