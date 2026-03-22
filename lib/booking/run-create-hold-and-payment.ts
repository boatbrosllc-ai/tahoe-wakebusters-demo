/**
 * Shared create-hold and create-payment-intent flow used by BookingModal (useBookingPayment),
 * ExperienceBookingCard, and InlineBookingDetailsStep so behaviour stays in sync.
 * Call `runCreateHold` first, then `runCreatePaymentIntentForHold` (e.g. in useEffect) so Stripe
 * Elements can mount as soon as the hold exists while the PaymentIntent is created in the background.
 */

import type { MutableRefObject } from "react";
import { isRetryableCreateHold503Code } from "@/lib/booking/create-hold-errors";

export interface CreateHoldAndPaymentParams {
  experienceId: string;
  boatId?: string;
  slotId: string;
  rateId: string;
  partySize: number;
  petsCount?: number;
  addonSelections: { addonId: string; qty: number }[];
  customerDraft: { name: string; email: string; phone: string };
  marketingOptIn?: boolean;
  answers?: Record<string, string>;
  tipCents?: number;
  discountCode?: string;
  bookingMode: "shared" | "charter";
  resumeHoldId?: string;
  /** Dedupes rapid double-submit for shared-ticketed create-hold. */
  holdRequestId?: string;
}

/** Successful create-hold only (before PaymentIntent). */
export type CreateHoldOnlySuccess = {
  ok: true;
  holdId: string;
  releaseToken: string | null;
  expiresAt: string | null;
  pricing: Record<string, unknown> | null;
  /** From create-hold: discount after server-computed subtotal (reconciles UI vs hold). */
  holdDiscountCents?: number;
  holdDiscountCode?: string;
};

export interface CreateHoldAndPaymentSuccess {
  ok: true;
  holdId: string;
  releaseToken: string | null;
  expiresAt: string | null;
  pricing: Record<string, unknown> | null;
  clientSecret: string;
  /** Signed claim token for /booking/success?receipt_token= (3DS return_url). */
  receiptClaimToken?: string;
  paymentIntentId: string | null;
  /** Server-resolved payFullAmount (may differ from client when deposit is disabled). */
  payFullAmount?: boolean;
  depositCents?: number;
  totalCents?: number;
  finalCents?: number;
  expiresAtFromIntent?: string;
  holdDiscountCents?: number;
  holdDiscountCode?: string;
}

export interface CreateHoldAndPaymentError {
  ok: false;
  status: number;
  error: string;
  /** From create-hold JSON when present (e.g. hold_request_payload_mismatch, slot_unavailable). */
  code?: string;
  /** Support reference from create-hold (503/500); same value as server `incidentId`. */
  incidentId?: string;
  /** True when create-hold returned 503 with a retryable code (after bounded retries exhausted). */
  retryable503?: boolean;
  hint?: string;
  holdId?: string;
  releaseToken?: string | null;
  /** From create-hold when hold exists but payment-intent step failed (for release + expiry UI). */
  holdExpiresAt?: string | null;
  /** True when the request aborted due to a bounded client timeout. */
  isTimeout?: boolean;
  /** True when the browser reported a network-level failure (e.g. connection refused, offline). */
  isNetworkError?: boolean;
}

export type RunCreateHoldOptions = {
  /**
   * After create-hold succeeds, set this so the next attempt sends resumeHoldId even if
   * create-payment-intent fails (avoids 409 from an active hold with no resume id).
   */
  persistHoldForResume?: MutableRefObject<{ slotId: string; holdId: string } | null>;
};

export type CreateHoldOnlyResult = CreateHoldOnlySuccess | CreateHoldAndPaymentError;
export type PaymentIntentCreateSuccess = Omit<CreateHoldAndPaymentSuccess, "ok"> & { ok: true };
export type PaymentIntentCreateResult = PaymentIntentCreateSuccess | CreateHoldAndPaymentError;
export type CreateHoldAndPaymentResult = CreateHoldAndPaymentSuccess | CreateHoldAndPaymentError;

