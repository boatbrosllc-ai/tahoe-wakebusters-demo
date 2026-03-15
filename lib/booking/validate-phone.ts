/**
 * Phone validation shared by create-hold API and booking UI.
 * Accepted format: at least 10 digits (US); non-digit characters are stripped before checking.
 */

const MIN_DIGITS = 10;

export function validatePhone(value: string): { valid: true } | { valid: false; error: string } {
  if (typeof value !== "string") {
    return { valid: false, error: "Phone number is required." };
  }
  const digitsOnly = value.replace(/\D/g, "");
  if (digitsOnly.length < MIN_DIGITS) {
    return {
      valid: false,
      error: digitsOnly.length === 0 ? "Phone number is required." : `Enter at least ${MIN_DIGITS} digits.`,
    };
  }
  return { valid: true };
}

export function formatPhoneHint(value: string): string | null {
  const result = validatePhone(value);
  return result.valid ? null : result.error;
}
