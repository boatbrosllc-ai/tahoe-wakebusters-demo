/**
 * Waiver Firestore helpers — server-only.
 * Uses getDb() and getFirestoreExports() from lib/booking/firebase-admin.
 */

import "server-only";
import { bookingEnv } from "@/lib/booking/env";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import {
  generateSigningToken,
  generateGroupToken,
  createTokenExpiresAt,
  isTokenExpired,
  getDefaultTokenExpiryDays,
} from "./tokens";
import type {
  WaiverTemplate,
  WaiverTemplateSnapshot,
  WaiverRequest,
  WaiverRequestStatus,
  WaiverSigningToken,
  WaiverSent,
  WaiverSigned,
  WaiverSignedPayload,
  WaiverRequiredFields,
  WaiverClause,
  WaiverSignatureConfig,
  WaiverManualReview,
  FirestoreTimestamp,
  BookingWaiverPointer,
  BookingWaiverPointerStatus,
} from "./types";
import type { CreateWaiverTemplateInput } from "./schema";

const COLL = {
  templates: "waiverTemplates",
  requests: "waiverRequests",
  tokens: "waiverSigningTokens",
  groupTokens: "waiverGroupTokens",
  bookings: "bookings",
} as const;

/**
 * Public base URL for waiver links (matches booking emails / Stripe — uses {@link bookingEnv.appBaseUrl}).
 */
export function getAppBaseUrl(): string {
  return bookingEnv.appBaseUrl.replace(/\/$/, "");
}

/** Prefer this for outbound email/SMS so links stay valid if `signingUrl` on the request was built with a stale host. */
export function buildWaiverSigningUrlFromTokenId(tokenId: string): string {
  const id = typeof tokenId === "string" ? tokenId.trim() : "";
  if (!id) return "";
  const baseUrl = getAppBaseUrl();
  return `${baseUrl}/waiver/sign?token=${encodeURIComponent(id)}`;
}

/** When `groupSigningUrl` was not denormalized on the request (older bookings), resolve from `waiverGroupTokens`. */
export async function getActiveGroupSigningUrlForBooking(bookingId: string): Promise<string | null> {
  const id = typeof bookingId === "string" ? bookingId.trim() : "";
  if (!id) return null;
  const db = getDb();
  const snap = await db.collection(COLL.groupTokens).where("bookingId", "==", id).limit(10).get();
  if (snap.empty) return null;
  const nowMs = Date.now();
  const baseUrl = getAppBaseUrl();
  for (const d of snap.docs) {
    const data = d.data() as WaiverGroupTokenDoc;
    const expAt = data.expiresAt as { toDate?: () => Date; seconds?: number };
    const expDate = typeof expAt?.toDate === "function" ? expAt.toDate() : new Date((expAt?.seconds ?? 0) * 1000);
    if (expDate.getTime() > nowMs) {
      return `${baseUrl}/waiver/sign?group=${encodeURIComponent(d.id)}`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export async function getTemplateById(templateId: string): Promise<WaiverTemplate | null> {
  const db = getDb();
  const doc = await db.collection(COLL.templates).doc(templateId).get();
  if (!doc.exists) return null;
  return doc.data() as WaiverTemplate;
}

export async function listTemplates(): Promise<(WaiverTemplate & { id: string })[]> {
  const db = getDb();
  const snap = await db.collection(COLL.templates).orderBy("createdAt", "desc").get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as WaiverTemplate) }));
}

export async function createTemplate(
  input: CreateWaiverTemplateInput
): Promise<string> {
  const db = getDb();
  const { Timestamp } = getFirestoreExports();
  const now = Timestamp.now();
  const doc: Omit<WaiverTemplate, "createdAt" | "updatedAt"> & {
    createdAt: import("firebase-admin").firestore.Timestamp;
    updatedAt: import("firebase-admin").firestore.Timestamp;
  } = {
    title: input.title,
    description: input.description ?? "",
    isActive: input.isActive ?? true,
    termsHtml: input.termsHtml ?? "",
    requiredFields: input.requiredFields ?? {
      dob: true,
      phone: true,
      address: false,
      bookingDate: true,
    },
    clauses: input.clauses ?? [],
    signature: input.signature ?? { mode: "both", requireTypedName: true },
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...(input.welcomeHeading !== undefined && { welcomeHeading: input.welcomeHeading }),
    ...(input.welcomeSubheading !== undefined && { welcomeSubheading: input.welcomeSubheading }),
    ...(input.pageHeadings !== undefined && { pageHeadings: input.pageHeadings }),
    ...(input.dobMinAge !== undefined && { dobMinAge: input.dobMinAge }),
    ...(input.dobMaxAge !== undefined && { dobMaxAge: input.dobMaxAge }),
    ...(input.minorAge !== undefined && { minorAge: input.minorAge }),
    ...(input.includeInConfirmationEmail !== undefined && { includeInConfirmationEmail: input.includeInConfirmationEmail }),
    ...(input.sendSeparateWaiverInvite !== undefined && { sendSeparateWaiverInvite: input.sendSeparateWaiverInvite }),
    ...(input.sendWaiverReminder !== undefined && { sendWaiverReminder: input.sendWaiverReminder }),
  };
  const ref = await db.collection(COLL.templates).add(doc);
  return ref.id;
}

