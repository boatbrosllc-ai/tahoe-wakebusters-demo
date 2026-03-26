/**
 * Zod schemas for waiver API boundaries (server-side validation).
 */

import { z } from "zod";
import { createHash } from "crypto";
import type { WaiverManualReview, WaiverTemplate } from "./types";

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

export const waiverRequiredFieldsSchema = z.object({
  dob: z.boolean(),
  phone: z.boolean(),
  address: z.boolean(),
  bookingDate: z.boolean(),
});

export const waiverClauseSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  requiresInitials: z.boolean(),
});

export const waiverSignatureConfigSchema = z.object({
  mode: z.enum(["draw", "type", "both"]),
  requireTypedName: z.boolean(),
});

export const pageHeadingSchema = z.object({
  title: z.string(),
  heading: z.string(),
  subheading: z.string(),
});

export const createWaiverTemplateSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string(),
  isActive: z.boolean().default(true),
  termsHtml: z.string(),
  requiredFields: waiverRequiredFieldsSchema.default({
    dob: true,
    phone: true,
    address: false,
    bookingDate: true,
  }),
  clauses: z.array(waiverClauseSchema).default([]),
  signature: waiverSignatureConfigSchema.default({
    mode: "both",
    requireTypedName: true,
  }),
  welcomeHeading: z.string().optional(),
  welcomeSubheading: z.string().optional(),
  pageHeadings: z.record(z.string(), pageHeadingSchema).optional(),
  dobMinAge: z.number().optional(),
  dobMaxAge: z.number().optional(),
  minorAge: z.number().optional(),
  includeInConfirmationEmail: z.boolean().optional(),
  sendSeparateWaiverInvite: z.boolean().optional(),
  sendWaiverReminder: z.boolean().optional(),
});

export const updateWaiverTemplateSchema = createWaiverTemplateSchema.partial();

export type CreateWaiverTemplateInput = z.infer<typeof createWaiverTemplateSchema>;
export type UpdateWaiverTemplateInput = z.infer<typeof updateWaiverTemplateSchema>;

// ---------------------------------------------------------------------------
// Signing submit
// ---------------------------------------------------------------------------

export const signerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional(),
  address: z.string().optional(),
  // Booking date associated with the waiver; expected as YYYY-MM-DD.
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dob: z.string().optional(), // YYYY-MM-DD or empty
});

const optionalSignatureDataUrlSchema = z
  .union([z.undefined(), z.null(), z.string()])
  .transform((v) => {
    if (v == null || typeof v !== "string") return undefined;
    const t = v.trim();
    return t.length > 0 ? t : undefined;
  })
  .refine(
    (v) => v === undefined || (v.startsWith("data:image/") && v.includes(";base64,")),
    { message: "Signature must be a valid image data URL when provided (data:image/...;base64,...)" }
  );

const optionalTrimmedStringSchema = z
  .union([z.undefined(), z.null(), z.string()])
  .transform((v) => {
    if (v == null || typeof v !== "string") return undefined;
    const t = v.trim();
    return t.length > 0 ? t : undefined;
  });

export const submitWaiverSigningSchema = z
  .object({
    token: z.string().optional(),
    groupToken: z.string().optional(),
    signer: signerSchema,
    termsAccepted: z.boolean(),
    termsAcceptedAtIso: z.string(),
    termsContentHash: z.string(),
    initials: z.record(z.string(), z.string()).default({}),
    signatureDataUrl: optionalSignatureDataUrlSchema,
    typedName: optionalTrimmedStringSchema,
  })
  .refine((data) => (data.token?.length ?? 0) > 0 || (data.groupToken?.length ?? 0) > 0, {
    message: "Either token or groupToken is required",
    path: ["token"],
  });

export type SubmitWaiverSigningInput = z.infer<typeof submitWaiverSigningSchema>;

export function validateTermsAcceptanceForTemplate(
  template: Pick<WaiverTemplate, "termsHtml">,
  input: { termsAccepted: boolean; termsAcceptedAtIso: string; termsContentHash: string }
): { ok: true } | { ok: false; message: string } {
  if (!input.termsAccepted) {
    return { ok: false, message: "You must agree to the terms and conditions." };
  }
  const at = new Date(input.termsAcceptedAtIso);
  if (Number.isNaN(at.getTime())) {
    return { ok: false, message: "Invalid terms acceptance timestamp." };
  }
  const expectedHash = createHash("sha256").update(template.termsHtml, "utf8").digest("hex");
  if (input.termsContentHash !== expectedHash) {
    return { ok: false, message: "Terms acceptance does not match the current waiver terms." };
  }
  return { ok: true };
}

