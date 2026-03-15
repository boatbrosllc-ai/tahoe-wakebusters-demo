/**
 * Zod schemas for waiver API boundaries (server-side validation).
 */

import { z } from "zod";

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

export const submitWaiverSigningSchema = z
  .object({
    token: z.string().optional(),
    groupToken: z.string().optional(),
    signer: signerSchema,
    initials: z.record(z.string(), z.string()).default({}),
    signatureDataUrl: z
      .string()
      .min(1, "Signature is required")
      .refine(
        (v) => v.startsWith("data:image/") && v.includes(";base64,"),
        { message: "Signature must be a valid image data URL (data:image/...;base64,...)" }
      ),
    typedName: z.string().optional(),
  })
  .refine((data) => (data.token?.length ?? 0) > 0 || (data.groupToken?.length ?? 0) > 0, {
    message: "Either token or groupToken is required",
    path: ["token"],
  });

export type SubmitWaiverSigningInput = z.infer<typeof submitWaiverSigningSchema>;

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