export async function updateTemplate(
  templateId: string,
  updates: Partial<CreateWaiverTemplateInput>
): Promise<void> {
  const db = getDb();
  const ref = db.collection(COLL.templates).doc(templateId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Template not found");
  const existing = snap.data() as WaiverTemplate;
  const { Timestamp } = getFirestoreExports();
  const now = Timestamp.now();
  const nextVersion = (existing.version ?? 1) + 1;
  const updateData: Record<string, unknown> = {
    updatedAt: now,
    version: nextVersion,
  };
  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.isActive !== undefined) updateData.isActive = updates.isActive;
  if (updates.termsHtml !== undefined) updateData.termsHtml = updates.termsHtml;
  if (updates.requiredFields !== undefined) updateData.requiredFields = updates.requiredFields;
  if (updates.clauses !== undefined) updateData.clauses = updates.clauses;
  if (updates.signature !== undefined) updateData.signature = updates.signature;
  if (updates.welcomeHeading !== undefined) updateData.welcomeHeading = updates.welcomeHeading;
  if (updates.welcomeSubheading !== undefined) updateData.welcomeSubheading = updates.welcomeSubheading;
  if (updates.pageHeadings !== undefined) updateData.pageHeadings = updates.pageHeadings;
  if (updates.dobMinAge !== undefined) updateData.dobMinAge = updates.dobMinAge;
  if (updates.dobMaxAge !== undefined) updateData.dobMaxAge = updates.dobMaxAge;
  if (updates.minorAge !== undefined) updateData.minorAge = updates.minorAge;
  if (updates.includeInConfirmationEmail !== undefined) updateData.includeInConfirmationEmail = updates.includeInConfirmationEmail;
  if (updates.sendSeparateWaiverInvite !== undefined) updateData.sendSeparateWaiverInvite = updates.sendSeparateWaiverInvite;
  if (updates.sendWaiverReminder !== undefined) updateData.sendWaiverReminder = updates.sendWaiverReminder;
  await ref.update(updateData);
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export async function getRequestById(
  requestId: string
): Promise<(WaiverRequest & { id: string }) | null> {
  const db = getDb();
  const doc = await db.collection(COLL.requests).doc(requestId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...(doc.data() as WaiverRequest) };
}

export interface CreateWaiverRequestInput {
  bookingId: string;
  templateId: string;
  templateVersion: number;
  templateSnapshot: WaiverTemplateSnapshot;
  signerEmail?: string;
}

export async function createRequest(
  input: CreateWaiverRequestInput
): Promise<{ requestId: string; tokenId: string; signingUrl: string }> {
  const db = getDb();
  const { Timestamp } = getFirestoreExports();
  const tokenId = generateSigningToken();
  const expiresAt = createTokenExpiresAt(getDefaultTokenExpiryDays());
  const baseUrl = getAppBaseUrl();
  const signingUrl = `${baseUrl}/waiver/sign?token=${encodeURIComponent(tokenId)}`;

  const requestId = db.collection(COLL.requests).doc().id;

  const request: Omit<WaiverRequest, "createdAt"> & {
    createdAt: import("firebase-admin").firestore.Timestamp;
  } = {
    bookingId: input.bookingId,
    templateId: input.templateId,
    templateVersion: input.templateVersion,
    templateSnapshot: input.templateSnapshot,
    status: "pending",
    signingTokenId: tokenId,
    signingUrl,
    ...(input.signerEmail ? { signerEmail: input.signerEmail.trim() } : {}),
    sent: {
      initialSentAt: null,
      lastSentAt: null,
      reminder1SentAt: null,
    },
    createdAt: Timestamp.now(),
  };

  await db.runTransaction(async (tx) => {
    tx.set(db.collection(COLL.requests).doc(requestId), request);
    tx.set(db.collection(COLL.tokens).doc(tokenId), {
      waiverRequestId: requestId,
      bookingId: input.bookingId,
      expiresAt: Timestamp.fromDate(expiresAt),
      usedAt: null,
      ...(input.signerEmail ? { signerEmail: input.signerEmail } : {}),
    });
  });

  return { requestId, tokenId, signingUrl };
}

/**
 * Same writes as {@link createRequest}, but participates in an existing Firestore transaction
 * (e.g. booking + waiver atomic with convert-hold-to-booking).
 */
export function createWaiverRequestAndTokenInTransaction(
  tx: import("firebase-admin/firestore").Transaction,
  db: import("firebase-admin/firestore").Firestore,
  input: CreateWaiverRequestInput
): { requestId: string; tokenId: string; signingUrl: string } {
  const { Timestamp } = getFirestoreExports();
  const tokenId = generateSigningToken();
  const expiresAt = createTokenExpiresAt(getDefaultTokenExpiryDays());
  const baseUrl = getAppBaseUrl();
  const signingUrl = `${baseUrl}/waiver/sign?token=${encodeURIComponent(tokenId)}`;
  const requestId = db.collection(COLL.requests).doc().id;
  const request: Omit<WaiverRequest, "createdAt"> & {
    createdAt: import("firebase-admin").firestore.Timestamp;
  } = {
    bookingId: input.bookingId,
    templateId: input.templateId,
    templateVersion: input.templateVersion,
    templateSnapshot: input.templateSnapshot,
    status: "pending",
    signingTokenId: tokenId,
    signingUrl,
    ...(input.signerEmail ? { signerEmail: input.signerEmail.trim() } : {}),
    sent: {
      initialSentAt: null,
      lastSentAt: null,
      reminder1SentAt: null,
    },
    createdAt: Timestamp.now(),
  };
  tx.set(db.collection(COLL.requests).doc(requestId), request);
  tx.set(db.collection(COLL.tokens).doc(tokenId), {
    waiverRequestId: requestId,
    bookingId: input.bookingId,
    expiresAt: Timestamp.fromDate(expiresAt),
    usedAt: null,
    ...(input.signerEmail ? { signerEmail: input.signerEmail } : {}),
  });
  return { requestId, tokenId, signingUrl };
}

/**
 * Same as {@link createGroupToken} but uses an existing transaction (atomic with booking + waiver request).
 */
export function createGroupTokenInTransaction(
  tx: import("firebase-admin/firestore").Transaction,
  db: import("firebase-admin/firestore").Firestore,
  bookingId: string,
  templateId: string,
  templateVersion: number,
  templateSnapshot: WaiverTemplateSnapshot,
  partySize: number,
  primaryWaiverRequestId: string
): { groupSigningUrl: string } {
  const { Timestamp } = getFirestoreExports();
  const groupToken = generateGroupToken();
  const expiresAt = createTokenExpiresAt(getDefaultTokenExpiryDays());
  const baseUrl = getAppBaseUrl();
  const groupSigningUrl = `${baseUrl}/waiver/sign?group=${encodeURIComponent(groupToken)}`;
  const doc: WaiverGroupTokenDoc & {
    createdAt: import("firebase-admin").firestore.Timestamp;
    expiresAt: import("firebase-admin").firestore.Timestamp;
  } = {
    bookingId,
    templateId,
    templateVersion,
    templateSnapshot,
    partySize,
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromDate(expiresAt),
  };
  tx.set(db.collection(COLL.groupTokens).doc(groupToken), doc);
  tx.update(db.collection(COLL.requests).doc(primaryWaiverRequestId), { groupSigningUrl });
  return { groupSigningUrl };
}

// ---------------------------------------------------------------------------
// Group signing (shareable link for additional party members)
// ---------------------------------------------------------------------------

export interface WaiverGroupTokenDoc {
  bookingId: string;
  templateId: string;
  templateVersion: number;
  templateSnapshot?: WaiverTemplateSnapshot;
  partySize: number;
  createdAt: FirestoreTimestamp;
  expiresAt: FirestoreTimestamp;
}

export async function createGroupToken(
  bookingId: string,
  templateId: string,
  templateVersion: number,
  templateSnapshot: WaiverTemplateSnapshot,
  partySize: number
): Promise<{ groupToken: string; groupSigningUrl: string }> {
  const db = getDb();
  const { Timestamp } = getFirestoreExports();
  const groupToken = generateGroupToken();
  const expiresAt = createTokenExpiresAt(getDefaultTokenExpiryDays());
  const baseUrl = getAppBaseUrl();
  const groupSigningUrl = `${baseUrl}/waiver/sign?group=${encodeURIComponent(groupToken)}`;

  const doc: WaiverGroupTokenDoc & { createdAt: import("firebase-admin").firestore.Timestamp; expiresAt: import("firebase-admin").firestore.Timestamp } = {
    bookingId,
    templateId,
    templateVersion,
    templateSnapshot,
    partySize,
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromDate(expiresAt),
  };
  await db.collection(COLL.groupTokens).doc(groupToken).set(doc);
  return { groupToken, groupSigningUrl };
}

export async function getGroupTokenById(
  groupToken: string
): Promise<(WaiverGroupTokenDoc & { id: string }) | null> {
  const db = getDb();
  const doc = await db.collection(COLL.groupTokens).doc(groupToken).get();
  if (!doc.exists) return null;
  const data = doc.data() as WaiverGroupTokenDoc;
  const expiresAt = data.expiresAt as { seconds?: number; toDate?: () => Date };
  const expDate = typeof expiresAt?.toDate === "function" ? expiresAt.toDate() : new Date((expiresAt?.seconds ?? 0) * 1000);
  if (expDate.getTime() <= Date.now()) return null;
  return { id: doc.id, ...data };
}

/** Create a waiver request for a group signer (no one-time token; will be marked signed on submit). */
export async function createRequestForGroupSigner(
  bookingId: string,
  templateId: string,
  templateVersion: number,
  templateSnapshot: WaiverTemplateSnapshot
): Promise<string> {
  const db = getDb();
  const { Timestamp } = getFirestoreExports();
  const requestId = db.collection(COLL.requests).doc().id;
  const request: Omit<WaiverRequest, "createdAt"> & {
    createdAt: import("firebase-admin").firestore.Timestamp;
  } = {
    bookingId,
    templateId,
    templateVersion,
    templateSnapshot,
    status: "pending",
    signingTokenId: "",
    signingUrl: "",
    sent: { initialSentAt: null, lastSentAt: null, reminder1SentAt: null },
    createdAt: Timestamp.now(),
  };
  await db.collection(COLL.requests).doc(requestId).set(request);
  return requestId;
}

const PENDING_SLOT_EXPIRY_HOURS = 1;

/**
 * Atomically allocate a signer slot for a group token: in one transaction, read the group doc,
 * count active signers (signed + non-expired pending), and create a new request only if under capacity.
 * New pending requests get pendingExpiresAt so stale ones can be excluded from capacity and cleaned up.
 * Returns the new request if allocated; null if invalid/expired group or at capacity.
 */
export async function allocateGroupSignerSlot(groupToken: string): Promise<{
  requestId: string;
  request: WaiverRequest & { id: string };
} | null> {
  const db = getDb();
  const { Timestamp } = getFirestoreExports();
  const groupRef = db.collection(COLL.groupTokens).doc(groupToken);
  const now = Timestamp.now();
  const nowMs = Date.now();
  const expiresAtPending = new Date(nowMs + PENDING_SLOT_EXPIRY_HOURS * 60 * 60 * 1000);

  let result: { requestId: string; request: WaiverRequest & { id: string } } | null = null;
  await db.runTransaction(async (tx) => {
    const groupSnap = await tx.get(groupRef);
    if (!groupSnap.exists) return;
    const groupData = groupSnap.data() as WaiverGroupTokenDoc;
    const expAt = groupData.expiresAt as { seconds?: number; toDate?: () => Date };
    const expDate = typeof expAt?.toDate === "function" ? expAt.toDate() : new Date((expAt?.seconds ?? 0) * 1000);
    if (expDate.getTime() <= nowMs) return;

    const requestsSnap = await tx.get(
      db.collection(COLL.requests).where("bookingId", "==", groupData.bookingId)
    );
    const activeCount = requestsSnap.docs.filter((d) => {
      const data = d.data() as WaiverRequest & { pendingExpiresAt?: { toDate?: () => Date; seconds?: number } };
      if (data.status === "signed") return true;
      if (data.status !== "pending") return false;
      const pe = data.pendingExpiresAt;
      if (pe == null) return true;
      const peDate = typeof pe?.toDate === "function" ? pe.toDate() : new Date((pe?.seconds ?? 0) * 1000);
      return peDate.getTime() > nowMs;
    }).length;

    if (activeCount >= groupData.partySize) return;

    const requestId = db.collection(COLL.requests).doc().id;
    const request: Omit<WaiverRequest, "createdAt"> & {
      createdAt: import("firebase-admin").firestore.Timestamp;
      pendingExpiresAt: import("firebase-admin").firestore.Timestamp;
    } = {
      bookingId: groupData.bookingId,
      templateId: groupData.templateId,
      templateVersion: groupData.templateVersion,
      templateSnapshot: groupData.templateSnapshot,
      status: "pending",
      signingTokenId: "",
      signingUrl: "",
      sent: { initialSentAt: null, lastSentAt: null, reminder1SentAt: null },
      createdAt: now,
      pendingExpiresAt: Timestamp.fromDate(expiresAtPending),
    };
    tx.set(db.collection(COLL.requests).doc(requestId), request);
    result = { requestId, request: { id: requestId, ...request } };
  });
  return result;
}

/**
 * Mark pending requests that have passed their pendingExpiresAt as expired so capacity is not permanently consumed.
 * Call from a cron or periodically; optionally limit to one booking.
 */
export async function expireStalePendingRequests(bookingId?: string): Promise<number> {
  const db = getDb();
  const { Timestamp } = getFirestoreExports();
  const now = Timestamp.now();
  const nowMs = now.toMillis();
  let query: import("firebase-admin").firestore.Query = db
    .collection(COLL.requests)
    .where("status", "==", "pending");
  if (bookingId) {
    query = query.where("bookingId", "==", bookingId);
  }
  const snap = await query.get();
  let expired = 0;
  const batch = db.batch();
  for (const doc of snap.docs) {
    const data = doc.data() as WaiverRequest & { pendingExpiresAt?: { toDate?: () => Date; seconds?: number } };
    const pe = data.pendingExpiresAt;
    if (pe == null) continue;
    const peDate = typeof pe?.toDate === "function" ? pe.toDate() : new Date((pe?.seconds ?? 0) * 1000);
    if (peDate.getTime() <= nowMs) {
      batch.update(doc.ref, { status: "expired" });
      expired += 1;
    }
  }
  if (expired > 0) await batch.commit();
  return expired;
}

export async function listRequestsByBookingId(
  bookingId: string
): Promise<(WaiverRequest & { id: string })[]> {
  const db = getDb();
  const snap = await db
    .collection(COLL.requests)
    .where("bookingId", "==", bookingId)
    .orderBy("createdAt", "asc")
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as WaiverRequest) }));
}

