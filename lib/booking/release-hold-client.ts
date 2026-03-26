import { clearModalHoldRecoverySession } from "@/components/site/useHoldCreation";
import type { ModalHoldRecoveryPayloadV1 } from "@/components/site/useHoldCreation";
import { readModalHoldSessionPayload } from "@/lib/booking/modal-hold-session";

/**
 * Best-effort release of a hold persisted for the booking modal (e.g. after failed redirect).
 *
 * **Important:** If neither `releaseToken` nor a valid `receiptClaimToken` is present in session storage,
 * the client cannot prove hold possession — the slot **stays held for the full expiry window** (unless
 * ops or automation uses `Authorization: Bearer RELEASE_HOLD_INTERNAL_SECRET` with `POST /api/booking/release-hold`
 * and `{ "holdId" }`, as in emulator integration tests). In that case we emit an operational alert so ops can
 * monitor stuck holds.
 */
export async function releaseHoldFromModalSessionStorage(): Promise<void> {
  const parsed = readModalHoldSessionPayload() as
    | ModalHoldRecoveryPayloadV1
    | { holdId?: string; releaseToken?: string | null }
    | null;
  if (!parsed) {
    clearModalHoldRecoverySession();
    return;
  }
  if (!parsed.holdId) {
    clearModalHoldRecoverySession();
    return;
  }
  const holdId = parsed.holdId.trim();
  const token = typeof parsed.releaseToken === "string" ? parsed.releaseToken.trim() : "";
  const receiptClaim =
    "receiptClaimToken" in parsed && typeof parsed.receiptClaimToken === "string"
      ? parsed.receiptClaimToken.trim()
      : "";

  if (token) {
    try {
      await fetch("/api/booking/release-hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ release_token: token }),
      });
    } catch {
      /* ignore */
    } finally {
      clearModalHoldRecoverySession();
    }
    return;
  }

  if (receiptClaim) {
    try {
      await fetch("/api/booking/release-hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt_claim_token: receiptClaim }),
      });
    } catch {
      /* ignore */
    } finally {
      clearModalHoldRecoverySession();
    }
    return;
  }

  try {
    await fetch("/api/booking/alert-stuck-modal-hold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holdId }),
    });
  } catch {
    /* ignore */
  } finally {
    clearModalHoldRecoverySession();
  }
}
