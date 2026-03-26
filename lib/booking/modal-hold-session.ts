import { SESSION_HOLD_ID_KEY, type ModalHoldRecoveryPayloadV1 } from "@/components/site/useHoldCreation";

export type ParsedModalHoldSession =
  | ModalHoldRecoveryPayloadV1
  | { holdId?: string; releaseToken?: string | null; receiptClaimToken?: string | null };

export function readModalHoldSessionPayload(): ParsedModalHoldSession | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = sessionStorage.getItem(SESSION_HOLD_ID_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ParsedModalHoldSession;
  } catch {
    return null;
  }
}

export function readModalSessionHoldId(): string | null {
  const parsed = readModalHoldSessionPayload();
  const holdId = parsed && typeof parsed.holdId === "string" ? parsed.holdId.trim() : "";
  return holdId || null;
}

export function readModalSessionReceiptClaimToken(): string | null {
  const parsed = readModalHoldSessionPayload();
  const token =
    parsed && "receiptClaimToken" in parsed && typeof parsed.receiptClaimToken === "string"
      ? parsed.receiptClaimToken.trim()
      : "";
  return token || null;
}

export function readModalSessionReleaseTokenForHold(holdId: string): string | null {
  const parsed = readModalHoldSessionPayload();
  if (!parsed || parsed.holdId !== holdId) return null;
  const token = typeof parsed.releaseToken === "string" ? parsed.releaseToken.trim() : "";
  return token || null;
}
