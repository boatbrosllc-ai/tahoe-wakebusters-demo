import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { marketplaceLog } from "@/lib/integrations/marketplaces/log";
import { GMAIL_ACCOUNT_EMAIL, GMAIL_INTEGRATION_COLLECTION, GMAIL_WATCH_DOC, GMAIL_WATCH_TOPIC } from "./constants";
import { gmailUsersWatch } from "./client";
import { getGmailAccessToken } from "./token-store";
import { shouldRenewGmailWatch } from "./watch-logic";

export { shouldRenewGmailWatch } from "./watch-logic";

export type GmailWatchState = {
  historyId?: string;
  expirationMs?: number;
  lastRenewedAtMs?: number;
  lastNotificationAtMs?: number;
  lastSuccessfulSyncAtMs?: number;
  lastGmailEventProcessedAtMs?: number;
  topicName?: string;
  emailAddress?: string;
};

function watchRef() {
  return getDb().collection(GMAIL_INTEGRATION_COLLECTION).doc(GMAIL_WATCH_DOC);
}

export async function loadGmailWatchState(): Promise<GmailWatchState | null> {
  const snap = await watchRef().get();
  if (!snap.exists) return null;
  return snap.data() as GmailWatchState;
}

export async function patchGmailWatchState(patch: Partial<GmailWatchState>): Promise<void> {
  const { Timestamp } = getFirestoreExports();
  await watchRef().set({ ...patch, updatedAt: Timestamp.now() }, { merge: true });
}

export async function startOrRenewGmailWatch(): Promise<GmailWatchState> {
  const accessToken = await getGmailAccessToken();
  const result = await gmailUsersWatch(accessToken, GMAIL_WATCH_TOPIC);
  const expirationMs = result.expiration ? Number(result.expiration) : Date.now() + 7 * 24 * 60 * 60 * 1000;
  const state: GmailWatchState = {
    historyId: result.historyId,
    expirationMs,
    lastRenewedAtMs: Date.now(),
    topicName: GMAIL_WATCH_TOPIC,
    emailAddress: GMAIL_ACCOUNT_EMAIL,
  };
  const existing = await loadGmailWatchState();
  if (!existing?.historyId && result.historyId) {
    state.historyId = result.historyId;
  } else if (existing?.historyId) {
    // Keep the older historyId so we do not skip messages between watches.
    state.historyId = existing.historyId;
  }
  await patchGmailWatchState(state);
  marketplaceLog(existing?.expirationMs ? "gmail_watch_renewed" : "gmail_watch_started", {
    expirationMs,
    historyId: state.historyId,
  });
  return { ...existing, ...state };
}

export async function renewGmailWatchIfNeeded(): Promise<{ renewed: boolean; state: GmailWatchState }> {
  const existing = await loadGmailWatchState();
  if (!shouldRenewGmailWatch(existing?.expirationMs, Date.now())) {
    return { renewed: false, state: existing ?? {} };
  }
  const state = await startOrRenewGmailWatch();
  return { renewed: true, state };
}
