import type { DiscountAssignedToType } from "./types";

export const DISCOUNT_ASSIGNED_TO_TYPES = [
  "internal",
  "partner",
  "influencer",
  "campaign",
  "other",
] as const satisfies readonly DiscountAssignedToType[];

export const DISCOUNT_ASSIGNED_TO_TYPE_LABELS: Record<DiscountAssignedToType, string> = {
  internal: "Internal",
  partner: "Partner",
  influencer: "Influencer",
  campaign: "Campaign",
  other: "Other",
};

const ASSIGNED_TO_MAX_LENGTH = 120;

export function normalizeDiscountAssignedTo(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return undefined;
  return trimmed.slice(0, ASSIGNED_TO_MAX_LENGTH);
}

export function normalizeDiscountAssignedToType(raw: unknown): DiscountAssignedToType | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim().toLowerCase();
  return (DISCOUNT_ASSIGNED_TO_TYPES as readonly string[]).includes(t)
    ? (t as DiscountAssignedToType)
    : undefined;
}

export type DiscountAssignmentPatch = {
  assignedTo?: string;
  assignedToType?: DiscountAssignedToType;
  clearAssignedTo: boolean;
  clearAssignedToType: boolean;
};

/**
 * Parse optional assignment fields from an admin discount POST/PATCH body.
 * `null` or blank `assignedTo` / `assignedToType` means clear the stored value.
 */
export function parseDiscountAssignmentFields(body: Record<string, unknown>): DiscountAssignmentPatch {
  const patch: DiscountAssignmentPatch = {
    clearAssignedTo: false,
    clearAssignedToType: false,
  };
  if ("assignedTo" in body) {
    const next = normalizeDiscountAssignedTo(body.assignedTo);
    if (next) patch.assignedTo = next;
    else patch.clearAssignedTo = true;
  }
  if ("assignedToType" in body) {
    const next = normalizeDiscountAssignedToType(body.assignedToType);
    if (next) patch.assignedToType = next;
    else patch.clearAssignedToType = true;
  }
  return patch;
}
