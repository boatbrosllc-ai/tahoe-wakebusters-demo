/**
 * Build a strict JSON-serializable template for /api/waiver/signing/validate.
 * Avoids passing through unexpected Firestore types and skips server-side DOMPurify
 * (the signing UI re-sanitizes in TermsAccept before dangerouslySetInnerHTML).
 */

import type {
  WaiverClause,
  WaiverRequiredFields,
  WaiverSignatureConfig,
  WaiverSignatureMode,
  WaiverTemplate,
  WaiverValidateResponse,
} from "./types";

const DEFAULT_REQUIRED: WaiverRequiredFields = {
  dob: true,
  phone: true,
  address: false,
  bookingDate: true,
};

function normalizeSignatureMode(m: unknown): WaiverSignatureMode {
  return m === "draw" || m === "type" || m === "both" ? m : "both";
}

function normalizeClauses(raw: unknown): WaiverClause[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c) => {
    const o = c as Record<string, unknown>;
    return {
      id: typeof o.id === "string" ? o.id : String(o.id ?? ""),
      label: typeof o.label === "string" ? o.label : String(o.label ?? ""),
      requiresInitials: !!o.requiresInitials,
    };
  });
}

export function toValidateTemplatePayload(
  template: WaiverTemplate
): WaiverValidateResponse["template"] {
  const rf = template.requiredFields;
  const requiredFields: WaiverRequiredFields = {
    dob: rf?.dob ?? DEFAULT_REQUIRED.dob,
    phone: rf?.phone ?? DEFAULT_REQUIRED.phone,
    address: rf?.address ?? DEFAULT_REQUIRED.address,
    bookingDate: rf?.bookingDate ?? DEFAULT_REQUIRED.bookingDate,
  };
  const sig = template.signature;
  const signature: WaiverSignatureConfig = {
    mode: normalizeSignatureMode(sig?.mode),
    requireTypedName: !!sig?.requireTypedName,
  };
  const version = typeof template.version === "number" && Number.isFinite(template.version) ? template.version : 1;

  return {
    title: typeof template.title === "string" ? template.title : String(template.title ?? ""),
    termsHtml: typeof template.termsHtml === "string" ? template.termsHtml : "",
    requiredFields,
    clauses: normalizeClauses(template.clauses),
    signature,
    version,
  };
}
