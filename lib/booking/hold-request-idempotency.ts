import { createHash } from "crypto";
import type { CreateHoldInput } from "@/lib/booking/types";

export const HOLD_REQUEST_CLAIMS_COLLECTION = "holdRequestClaims";

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
