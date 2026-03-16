/**
 * Builds the experience doc update payload (after allowDeposit enforcement).
 * Used by PATCH app/api/admin/experiences/[id]/route.ts and by route-level integration tests.
 */
import { enforceAllowDeposit } from "./enforce-allow-deposit";

/** Parsed body shape from experience PATCH (at least the fields we need for enforcement). */
export type ExperienceParsedPayload = {
  pricingType?: "charter" | "ticketed";
  allowDeposit?: boolean;
  rates?: unknown;
  addons?: unknown;
  [key: string]: unknown;
};

/**
 * Applies allowDeposit enforcement and returns the experience-level fields that should be
 * persisted (excluding rates/addons). Caller should stripUndefined before batch.update.
 */
export function buildExperienceDocUpdate(
  parsed: ExperienceParsedPayload,
  storedPricingType: string | undefined
): Record<string, unknown> {
  Object.assign(parsed, enforceAllowDeposit(parsed, storedPricingType));
  const { rates, addons, ...expFieldsInner } = parsed;
  return expFieldsInner;
}
