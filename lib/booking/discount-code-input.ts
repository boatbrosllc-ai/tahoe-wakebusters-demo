/** Minimum discount code length — shared by customer validate-discount and admin discount creation. */
export const DISCOUNT_CODE_MIN_LENGTH = 2;

export function normalizeDiscountCodeInput(raw: string): string {
  return raw.trim().toUpperCase();
}

export type DiscountCodeLengthValidation =
  | { ok: true; code: string }
  | { ok: false; error: string };

/** Validates normalized code length for API handlers (code must already be trimmed/uppercased). */
export function validateDiscountCodeLength(code: string): DiscountCodeLengthValidation {
  if (!code) {
    return { ok: false, error: "Enter a discount code" };
  }
  if (code.length < DISCOUNT_CODE_MIN_LENGTH) {
    return {
      ok: false,
      error: "Discount code must be at least 2 characters",
    };
  }
  return { ok: true, code };
}

/** Admin discount POST uses a shorter error message for the same rule. */
export function validateAdminDiscountCodeLength(code: string): DiscountCodeLengthValidation {
  if (!code || code.length < DISCOUNT_CODE_MIN_LENGTH) {
    return { ok: false, error: "Code is required (at least 2 characters)" };
  }
  return { ok: true, code };
}