const CREATE_HOLD_RETRY_MAX_ATTEMPTS = 3;
const CREATE_HOLD_RETRY_DELAYS_MS = [400, 1200] as const;
/** Bounded wait for each create-hold / create-payment-intent request so the modal cannot hang indefinitely. */
const CREATE_HOLD_FETCH_TIMEOUT_MS = 45_000;
const CREATE_PAYMENT_INTENT_FETCH_TIMEOUT_MS = 45_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mergeAbortSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (typeof AbortSignal !== "undefined" && "any" in AbortSignal && typeof AbortSignal.any === "function") {
    return AbortSignal.any([a, b]);
  }
  return b;
}

function timeoutAbortSignal(ms: number): AbortSignal {
  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const timeoutSig = timeoutAbortSignal(timeoutMs);
  const userSig = init.signal;
  const signal = userSig ? mergeAbortSignals(userSig, timeoutSig) : timeoutSig;
  return fetch(url, { ...init, signal });
}

function isAbortOrTimeoutError(e: unknown): boolean {
  return e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
}

/** Maps browser fetch failures (offline, dev server stopped, CORS) to actionable copy. */
function formatClientFetchFailure(e: unknown): string {
  if (e instanceof TypeError && e.message === "Failed to fetch") {
    return "Could not reach the server. Check your connection and try again.";
  }
  if (isAbortOrTimeoutError(e)) {
    return "Request timed out. Check your connection and try again.";
  }
  return e instanceof Error ? e.message : "Something went wrong";
}

async function readJsonBody<T extends Record<string, unknown>>(res: Response): Promise<{ ok: true; data: T } | { ok: false }> {
  try {
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch {
    return { ok: false };
  }
}

type CreateHoldJson = {
  error?: string;
  hint?: string;
  code?: string;
  incidentId?: string;
  incidentCode?: string;
  holdId?: string;
  releaseToken?: string;
  expiresAt?: string;
  pricing?: unknown;
  discountCents?: unknown;
  discountCode?: unknown;
};

function parseIncidentId(data: CreateHoldJson): string | undefined {
  if (typeof data.incidentId === "string" && data.incidentId.trim()) return data.incidentId.trim();
  if (typeof data.incidentCode === "string" && data.incidentCode.trim()) return data.incidentCode.trim();
  return undefined;
}

function buildCreateHoldRequestBody(params: CreateHoldAndPaymentParams): string {
  return JSON.stringify({
    experienceId: params.experienceId,
    ...(params.boatId && { boatId: params.boatId }),
    slotId: params.slotId,
    rateId: params.rateId,
    partySize: params.partySize,
    petsCount: params.petsCount ?? 0,
    addonSelections: params.addonSelections,
    customerDraft: params.customerDraft,
    marketingOptIn: params.marketingOptIn ?? false,
    answers: params.answers ?? {},
    ...(params.tipCents != null && params.tipCents > 0 && { tipCents: params.tipCents }),
    ...(params.discountCode && params.discountCode.trim() && { discountCode: params.discountCode.trim() }),
    bookingMode: params.bookingMode,
    ...(params.resumeHoldId && { resumeHoldId: params.resumeHoldId }),
    ...(params.holdRequestId && { holdRequestId: params.holdRequestId }),
  });
}

/**
 * POST /api/booking/create-hold only. Use `runCreatePaymentIntentForHold` afterward so the UI can
 * show the Stripe step while the PaymentIntent is created.
 */
export async function runCreateHold(
  params: CreateHoldAndPaymentParams,
  runOptions?: RunCreateHoldOptions
): Promise<CreateHoldOnlyResult> {
  const holdBody = buildCreateHoldRequestBody(params);
  let holdRes!: Response;
  let holdData!: CreateHoldJson;
  for (let attempt = 0; attempt < CREATE_HOLD_RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      holdRes = await fetchWithTimeout(
        "/api/booking/create-hold",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: holdBody,
        },
        CREATE_HOLD_FETCH_TIMEOUT_MS
      );
    } catch (e) {
      return {
        ok: false,
        status: 0,
        error: formatClientFetchFailure(e),
        isTimeout: isAbortOrTimeoutError(e),
        isNetworkError: e instanceof TypeError && e.message === "Failed to fetch",
      };
    }
    const holdParsed = await readJsonBody<CreateHoldJson>(holdRes);
    if (!holdParsed.ok) {
      return {
        ok: false,
        status: holdRes.status,
        error:
          holdRes.status >= 500
            ? "The server returned an unexpected response. Please try again in a moment."
            : "Could not read the server response. Please try again.",
      };
    }
    holdData = holdParsed.data;
    if (holdRes.ok) break;
    const retryable =
      holdRes.status === 503 &&
      isRetryableCreateHold503Code(holdData.code) &&
      attempt < CREATE_HOLD_RETRY_MAX_ATTEMPTS - 1;
    if (retryable) {
      await sleep(CREATE_HOLD_RETRY_DELAYS_MS[attempt] ?? 1200);
      continue;
    }
    break;
  }

  if (!holdRes.ok) {
    const incidentId = parseIncidentId(holdData);
    const retryable503 = holdRes.status === 503 && isRetryableCreateHold503Code(holdData.code);
    return {
      ok: false,
      status: holdRes.status,
      error: holdData.error ?? "Failed to create hold",
      ...(typeof holdData.code === "string" && holdData.code ? { code: holdData.code } : {}),
      ...(incidentId ? { incidentId } : {}),
      ...(retryable503 ? { retryable503: true } : {}),
      hint: holdData.hint,
    };
  }
  const holdId = holdData.holdId as string;
  const releaseToken = holdData.releaseToken ?? null;
  if (runOptions?.persistHoldForResume && holdId) {
    runOptions.persistHoldForResume.current = { slotId: params.slotId, holdId };
  }
  const expiresAt = typeof holdData.expiresAt === "string" ? holdData.expiresAt : null;
  const pricing =
    holdData.pricing && typeof holdData.pricing === "object" && !Array.isArray(holdData.pricing)
      ? (holdData.pricing as Record<string, unknown>)
      : null;
  const holdDiscountCents = typeof (holdData as { discountCents?: unknown }).discountCents === "number"
    ? (holdData as { discountCents: number }).discountCents
    : undefined;
  const holdDiscountCode =
    typeof (holdData as { discountCode?: unknown }).discountCode === "string"
      ? (holdData as { discountCode: string }).discountCode
      : undefined;

  return {
    ok: true,
    holdId,
    releaseToken,
    expiresAt,
    pricing,
    ...(holdDiscountCents !== undefined ? { holdDiscountCents } : {}),
    ...(holdDiscountCode !== undefined ? { holdDiscountCode } : {}),
  };
}