export async function updateRequest(
  requestId: string,
  updates: {
    status?: WaiverRequestStatus;
    sent?: Partial<WaiverSent>;
    signed?: WaiverSigned;
    requiresManualReview?: WaiverManualReview;
    signerName?: string;
    signerEmail?: string;
    signerPhone?: string;
    signerDob?: string;
    signingTokenId?: string;
    signingUrl?: string;
    groupSigningUrl?: string;
  }
): Promise<void> {
  const db = getDb();
  const { Timestamp } = getFirestoreExports();
  const ref = db.collection(COLL.requests).doc(requestId);
  const updateData: Record<string, unknown> = { ...updates };
  if (updates.sent) {
    updateData.sent = updates.sent;
  }
  if (updates.signed) {
    updateData.signed = updates.signed;
  }
  await ref.update(updateData);
}

export async function flagWaiverRequestForManualReview(
  requestId: string,
  review: Omit<WaiverManualReview, "at">
): Promise<void> {
  const db = getDb();
  const { Timestamp } = getFirestoreExports();
  await db.collection(COLL.requests).doc(requestId).update({
    requiresManualReview: { ...review, at: Timestamp.now() } satisfies WaiverManualReview,
  });
}

export async function updateRequestSigned(
  requestId: string,
  signed: WaiverSigned
): Promise<void> {
  const db = getDb();
  const ref = db.collection(COLL.requests).doc(requestId);
  // signedPayload may include optional signatureDataUrl; we do not persist it to avoid document size limit
  const { signedPayload, ...rest } = signed;
  const payloadForFirestore = { ...signedPayload };
  delete (payloadForFirestore as Record<string, unknown>).signatureDataUrl;
  await ref.update({
    status: "signed",
    signed: { ...rest, signedPayload: payloadForFirestore },
    signerName: signed.signedPayload.signerName,
    signerEmail: signed.signedPayload.signerEmail,
    signerPhone: signed.signedPayload.signerPhone,
    signerDob: signed.signedPayload.signerDob ?? null,
  });
}

