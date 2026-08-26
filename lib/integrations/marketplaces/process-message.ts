import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { GMAIL_PROCESSED_COLLECTION, MARKETPLACE_EVENTS_COLLECTION } from "@/lib/integrations/gmail/constants";
import { extractEmailAddress, extractGmailBodies, getGmailHeader, type GmailPayloadLike } from "@/lib/integrations/gmail/mime";
import type { GmailMessage } from "@/lib/integrations/gmail/client";
import { detectMarketplaceProvider } from "./detector";
import { marketplaceLog } from "./log";
import { parseMarketplaceMessage } from "./parse-message";
import { applyExternalBookingEvent } from "./booking-service";
import { listingIdentityForEvent } from "./mapping";
import type { ExternalBookingEvent, GmailMessageInput, MarketplaceParseStatus } from "./types";

export type ProcessMessageResult = {
  skipped?: boolean;
  reason?: string;
  provider?: string;
  eventType?: string;
  externalBookingId?: string;
  bookingId?: string;
  action?: string;
  status?: MarketplaceParseStatus | "success" | "sync_failed";
};

export function gmailMessageToInput(message: GmailMessage): GmailMessageInput {
  const payload = message.payload as GmailPayloadLike | undefined;
  const bodies = extractGmailBodies(payload);
  const from = getGmailHeader(payload, "From");
  return {
    id: message.id,
    threadId: message.threadId,
    from,
    fromEmail: extractEmailAddress(from),
    subject: getGmailHeader(payload, "Subject"),
    snippet: message.snippet,
    text: bodies.text,
    html: bodies.html,
    labels: message.labelIds,
  };
}

export const STALE_GMAIL_CLAIM_MS = 5 * 60 * 1000;

function timestampToMs(value: unknown): number | null {
  if (value == null || typeof value !== "object") return null;
  const v = value as { toMillis?: () => number; toDate?: () => Date; seconds?: number };
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.toDate === "function") return v.toDate().getTime();
  if (typeof v.seconds === "number") return v.seconds * 1000;
  return null;
}

export function isStaleProcessingClaim(
  data: { status?: string; processedAt?: unknown } | undefined,
  nowMs = Date.now()
): boolean {
  if (data?.status !== "processing") return false;
  const at = timestampToMs(data.processedAt);
  if (at == null) return true;
  return nowMs - at >= STALE_GMAIL_CLAIM_MS;
}

export type GmailClaimResult = "claimed" | "in_flight" | "already_processed";

export async function claimGmailMessage(messageId: string, force = false): Promise<boolean> {
  const result = await claimGmailMessageState(messageId, force);
  return result === "claimed";
}

export async function claimGmailMessageState(messageId: string, force = false): Promise<GmailClaimResult> {
  const db = getDb();
  const { Timestamp } = getFirestoreExports();
  const ref = db.collection(GMAIL_PROCESSED_COLLECTION).doc(messageId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && !force) {
      const data = snap.data() as { status?: string; processedAt?: unknown };
      const reclaimable = data.status === "sync_failed" || isStaleProcessingClaim(data);
      if (!reclaimable) {
        return data.status === "processing" ? "in_flight" : "already_processed";
      }
    }
    tx.set(ref, { processedAt: Timestamp.now(), status: "processing" });
    return "claimed";
  });
}

function omitUndefined<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as T;
}

function snapshotFromEvent(event: ExternalBookingEvent) {
  return {
    listingName: event.externalListingName,
    customerName: event.customerName,
    startAt: event.startAt?.toISOString(),
    endAt: event.endAt?.toISOString(),
    durationHours: event.durationHours,
    passengerCount: event.passengerCount,
    totalCents: event.totalCents,
    details: event.details && Object.keys(event.details).length > 0 ? event.details : undefined,
    emailExcerpt: event.emailExcerpt,
  };
}

export async function recordMarketplaceEvent(input: {
  provider?: string;
  eventType?: string;
  externalBookingId?: string;
  gmailMessageId: string;
  threadId?: string;
  status: string;
  detail?: string;
  bookingId?: string;
  listingName?: string;
  subject?: string;
  customerName?: string;
  startAt?: string;
  endAt?: string;
  durationHours?: number;
  passengerCount?: number;
  totalCents?: number;
  details?: Record<string, string>;
  emailExcerpt?: string;
}, eventDocId?: string): Promise<string> {
  const db = getDb();
  const { Timestamp } = getFirestoreExports();
  const ref = eventDocId
    ? db.collection(MARKETPLACE_EVENTS_COLLECTION).doc(eventDocId)
    : db.collection(MARKETPLACE_EVENTS_COLLECTION).doc();
  await ref.set(
    omitUndefined({
      ...input,
      ...(eventDocId ? { updatedAt: Timestamp.now() } : { createdAt: Timestamp.now() }),
    }),
    eventDocId ? { merge: true } : {}
  );
  return ref.id;
}

