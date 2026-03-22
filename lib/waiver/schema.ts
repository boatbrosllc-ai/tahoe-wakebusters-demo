/**
 * Zod schemas for waiver API boundaries (server-side validation).
 */

import { z } from "zod";
import type { WaiverTemplate } from "./types";

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
    initials: z.record(z.string(), z.string()).default({}),
    signatureDataUrl: optionalSignatureDataUrlSchema,
    typedName: optionalTrimmedStringSchema,
  })
  .refine((data) => (data.token?.length ?? 0) > 0 || (data.groupToken?.length ?? 0) > 0, {
    message: "Either token or groupToken is required",
    path: ["token"],
  });

export type SubmitWaiverSigningInput = z.infer<typeof submitWaiverSigningSchema>;

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
  signer: { phone?: string; dob?: string }
): { ok: true } | { ok: false; message: string } {
  const rf = template.requiredFields;
  if (!rf) return { ok: true };
  if (rf.phone && !signer.phone?.trim()) {
    return { ok: false, message: "Phone number is required." };
  }
  if (rf.dob && !signer.dob?.trim()) {
    return { ok: false, message: "Date of birth is required." };
  }
  return { ok: true };
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
