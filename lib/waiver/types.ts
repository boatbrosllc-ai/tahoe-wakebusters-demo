/**
 * Waiver system types — Firestore documents and API shapes.
 * Collections: waiverTemplates, waiverRequests, waiverSigningTokens (top-level).
 */

// Firestore Timestamp from firebase-admin (seconds + nanoseconds or toDate())
export type FirestoreTimestamp =
  | { seconds: number; nanoseconds: number }
  | { toDate(): Date };

// ---------------------------------------------------------------------------
// Waiver template
// ---------------------------------------------------------------------------

export interface WaiverRequiredFields {
  dob: boolean;
  phone: boolean;
  address: boolean;
  bookingDate: boolean;
}

export interface WaiverClause {
  id: string;
  label: string;
  requiresInitials: boolean;
}

export type WaiverSignatureMode = "draw" | "type" | "both";

export interface WaiverSignatureConfig {
  mode: WaiverSignatureMode;
  requireTypedName: boolean;
}

export interface WaiverPageHeading {
  title: string;
  heading: string;
  subheading: string;
}

/** Internal QR/kiosk link for stable printed codes (Firestore: waiverQrLinks). */
export interface WaiverQrLink {
  templateId: string;
  /** When false, scans should show “unavailable” (rotated / retired link). */
  active: boolean;
  label?: string;
  assignedBoat?: string;
  /** e.g. boat sticker, kiosk, captain phone, dock sign */
  useCase?: string;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

export interface WaiverTemplate {
  title: string;
  description: string;
  isActive: boolean;
  termsHtml: string;
  requiredFields: WaiverRequiredFields;
  clauses: WaiverClause[];
  signature: WaiverSignatureConfig;
  version: number;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
  welcomeHeading?: string;
  welcomeSubheading?: string;
  pageHeadings?: Record<string, WaiverPageHeading>;
  dobMinAge?: number;
  dobMaxAge?: number;
  minorAge?: number;
  /** Include waiver signing link in the booking confirmation email. */
  includeInConfirmationEmail?: boolean;
  /** Send a separate waiver invite email (dedicated "Sign your waiver" email). */
  sendSeparateWaiverInvite?: boolean;
  /** Include this waiver in the reminder cron (send reminder if not yet signed). */
  sendWaiverReminder?: boolean;
}

/** Immutable template content captured when creating a waiver request. */
export type WaiverTemplateSnapshot = Omit<WaiverTemplate, "createdAt" | "updatedAt">;

// ---------------------------------------------------------------------------
// Waiver request
// ---------------------------------------------------------------------------

export type WaiverRequestStatus = "pending" | "signed" | "expired" | "void";

export interface WaiverSent {
  initialSentAt: FirestoreTimestamp | null;
  lastSentAt: FirestoreTimestamp | null;
  reminder1SentAt: FirestoreTimestamp | null;
}

export interface WaiverSignedPayload {
  signerName: string;
  signerEmail: string;
  signerPhone: string;
  signerAddress?: string | null;
  signerDob: string | null;
  /** Trip/booking date associated with the waiver (YYYY-MM-DD). */
  bookingDate?: string | null;
  initials: Record<string, string>;
  /** Explicit acknowledgement metadata (required by server). */
  termsAcceptedAtIso: string;
  termsContentHash: string;
  /** Optional; omitted when persisting to Firestore to avoid document size limit (PDF + contentHash suffice). */
  signatureDataUrl?: string;
  typedName?: string;
}

export interface WaiverSigned {
  signedAt: FirestoreTimestamp;
  ip: string | null;
  userAgent: string | null;
  /** Firebase Storage path for PDF (admin download only; never expose public URLs). */
  pdfStoragePath?: string | null;
  /** Stored signed HTML when PDF is unavailable (e.g. serverless); admin route may serve as .html download. */
  htmlStoragePath?: string | null;
  /** Drawn signature image in Storage (`waivers/{id}-signature.{ext}`); data URL is not stored in Firestore. */
  signatureStoragePath?: string | null;
  contentHash: string;
  signedPayload: WaiverSignedPayload;
  /** Optional operator-required manual review metadata. */
  requiresManualReview?: WaiverManualReview;
}

export interface WaiverManualReview {
  reasonCode: string;
  reason: string;
  at: FirestoreTimestamp;
  metadata?: Record<string, unknown>;
}

export type WaiverSigningChannel = "booking_token" | "group" | "qr_kiosk";

export interface WaiverRequest {
  bookingId: string;
  templateId: string;
  templateVersion: number;
  /** Immutable template snapshot captured when request was created (prevents admin edits from drifting legal terms). */
  templateSnapshot?: WaiverTemplateSnapshot;
  status: WaiverRequestStatus;
  signerName?: string;
  signerEmail?: string;
  signerPhone?: string;
  signerDob?: string;
  /** When present, operators must review before the waiver is relied on legally. */
  requiresManualReview?: WaiverManualReview;
  qrLinkId?: string;
  signingChannel?: WaiverSigningChannel;
  signingTokenId: string;
  signingUrl: string;
  /** Share link for additional party members; same token doc as {@link WaiverGroupTokenDoc}. */
  groupSigningUrl?: string;
  sent: WaiverSent;
  signed?: WaiverSigned;
  createdAt: FirestoreTimestamp;
  /** When set, this pending request expires at this time; used for group signer slots so capacity can be reclaimed. */
  pendingExpiresAt?: FirestoreTimestamp;
}

// ---------------------------------------------------------------------------
// Waiver signing token (document id = token value)
// ---------------------------------------------------------------------------

export interface WaiverSigningToken {
  waiverRequestId: string;
  bookingId: string;
  expiresAt: FirestoreTimestamp;
  usedAt: FirestoreTimestamp | null;
  signerEmail?: string;
}

// ---------------------------------------------------------------------------
// Booking waiver pointer (optional field on booking doc)
// ---------------------------------------------------------------------------

/** Booking-level waiver aggregate state (may differ from a single waiverRequest doc when party size > 1). */
export type BookingWaiverPointerStatus = WaiverRequestStatus | "partial";

export interface BookingWaiverPointer {
  requestId: string;
  status: BookingWaiverPointerStatus;
  templateId: string;
  templateVersion: number;
  /** Incremented when additional party members sign via the group link (primary token path sets status to signed). */
  signedCount?: number;
}

// ---------------------------------------------------------------------------
// API / UI shapes
// ---------------------------------------------------------------------------

export interface WaiverBookingSummary {
  experienceName: string;
  tripDate: string;
  startTime?: string;
  endTime?: string;
  partySize?: number;
}

/** When true, client should submit with groupToken instead of token (request created on submit). */
export interface WaiverValidateResponse {
  valid: true;
  waiverRequestId: string;
  /** Set when signing via group link; submit with groupToken to create a new signer for the booking. */
  isGroupSigning?: boolean;
  groupToken?: string;
  /** Stable QR/kiosk link: submit with `qrLinkId` instead of token/groupToken. */
  isQrLinkSigning?: boolean;
  qrLinkId?: string;
  bookingSummary: WaiverBookingSummary;
  template: {
    title: string;
    termsHtml: string;
    requiredFields: WaiverRequiredFields;
    clauses: WaiverClause[];
    signature: WaiverSignatureConfig;
    version: number;
  };
}
