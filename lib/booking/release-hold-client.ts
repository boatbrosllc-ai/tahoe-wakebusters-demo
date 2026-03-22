import { SESSION_HOLD_ID_KEY, clearModalHoldRecoverySession } from "@/components/site/useHoldCreation";

/**
 * Best-effort release of a hold persisted for the booking modal (e.g. after failed redirect).
 */
export async function releaseHoldFromModalSessionStorage(): Promise<void> {
  try {
    const raw = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(SESSION_HOLD_ID_KEY) : null;
    if (!raw) return;
    const parsed = JSON.parse(raw) as { holdId?: string; releaseToken?: string | null };
    if (!parsed.holdId) return;
    const token =
      typeof parsed.releaseToken === "string" ? parsed.releaseToken.trim() : "";
    if (!token) return;
    await fetch("/api/booking/release-hold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        holdId: parsed.holdId,
        release_token: token,
      }),
    });
  } catch {
    /* ignore */
  } finally {
    clearModalHoldRecoverySession();
  }
}
