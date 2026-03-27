import { SESSION_HOLD_ID_KEY, type ModalHoldRecoveryPayloadV1 } from "@/components/site/useHoldCreation";

/** Decode base64url payload (first segment) to read embedded `exp` — client UX only (same idea as ManageBookingClient). */
function getExpFromSignedTokenPayloadFirstSegment(payloadB64: string): number | null {
  if (typeof atob !== "function") return null;
  try {
    const padded = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const pad = (4 - (padded.length % 4)) % 4;
    const base64 = padded + "=".repeat(pad);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const str = new TextDecoder().decode(bytes);
    const segments = str.split("\x00");
    const expStr = segments.length >= 3 ? segments[2] : segments[1];
    const exp = parseInt(expStr, 10);
    return Number.isNaN(exp) ? null : exp;
  } catch {
    return null;
  }
}

/** True when receipt-claim token is present but past `exp` (omit from complete-after-payment so server can use PI metadata). */
function receiptClaimTokenIsExpiredClient(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return true;
  const exp = getExpFromSignedTokenPayloadFirstSegment(parts[0]);
  if (exp == null) return true;
  return Math.floor(Date.now() / 1000) > exp;
}

export type ParsedModalHoldSession =
  | ModalHoldRecoveryPayloadV1
  | {
      holdId?: string;
      releaseToken?: string | null;
      receiptClaimToken?: string | null;
      experienceId?: string;
    };

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
  if (!token) return null;
  if (receiptClaimTokenIsExpiredClient(token)) return null;
  return token;
}

export function readModalSessionReleaseTokenForHold(holdId: string): string | null {
  const parsed = readModalHoldSessionPayload();
  if (!parsed || parsed.holdId !== holdId) return null;
  const token = typeof parsed.releaseToken === "string" ? parsed.releaseToken.trim() : "";
  return token || null;
}
