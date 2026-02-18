/**
 * Waiver Firestore helpers — server-only.
 * Uses getDb() and getFirestoreExports() from lib/booking/firebase-admin.
 */

import "server-only";
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
  WaiverRequest,
  WaiverRequestStatus,
  WaiverSigningToken,
  WaiverSent,
  WaiverSigned,
  WaiverSignedPayload,
  WaiverRequiredFields,
  WaiverClause,
  WaiverSignatureConfig,
  FirestoreTimestamp,
} from "./types";
import type { CreateWaiverTemplateInput } from "./schema";

const COLL = {
  templates: "waiverTemplates",
  requests: "waiverRequests",
  tokens: "waiverSigningTokens",
  groupTokens: "waiverGroupTokens",
  bookings: "bookings",
} as const;

function getAppBaseUrl(): string {
  const url = process.env.APP_BASE_URL?.trim() ?? "";
  return url.replace(/\/$/, "");
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
    status: "pending",
    signingTokenId: tokenId,
    signingUrl,
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

// ---------------------------------------------------------------------------
// Group signing (shareable link for additional party members)
// ---------------------------------------------------------------------------

export interface WaiverGroupTokenDoc {
  bookingId: string;
  templateId: string;
  templateVersion: number;
  partySize: number;
  createdAt: FirestoreTimestamp;
  expiresAt: FirestoreTimestamp;
}

export async function createGroupToken(
  bookingId: string,
  templateId: string,
  templateVersion: number,
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
  templateVersion: number
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
    status: "pending",
    signingTokenId: "",
    signingUrl: "",
    sent: { initialSentAt: null, lastSentAt: null, reminder1SentAt: null },
    createdAt: Timestamp.now(),
  };
  await db.collection(COLL.requests).doc(requestId).set(request);
  return requestId;
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
    signerName?: string;
    signerEmail?: string;
    signerPhone?: string;
    signerDob?: string;
    signingTokenId?: string;
    signingUrl?: string;
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

export async function updateRequestSigned(
  requestId: string,
  signed: WaiverSigned
): Promise<void> {
  const db = getDb();
  const ref = db.collection(COLL.requests).doc(requestId);
  await ref.update({
    status: "signed",
    signed,
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
  const limit = Math.min(filters.limit ?? 100, 500);
  const fetchLimit = filters.status || filters.fromDate || filters.toDate || filters.search ? limit * 3 : limit;
  const query = db
    .collection(COLL.requests)
    .orderBy("createdAt", "desc")
    .limit(fetchLimit);
  const snap = await query.get();
  let docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as WaiverRequest) }));

  if (filters.status) {
    docs = docs.filter((d) => d.status === filters.status);
  }

  if (filters.fromDate || filters.toDate) {
    const from = filters.fromDate ? new Date(filters.fromDate).getTime() : 0;
    const to = filters.toDate
      ? new Date(filters.toDate + "T23:59:59.999Z").getTime()
      : Number.MAX_SAFE_INTEGER;
    docs = docs.filter((d) => {
      const created = d.createdAt;
      const ms =
        typeof (created as { toDate?: () => Date }).toDate === "function"
          ? (created as { toDate: () => Date }).toDate().getTime()
          : typeof (created as { seconds?: number }).seconds === "number"
            ? (created as { seconds: number }).seconds * 1000
            : new Date(created as unknown as string).getTime();
      return ms >= from && ms <= to;
    });
  }

  if (filters.search && filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    docs = docs.filter(
      (d) =>
        (d.signerName ?? "").toLowerCase().includes(q) ||
        (d.signerEmail ?? "").toLowerCase().includes(q) ||
        d.bookingId.toLowerCase().includes(q)
    );
  }

  return docs.slice(0, limit);
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

export async function setBookingWaiverPointer(
  bookingId: string,
  pointer: { requestId: string; status: WaiverRequestStatus; templateId: string; templateVersion: number }
): Promise<void> {
  const db = getDb();
  await db.collection(COLL.bookings).doc(bookingId).update({ waiver: pointer });
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