export interface ListWaiverRequestsFilters {
  status?: WaiverRequestStatus;
  fromDate?: string; // YYYY-MM-DD
  toDate?: string;
  search?: string;
  limit?: number;
}

export async function listRequests(
  filters: ListWaiverRequestsFilters = {}
): Promise<(WaiverRequest & { id: string })[]> {
  const db = getDb();
  const { Timestamp } = getFirestoreExports();
  const limit = Math.min(filters.limit ?? 100, 500);
  const hasSearch = Boolean(filters.search?.trim());

  let q: FirebaseFirestore.Query = db.collection(COLL.requests);

  if (filters.status) {
    q = q.where("status", "==", filters.status);
  }

  if (filters.fromDate || filters.toDate) {
    const fromMs = filters.fromDate ? new Date(filters.fromDate + "T00:00:00.000Z").getTime() : 0;
    const toMs = filters.toDate
      ? new Date(filters.toDate + "T23:59:59.999Z").getTime()
      : Date.now() + 10 * 365 * 24 * 60 * 60 * 1000;
    q = q
      .where("createdAt", ">=", Timestamp.fromMillis(fromMs))
      .where("createdAt", "<=", Timestamp.fromMillis(toMs));
  }

  // When searching by name/email/bookingId, fetch up to 5× limit then filter (no Algolia/Typesense yet).
  q = q.orderBy("createdAt", "desc").limit(hasSearch ? Math.min(limit * 5, 500) : limit);

  const snap = await q.get();
  let docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as WaiverRequest) }));

  if (hasSearch) {
    const s = filters.search!.trim().toLowerCase();
    docs = docs.filter(
      (d) =>
        (d.signerName ?? "").toLowerCase().includes(s) ||
        (d.signerEmail ?? "").toLowerCase().includes(s) ||
        d.bookingId.toLowerCase().includes(s)
    );
    docs = docs.slice(0, limit);
  }

  return docs;
}