export async function processGmailMarketplaceMessage(
  message: GmailMessage,
  options?: { force?: boolean; eventDocId?: string }
): Promise<ProcessMessageResult> {
  const claimed = await claimGmailMessageState(message.id, options?.force === true);
  if (claimed !== "claimed") {
    return {
      skipped: true,
      reason: claimed === "in_flight" ? "in_flight" : "duplicate_gmail_message",
      status: "success",
    };
  }
  const input = gmailMessageToInput(message);
  const detected = detectMarketplaceProvider(input);
  if (!detected.provider) {
    await getDb().collection(GMAIL_PROCESSED_COLLECTION).doc(message.id).set({ status: "ignored", reason: "unsupported_sender" }, { merge: true });
    return { skipped: true, reason: "unsupported_sender", status: "unsupported_sender" };
  }
  marketplaceLog("marketplace_email_detected", {
    provider: detected.provider,
    gmailMessageId: message.id,
  });
  const parsed = parseMarketplaceMessage(input);
  if (!parsed.ok) {
    const ignored = parsed.status === "ignored";
    if (!ignored) {
      marketplaceLog("marketplace_parse_failed", {
        provider: detected.provider,
        gmailMessageId: message.id,
        error: parsed.error,
      });
      await recordMarketplaceEvent({
        provider: detected.provider,
        gmailMessageId: message.id,
        threadId: message.threadId,
        status: parsed.status,
        detail: parsed.error,
        subject: input.subject,
        externalBookingId: parsed.externalBookingId,
      }, options?.eventDocId);
    }
    await getDb().collection(GMAIL_PROCESSED_COLLECTION).doc(message.id).set({ status: parsed.status, error: parsed.error }, { merge: true });
    return { provider: detected.provider, skipped: ignored, status: parsed.status, reason: parsed.error };
  }
  const event: ExternalBookingEvent = parsed.event;
  if (event.eventType === "informational") {
    const result = await applyExternalBookingEvent(event);
    if (result.action === "update_pricing") {
      await recordMarketplaceEvent({
        provider: event.provider,
        eventType: event.eventType,
        externalBookingId: event.externalBookingId,
        gmailMessageId: message.id,
        threadId: message.threadId,
        status: "success",
        detail: "update_pricing",
        bookingId: result.bookingId,
        subject: input.subject,
        ...snapshotFromEvent(event),
        listingName: event.externalListingName,
      }, options?.eventDocId);
      await getDb().collection(GMAIL_PROCESSED_COLLECTION).doc(message.id).set(
        {
          status: "success",
          action: "update_pricing",
          bookingId: result.bookingId ?? null,
          provider: event.provider,
          externalBookingId: event.externalBookingId,
        },
        { merge: true }
      );
      return {
        provider: event.provider,
        eventType: event.eventType,
        externalBookingId: event.externalBookingId,
        bookingId: result.bookingId,
        action: "update_pricing",
        status: "success",
      };
    }
    await getDb().collection(GMAIL_PROCESSED_COLLECTION).doc(message.id).set(
      { status: "ignored", reason: "reminder_or_secondary_email", provider: event.provider },
      { merge: true }
    );
    return {
      skipped: true,
      provider: event.provider,
      eventType: event.eventType,
      externalBookingId: event.externalBookingId,
      status: "ignored",
      reason: "reminder_or_secondary_email",
    };
  }
  try {
    const result = await applyExternalBookingEvent(event);
    const identity = listingIdentityForEvent(event);
    const status =
      result.action === "needs_mapping"
        ? "unmapped"
        : result.action === "needs_review" || result.action === "not_found"
          ? "needs_review"
          : result.action === "informational" || result.action === "ignore"
            ? "ignored"
            : result.error
              ? "parse_failed"
              : "success";
    await recordMarketplaceEvent({
      provider: event.provider,
      eventType: event.eventType,
      externalBookingId: event.externalBookingId,
      gmailMessageId: message.id,
      threadId: message.threadId,
      status,
      detail: result.error || result.action,
      bookingId: result.bookingId,
      subject: input.subject,
      ...snapshotFromEvent(event),
      listingName: event.externalListingName || identity?.matchValue,
    }, options?.eventDocId);
    await getDb().collection(GMAIL_PROCESSED_COLLECTION).doc(message.id).set(
      {
        status,
        action: result.action,
        bookingId: result.bookingId ?? null,
        provider: event.provider,
        externalBookingId: event.externalBookingId,
      },
      { merge: true }
    );
    return {
      provider: event.provider,
      eventType: event.eventType,
      externalBookingId: event.externalBookingId,
      bookingId: result.bookingId,
      action: result.action,
      status,
      reason: result.error,
    };
  } catch (err) {
    const messageText = err instanceof Error ? err.message : String(err);
    marketplaceLog("marketplace_sync_failed", {
      provider: event.provider,
      externalBookingId: event.externalBookingId,
      gmailMessageId: message.id,
    });
    await recordMarketplaceEvent({
      provider: event.provider,
      eventType: event.eventType,
      externalBookingId: event.externalBookingId,
      gmailMessageId: message.id,
      threadId: message.threadId,
      status: "sync_failed",
      detail: messageText,
      subject: input.subject,
      ...snapshotFromEvent(event),
      listingName: event.externalListingName,
    }, options?.eventDocId);
    await getDb().collection(GMAIL_PROCESSED_COLLECTION).doc(message.id).set({ status: "sync_failed", error: messageText }, { merge: true });
    return { provider: event.provider, status: "sync_failed", reason: messageText, externalBookingId: event.externalBookingId };
  }
}
