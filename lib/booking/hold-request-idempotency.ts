import { createHash } from "crypto";
import type { CreateHoldInput } from "@/lib/booking/types";

/** Top-level collection; `expireAt` is set on writes (create-hold) for Firestore TTL — see firestore.indexes.json. */
export const HOLD_REQUEST_CLAIMS_COLLECTION = "holdRequestClaims";
/** Keep claim locks only slightly longer than hold lifetime to avoid long-lived orphaned claims. */
export const HOLD_REQUEST_CLAIM_TTL_MS = 2 * 60 * 60 * 1000;

/** Stable hash of booking-defining fields; used to detect holdRequestId reuse with a different payload. */
export function computeHoldRequestFingerprint(input: CreateHoldInput): string {
  const addons = [...input.addonSelections].sort((a, b) => a.addonId.localeCompare(b.addonId));
  const answerKeys = Object.keys(input.answers).sort();
  const answersSorted: Record<string, string> = {};
  for (const k of answerKeys) answersSorted[k] = input.answers[k];
  const payload = {
    experienceId: input.experienceId ?? null,
    boatId: input.boatId ?? null,
    slotId: input.slotId,
    rateId: input.rateId,
    partySize: input.partySize,
    petsCount: input.petsCount,
    bookingMode: input.bookingMode,
    addonSelections: addons,
    tipCents: input.tipCents ?? 0,
    discountCode: input.discountCode ?? null,
    resumeHoldId: input.resumeHoldId ?? null,
    customerDraft: {
      name: input.customerDraft.name.trim(),
      email: input.customerDraft.email.trim().toLowerCase(),
      phone: input.customerDraft.phone.trim().replace(/\s+/g, ""),
    },
    answers: answersSorted,
    marketingOptIn: input.marketingOptIn,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/** Canonical JSON payload for direct-checkout idempotency (must match client `getOrCreateDirectCheckoutHoldRequestId`). */
export function directCheckoutFingerprintPayload(input: {
  experienceId: string;
  slotId: string;
  boatId?: string;
  partySize: number;
  petsCount: number;
  discountCode?: string;
  /** Normalized (trim + lower case); empty when unknown (e.g. charter direct checkout before contact step). */
  customerEmail?: string;
}): {
  source: "direct_checkout_v1";
  experienceId: string;
  slotId: string;
  boatId: string | null;
  partySize: number;
  petsCount: number;
  discountCode: string | null;
  customerEmail: string;
} {
  const raw = typeof input.customerEmail === "string" ? input.customerEmail.trim().toLowerCase() : "";
  return {
    source: "direct_checkout_v1",
    experienceId: input.experienceId,
    slotId: input.slotId,
    boatId: input.boatId ?? null,
    partySize: input.partySize,
    petsCount: input.petsCount,
    discountCode: input.discountCode ?? null,
    customerEmail: raw,
  };
}

/** Fingerprint for POST /api/booking/create-checkout-session-direct (no customerDraft); must match claim checks for the same holdRequestId. */
export function computeDirectCheckoutHoldRequestFingerprint(input: {
  experienceId: string;
  slotId: string;
  boatId?: string;
  partySize: number;
  petsCount: number;
  discountCode?: string;
  customerEmail?: string;
}): string {
  return createHash("sha256").update(JSON.stringify(directCheckoutFingerprintPayload(input))).digest("hex");
}
