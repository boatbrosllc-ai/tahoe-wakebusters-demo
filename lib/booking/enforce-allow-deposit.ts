/**
 * Post-parse policy: when effective pricingType is "ticketed", allowDeposit must be false.
 * Effective type = incoming pricingType if present, else stored pricing type.
 * For ticketed we always return a payload that includes allowDeposit: false (heals stale
 * allowDeposit when PATCH omits both pricingType and allowDeposit). For charter, return
 * parsed unchanged. Used by PATCH handler in app/api/admin/experiences/[id]/route.ts.
 */
export function enforceAllowDeposit<
  P extends { pricingType?: "charter" | "ticketed"; allowDeposit?: boolean }
>(parsed: P, storedPricingType: string | undefined): P {
  const effectivePricingType = parsed.pricingType ?? storedPricingType;
  if (effectivePricingType === "ticketed") {
    return { ...parsed, allowDeposit: false };
  }
  return parsed;
}