export function validateRequiredClauseInitialsForTemplate(
  template: Pick<WaiverTemplate, "clauses">,
  initials: Record<string, string>
): { ok: true } | { ok: false; message: string } {
  const required = template.clauses.filter((c) => c.requiresInitials);
  const missing = required.filter((c) => !(initials[c.id] ?? "").trim());
  if (missing.length > 0) {
    return {
      ok: false,
      message: `Please initial ${missing.length === 1 ? "this statement" : "all statements"} above.`,
    };
  }
  return { ok: true };
}

/** After loading the waiver template, enforce signature rules for the template’s mode. */
export function validateSubmitSignatureForTemplate(
  template: Pick<WaiverTemplate, "signature">,
  input: { signatureDataUrl?: string; typedName?: string }
): { ok: true } | { ok: false; message: string } {
  const sig = template.signature;
  const mode = sig?.mode ?? "both";
  const requireTypedName = sig?.requireTypedName ?? true;
  const url = input.signatureDataUrl;
  const typed = input.typedName;
  const hasDraw = !!url && url.length > 0;
  const hasTyped = !!typed && typed.length > 0;

  if (mode === "type") {
    if (!hasTyped) {
      return { ok: false, message: "Typed full name is required to sign this waiver." };
    }
    return { ok: true };
  }
  if (!hasDraw) {
    return { ok: false, message: "Please draw your signature in the box before submitting." };
  }
  if (requireTypedName && !hasTyped) {
    return { ok: false, message: "Please type your full name to confirm your signature." };
  }
  return { ok: true };
}

/** Enforce template.requiredFields for phone and DOB on submit (API cannot be weaker than the template). */
export function validateSignerRequiredFieldsForTemplate(
  template: Pick<WaiverTemplate, "requiredFields">,
  signer: { phone?: string; dob?: string; address?: string; bookingDate?: string }
): { ok: true } | { ok: false; message: string } {
  const rf = template.requiredFields;
  if (!rf) return { ok: true };
  if (rf.phone && !signer.phone?.trim()) {
    return { ok: false, message: "Phone number is required." };
  }
  if (rf.dob && !signer.dob?.trim()) {
    return { ok: false, message: "Date of birth is required." };
  }
  if (rf.address && !signer.address?.trim()) {
    return { ok: false, message: "Address is required." };
  }
  if (rf.bookingDate && !signer.bookingDate?.trim()) {
    return { ok: false, message: "Booking date is required." };
  }
  return { ok: true };
}

type WaiverDobPolicyReview = Omit<WaiverManualReview, "at">;

function parseDobStrict(dob: string): { normalizedDob: string; dobDateUtc: Date } | null {
  const m = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  // Use UTC to avoid local timezone off-by-one when computing validity.
  const dt = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  const normalizedDob = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { normalizedDob, dobDateUtc: dt };
}

function computeAgeYears(dobDateUtc: Date, atDateUtc: Date): number {
  let years = atDateUtc.getUTCFullYear() - dobDateUtc.getUTCFullYear();
  const monthDiff = atDateUtc.getUTCMonth() - dobDateUtc.getUTCMonth();
  const dayDiff = atDateUtc.getUTCDate() - dobDateUtc.getUTCDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) years -= 1;
  return years;
}

function addYearsUtc(dateUtc: Date, years: number): Date {
  const y = dateUtc.getUTCFullYear() + years;
  const m = dateUtc.getUTCMonth();
  const d = dateUtc.getUTCDate();
  const candidate = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  // Handle Feb 29 by shifting to Feb 28 in non-leap years.
  if (candidate.getUTCMonth() !== m || candidate.getUTCDate() !== d) {
    // Try the last day of the month.
    const lastDay = new Date(Date.UTC(y, m + 1, 0, 0, 0, 0, 0));
    return lastDay;
  }
  return candidate;
}

function isNearBirthdayBoundary(dobDateUtc: Date, boundaryAgeYears: number, atDateUtc: Date, windowDays: number): boolean {
  const boundaryDate = addYearsUtc(dobDateUtc, boundaryAgeYears);
  const diffMs = boundaryDate.getTime() - atDateUtc.getTime();
  const diffDays = Math.abs(diffMs) / (24 * 60 * 60 * 1000);
  return diffDays <= windowDays;
}

