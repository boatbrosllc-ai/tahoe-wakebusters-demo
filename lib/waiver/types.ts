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
  signerDob: string | null;
  initials: Record<string, string>;
  signatureDataUrl: string;
  typedName?: string;
}

export interface WaiverSigned {
  signedAt: FirestoreTimestamp;
  ip: string | null;
  userAgent: string | null;
  /** Present when PDF was generated (e.g. serverless may skip). */
  pdfUrl?: string | null;
  pdfStoragePath?: string | null;
  contentHash: string;
  signedPayload: WaiverSignedPayload;
}

export interface WaiverRequest {
  bookingId: string;
  templateId: string;
  templateVersion: number;
  status: WaiverRequestStatus;
  signerName?: string;
  signerEmail?: string;
  signerPhone?: string;
  signerDob?: string;
  signingTokenId: string;
  signingUrl: string;
  sent: WaiverSent;
  signed?: WaiverSigned;
  createdAt: FirestoreTimestamp;
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

export interface BookingWaiverPointer {
  requestId: string;
  status: WaiverRequestStatus;
  templateId: string;
  templateVersion: number;
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