/** After commit, attach Storage paths to the signed waiver request (PDF and/or HTML). */
export async function appendWaiverSignedStoragePaths(
  requestId: string,
  paths: { pdfStoragePath?: string | null; htmlStoragePath?: string | null }
): Promise<void> {
  const db = getDb();
  const patch: Record<string, unknown> = {};
  if (paths.pdfStoragePath != null) patch["signed.pdfStoragePath"] = paths.pdfStoragePath;
  if (paths.htmlStoragePath != null) patch["signed.htmlStoragePath"] = paths.htmlStoragePath;
  if (Object.keys(patch).length === 0) return;
  await db.collection(COLL.requests).doc(requestId).update(patch);
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

export async function getTokenById(
  tokenId: string
): Promise<(WaiverSigningToken & { id: string }) | null> {
  const db = getDb();
  const doc = await db.collection(COLL.tokens).doc(tokenId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...(doc.data() as WaiverSigningToken) };
}

export async function markTokenUsed(tokenId: string): Promise<void> {
  const db = getDb();
  const { Timestamp } = getFirestoreExports();
  await db.collection(COLL.tokens).doc(tokenId).update({ usedAt: Timestamp.now() });
}

/**
 * Atomically validate and consume a single-use signing token in one transaction.
 * Reads the token and linked request, verifies unexpired/unused and pending state,
 * and writes usedAt in the same transaction so concurrent replays cannot double-use.
 * Returns the request data if consumed; null if invalid, expired, already used, or not pending.
 */
export async function consumeTokenIfValid(tokenId: string): Promise<{
  requestId: string;
  request: WaiverRequest & { id: string };
} | null> {
  const db = getDb();
  const { Timestamp } = getFirestoreExports();
  const tokenRef = db.collection(COLL.tokens).doc(tokenId);
  let result: { requestId: string; request: WaiverRequest & { id: string } } | null = null;
  await db.runTransaction(async (tx) => {
    const tokenSnap = await tx.get(tokenRef);
    if (!tokenSnap.exists) return;
    const tokenData = tokenSnap.data() as WaiverSigningToken;
    if (tokenData.usedAt != null) return;
    const expiresAt = tokenData.expiresAt as { seconds?: number; toDate?: () => Date };
    const expDate = typeof expiresAt?.toDate === "function" ? expiresAt.toDate() : new Date((expiresAt?.seconds ?? 0) * 1000);
    if (expDate.getTime() <= Date.now()) return;
    const requestId = tokenData.waiverRequestId;
    if (!requestId) return;
    const requestRef = db.collection(COLL.requests).doc(requestId);
    const requestSnap = await tx.get(requestRef);
    if (!requestSnap.exists) return;
    const requestData = requestSnap.data() as WaiverRequest;
    if (requestData.status !== "pending") return;
    tx.update(tokenRef, { usedAt: Timestamp.now() });
    result = { requestId, request: { id: requestSnap.id, ...requestData } };
  });
  return result;
}

/** Firestore fields for status signed + signer columns (matches updateRequestSigned). */
function waiverSignedFieldsForRequestUpdate(signed: WaiverSigned): Record<string, unknown> {
  const { signedPayload, ...rest } = signed;
  const payloadForFirestore = { ...signedPayload };
  delete (payloadForFirestore as Record<string, unknown>).signatureDataUrl;
  return {
    status: "signed" as const,
    signed: { ...rest, signedPayload: payloadForFirestore },
    ...(signed.requiresManualReview ? { requiresManualReview: signed.requiresManualReview } : {}),
    signerName: signed.signedPayload.signerName,
    signerEmail: signed.signedPayload.signerEmail,
    signerPhone: signed.signedPayload.signerPhone,
    signerDob: signed.signedPayload.signerDob ?? null,
  };
}

/**
 * Atomically mark token used and waiver request signed (single-use link path).
 * Call after PDF is stored; safe to retry whole submit if this fails (token not consumed).
 */
export async function commitSingleUseTokenWaiverSign(
  tokenId: string,
  signed: WaiverSigned,
  templateSnapshot?: WaiverTemplateSnapshot
): Promise<(WaiverRequest & { id: string }) | null> {
  const db = getDb();
  const { Timestamp } = getFirestoreExports();
  const tokenRef = db.collection(COLL.tokens).doc(tokenId);
  const signedFields = waiverSignedFieldsForRequestUpdate(signed);
  let out: (WaiverRequest & { id: string }) | null = null;
  await db.runTransaction(async (tx) => {
    const tokenSnap = await tx.get(tokenRef);
    if (!tokenSnap.exists) return;
    const tokenData = tokenSnap.data() as WaiverSigningToken;
    if (tokenData.usedAt != null) return;
    const expiresAt = tokenData.expiresAt as { seconds?: number; toDate?: () => Date };
    const expDate = typeof expiresAt?.toDate === "function" ? expiresAt.toDate() : new Date((expiresAt?.seconds ?? 0) * 1000);
    if (expDate.getTime() <= Date.now()) return;
    const requestId = tokenData.waiverRequestId;
    if (!requestId) return;
    const requestRef = db.collection(COLL.requests).doc(requestId);
    const requestSnap = await tx.get(requestRef);
    if (!requestSnap.exists) return;
    const requestData = requestSnap.data() as WaiverRequest;
    if (requestData.status !== "pending") return;
    tx.update(tokenRef, { usedAt: Timestamp.now() });
    tx.update(requestRef, {
      ...signedFields,
      ...(templateSnapshot ? { templateSnapshot } : {}),
    });
    out = { id: requestId, ...requestData, ...signedFields, ...(templateSnapshot ? { templateSnapshot } : {}) } as WaiverRequest & { id: string };
  });
  return out;
}

/**
 * Atomically allocates group signer capacity and creates the request doc already signed (group link path).
 * `requestId` must be the id used for the PDF path uploaded before this call.
 */
export async function commitGroupTokenNewSignedRequest(
  groupToken: string,
  requestId: string,
  signed: WaiverSigned,
  templateSnapshot?: WaiverTemplateSnapshot
): Promise<(WaiverRequest & { id: string }) | null> {
  const db = getDb();
  const { Timestamp } = getFirestoreExports();
  const groupRef = db.collection(COLL.groupTokens).doc(groupToken);
  const now = Timestamp.now();
  const nowMs = Date.now();
  const signedFields = waiverSignedFieldsForRequestUpdate(signed);
  let out: (WaiverRequest & { id: string }) | null = null;
  await db.runTransaction(async (tx) => {
    const groupSnap = await tx.get(groupRef);
    if (!groupSnap.exists) return;
    const groupData = groupSnap.data() as WaiverGroupTokenDoc;
    const expAt = groupData.expiresAt as { seconds?: number; toDate?: () => Date };
    const expDate = typeof expAt?.toDate === "function" ? expAt.toDate() : new Date((expAt?.seconds ?? 0) * 1000);
    if (expDate.getTime() <= nowMs) return;

    const requestsSnap = await tx.get(
      db.collection(COLL.requests).where("bookingId", "==", groupData.bookingId)
    );
    const activeCount = requestsSnap.docs.filter((d) => {
      const data = d.data() as WaiverRequest & { pendingExpiresAt?: { toDate?: () => Date; seconds?: number } };
      if (data.status === "signed") return true;
      if (data.status !== "pending") return false;
      const pe = data.pendingExpiresAt;
      if (pe == null) return true;
      const peDate = typeof pe?.toDate === "function" ? pe.toDate() : new Date((pe?.seconds ?? 0) * 1000);
      return peDate.getTime() > nowMs;
    }).length;

    if (activeCount >= groupData.partySize) return;

    const requestRef = db.collection(COLL.requests).doc(requestId);
    const requestSnap = await tx.get(requestRef);
    if (requestSnap.exists) return;

    const doc = {
      bookingId: groupData.bookingId,
      templateId: groupData.templateId,
      templateVersion: groupData.templateVersion,
      templateSnapshot: templateSnapshot ?? groupData.templateSnapshot,
      signingTokenId: "",
      signingUrl: "",
      sent: { initialSentAt: null, lastSentAt: null, reminder1SentAt: null },
      createdAt: now,
      ...signedFields,
    };
    tx.set(requestRef, doc);
    out = { id: requestId, ...(doc as unknown as WaiverRequest) };
  });
  return out;
}

export function isTokenValid(
  tokenDoc: (WaiverSigningToken & { id: string }) | null
): boolean {
  if (!tokenDoc) return false;
  if (tokenDoc.usedAt != null) return false;
  const expiresAt = tokenDoc.expiresAt as { seconds?: number; toDate?: () => Date };
  return !isTokenExpired(expiresAt as unknown as Date | { seconds: number } | string);
}

// ---------------------------------------------------------------------------
// Booking waiver pointer
// ---------------------------------------------------------------------------

const STATUS_PRIORITY: Record<string, number> = {
  void: 0,
  expired: 1,
  pending: 2,
  partial: 3,
  signed: 4,
};

export async function getBookingWaiverPointer(
  bookingId: string
): Promise<BookingWaiverPointer | null> {
  const db = getDb();
  const snap = await db.collection(COLL.bookings).doc(bookingId).get();
  if (!snap.exists) return null;
  const waiver = (snap.data() as { waiver?: BookingWaiverPointer })?.waiver;
  if (
    !waiver ||
    typeof waiver.requestId !== "string" ||
    typeof waiver.templateId !== "string" ||
    typeof waiver.templateVersion !== "number"
  )
    return null;
  return waiver as BookingWaiverPointer;
}

/**
 * Updates booking.waiver. Does not downgrade `signed` to `partial`/`pending` (e.g. from group signers).
 * Merges `signedCount` when status is `partial`.
 */
export async function setBookingWaiverPointer(
  bookingId: string,
  pointer: BookingWaiverPointer
): Promise<void> {
  const db = getDb();
  const { FieldValue } = getFirestoreExports();
  const existing = await getBookingWaiverPointer(bookingId);
  const requestId = existing?.requestId ?? pointer.requestId;

  const incomingPri = STATUS_PRIORITY[pointer.status] ?? -1;
  const existingPri = existing?.status != null ? (STATUS_PRIORITY[existing.status] ?? -1) : -1;

  if (existing?.status === "signed" && pointer.status !== "signed") {
    await db.collection(COLL.bookings).doc(bookingId).update({
      waiver: { ...existing, requestId },
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  if (existing && existingPri > incomingPri) {
    await db.collection(COLL.bookings).doc(bookingId).update({
      waiver: { ...existing, requestId },
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  let next: BookingWaiverPointer = { ...pointer, requestId };

  if (pointer.status === "partial") {
    const prevCount = existing?.signedCount ?? 0;
    const add = pointer.signedCount ?? 1;
    next = {
      ...(existing ?? pointer),
      requestId,
      status: "partial" as BookingWaiverPointerStatus,
      templateId: pointer.templateId,
      templateVersion: pointer.templateVersion,
      signedCount: prevCount + add,
    };
  }

  await db.collection(COLL.bookings).doc(bookingId).update({
    waiver: next,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function getRequestByBookingId(
  bookingId: string
): Promise<(WaiverRequest & { id: string }) | null> {
  const db = getDb();
  const snap = await db
    .collection(COLL.requests)
    .where("bookingId", "==", bookingId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...(doc.data() as WaiverRequest) };
}