export function validateDobPolicyForTemplate(
  template: Pick<WaiverTemplate, "dobMinAge" | "dobMaxAge" | "minorAge" | "requiredFields">,
  input: { dob?: string | null }
): { ok: true; normalizedDob: string | null; manualReview?: WaiverDobPolicyReview } | { ok: false; message: string } {
  const dobRaw = input.dob?.trim() ?? "";
  const dobPresent = dobRaw.length > 0;
  const anyAgePolicy = template.dobMinAge != null || template.dobMaxAge != null || template.minorAge != null;

  if (!dobPresent) {
    if (anyAgePolicy && !template.requiredFields?.dob) {
      return {
        ok: true,
        normalizedDob: null,
        manualReview: {
          reasonCode: "waiver_dob_missing_age_policy",
          reason: "DOB is missing but an age policy is configured; manual review required.",
          metadata: { dobMinAge: template.dobMinAge ?? null, dobMaxAge: template.dobMaxAge ?? null, minorAge: template.minorAge ?? null },
        },
      };
    }
    return { ok: true, normalizedDob: null };
  }

  const parsed = parseDobStrict(dobRaw);
  if (!parsed) {
    return { ok: false, message: "Date of birth must be a valid calendar date (YYYY-MM-DD)." };
  }

  const normalizedDob = parsed.normalizedDob;
  const now = new Date();
  const ageYears = computeAgeYears(parsed.dobDateUtc, now);

  if (typeof template.dobMinAge === "number" && Number.isFinite(template.dobMinAge) && ageYears < template.dobMinAge) {
    return { ok: false, message: `You must meet the minimum age requirement (${template.dobMinAge}+).` };
  }
  if (typeof template.dobMaxAge === "number" && Number.isFinite(template.dobMaxAge) && ageYears > template.dobMaxAge) {
    return { ok: false, message: `You must be no older than ${template.dobMaxAge}.` };
  }

  const manualReviewCandidates: WaiverDobPolicyReview[] = [];
  const windowDays = 3;
  if (typeof template.dobMinAge === "number" && Number.isFinite(template.dobMinAge)) {
    if (isNearBirthdayBoundary(parsed.dobDateUtc, template.dobMinAge, now, windowDays)) {
      manualReviewCandidates.push({
        reasonCode: "waiver_age_near_min_threshold",
        reason: "DOB is near the minimum age threshold; manual review may be required.",
        metadata: { dobMinAge: template.dobMinAge, ageYears },
      });
    }
  }
  if (typeof template.dobMaxAge === "number" && Number.isFinite(template.dobMaxAge)) {
    if (isNearBirthdayBoundary(parsed.dobDateUtc, template.dobMaxAge, now, windowDays)) {
      manualReviewCandidates.push({
        reasonCode: "waiver_age_near_max_threshold",
        reason: "DOB is near the maximum age threshold; manual review may be required.",
        metadata: { dobMaxAge: template.dobMaxAge, ageYears },
      });
    }
  }
  if (typeof template.minorAge === "number" && Number.isFinite(template.minorAge)) {
    // Treat under minorAge as legally significant and require manual review.
    if (ageYears < template.minorAge) {
      manualReviewCandidates.push({
        reasonCode: "waiver_minor_age_flag",
        reason: "Signer is under the configured minor age threshold; manual review required.",
        metadata: { minorAge: template.minorAge, ageYears },
      });
    } else if (isNearBirthdayBoundary(parsed.dobDateUtc, template.minorAge, now, windowDays)) {
      manualReviewCandidates.push({
        reasonCode: "waiver_age_near_minor_threshold",
        reason: "DOB is near the minor age threshold; manual review may be required.",
        metadata: { minorAge: template.minorAge, ageYears },
      });
    }
  }

  return {
    ok: true,
    normalizedDob,
    manualReview: manualReviewCandidates.length > 0 ? manualReviewCandidates[0] : undefined,
  };
}

// ---------------------------------------------------------------------------
// Admin request list query
// ---------------------------------------------------------------------------

export const listWaiverRequestsQuerySchema = z.object({
  status: z.enum(["pending", "signed", "expired", "void"]).optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(500).default(100),
});

export type ListWaiverRequestsQuery = z.infer<typeof listWaiverRequestsQuerySchema>;