export type RunPaymentIntentParams = {
  holdId: string;
  payFullAmount: boolean;
  releaseToken: string | null;
};

/**
 * POST /api/booking/create-payment-intent after a successful create-hold.
 */
export async function runCreatePaymentIntentForHold(
  params: RunPaymentIntentParams
): Promise<PaymentIntentCreateResult> {
  const { holdId, payFullAmount, releaseToken } = params;
  const expiresAtFromHold: string | null = null;
  try {
    let intentRes: Response;
    try {
      intentRes = await fetchWithTimeout(
        "/api/booking/create-payment-intent",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            holdId,
            payFullAmount,
            ...(releaseToken ? { release_token: releaseToken } : {}),
          }),
        },
        CREATE_PAYMENT_INTENT_FETCH_TIMEOUT_MS
      );
    } catch (e) {
      return {
        ok: false,
        status: 0,
        error: formatClientFetchFailure(e),
        holdId,
        releaseToken,
        holdExpiresAt: expiresAtFromHold,
        isTimeout: isAbortOrTimeoutError(e),
        isNetworkError: e instanceof TypeError && e.message === "Failed to fetch",
      };
    }
    const intentParsed = await readJsonBody<Record<string, unknown>>(intentRes);
    if (!intentParsed.ok) {
      return {
        ok: false,
        status: intentRes.status,
        error:
          intentRes.status >= 500
            ? "The server returned an unexpected response. Please try again in a moment."
            : "Could not read the payment response. Please try again.",
        holdId,
        releaseToken,
        holdExpiresAt: expiresAtFromHold,
      };
    }
    const intentData = intentParsed.data;
    if (!intentRes.ok) {
      return {
        ok: false,
        status: intentRes.status,
        error: typeof intentData.error === "string" ? intentData.error : "Failed to start payment",
        hint: typeof intentData.hint === "string" ? intentData.hint : undefined,
        holdId,
        releaseToken,
        holdExpiresAt: expiresAtFromHold,
      };
    }
    const clientSecret = intentData.clientSecret;
    if (!clientSecret || typeof clientSecret !== "string") {
      return {
        ok: false,
        status: 500,
        error: "Payment intent missing client secret",
        holdId,
        releaseToken,
        holdExpiresAt: expiresAtFromHold,
      };
    }
    return {
      ok: true,
      holdId,
      releaseToken,
      expiresAt: null,
      pricing: null,
      clientSecret,
      ...(typeof intentData.receiptClaimToken === "string" && intentData.receiptClaimToken.trim()
        ? { receiptClaimToken: intentData.receiptClaimToken.trim() }
        : {}),
      paymentIntentId: typeof intentData.paymentIntentId === "string" ? intentData.paymentIntentId : null,
      payFullAmount: typeof intentData.payFullAmount === "boolean" ? intentData.payFullAmount : undefined,
      depositCents: typeof intentData.depositCents === "number" ? intentData.depositCents : undefined,
      totalCents: typeof intentData.totalCents === "number" ? intentData.totalCents : undefined,
      finalCents: typeof intentData.finalCents === "number" ? intentData.finalCents : undefined,
      expiresAtFromIntent: typeof intentData.expiresAt === "string" ? intentData.expiresAt : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: formatClientFetchFailure(err),
      holdId,
      releaseToken,
      holdExpiresAt: expiresAtFromHold,
      isTimeout: isAbortOrTimeoutError(err),
      isNetworkError: err instanceof TypeError && err.message === "Failed to fetch",
    };
  }
}

