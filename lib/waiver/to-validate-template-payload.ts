/**
 * Build a strict JSON-serializable template for /api/waiver/signing/validate.
 * Avoids passing through unexpected Firestore types and skips server-side DOMPurify
 * (the signing UI re-sanitizes in TermsAccept before dangerouslySetInnerHTML).
 */

import { z } from "zod";
import { waiverClauseSchema, waiverRequiredFieldsSchema, waiverSignatureConfigSchema } from "./schema";
import type { WaiverTemplate, WaiverTemplateSnapshot, WaiverValidateResponse } from "./types";

const waiverTemplateForValidatePayloadSchema = z.object({
  title: z.string().min(1),
  termsHtml: z.string(),
  requiredFields: waiverRequiredFieldsSchema,
  clauses: z.array(waiverClauseSchema),
  signature: waiverSignatureConfigSchema,
  version: z.number().finite(),
});

export function toValidateTemplatePayload(
  template: WaiverTemplate | WaiverTemplateSnapshot
): WaiverValidateResponse["template"] {
  const parsed = waiverTemplateForValidatePayloadSchema.safeParse(template);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => {
        const path = i.path.length > 0 ? i.path.join(".") : "(root)";
        return `${path}: ${i.message}`;
      })
      .join("; ");
    throw new Error(`Invalid waiver template record: ${details}`);
  }

  return {
    title: parsed.data.title,
    termsHtml: parsed.data.termsHtml,
    requiredFields: parsed.data.requiredFields,
    clauses: parsed.data.clauses,
    signature: parsed.data.signature,
    version: parsed.data.version,
  };
}