/**
 * Run create-hold then create-payment-intent (sequential). Prefer `runCreateHold` + `runCreatePaymentIntentForHold`
 * for faster perceived checkout on cold starts.
 */
export async function runCreateHoldAndPaymentIntent(
  params: CreateHoldAndPaymentParams,
  payFullAmount: boolean,
  runOptions?: RunCreateHoldOptions
): Promise<CreateHoldAndPaymentResult> {
  const holdResult = await runCreateHold(params, runOptions);
  if (!holdResult.ok) return holdResult;

  const piResult = await runCreatePaymentIntentForHold({
    holdId: holdResult.holdId,
    payFullAmount,
    releaseToken: holdResult.releaseToken,
  });
  if (!piResult.ok) {
    return {
      ...piResult,
      holdExpiresAt: holdResult.expiresAt ?? piResult.holdExpiresAt,
    };
  }

  return {
    ok: true,
    holdId: holdResult.holdId,
    releaseToken: holdResult.releaseToken,
    expiresAt: holdResult.expiresAt,
    pricing: holdResult.pricing,
    clientSecret: piResult.clientSecret,
    ...(piResult.receiptClaimToken ? { receiptClaimToken: piResult.receiptClaimToken } : {}),
    paymentIntentId: piResult.paymentIntentId,
    payFullAmount: piResult.payFullAmount,
    depositCents: piResult.depositCents,
    totalCents: piResult.totalCents,
    finalCents: piResult.finalCents,
    expiresAtFromIntent: piResult.expiresAtFromIntent,
    ...(holdResult.holdDiscountCents !== undefined ? { holdDiscountCents: holdResult.holdDiscountCents } : {}),
    ...(holdResult.holdDiscountCode !== undefined ? { holdDiscountCode: holdResult.holdDiscountCode } : {}),
  };
}

/**
 * Release a hold (e.g. on cancel or error). Best-effort; safe to call without token for admin flows.
 */
export async function releaseHold(holdId: string, releaseToken: string | null): Promise<void> {
  try {
    await fetch("/api/booking/release-hold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holdId, ...(releaseToken && { release_token: releaseToken }) }),
    });
  } catch {
    // best-effort
  }
}
