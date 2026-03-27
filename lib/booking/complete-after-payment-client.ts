"use client";

/**
 * Client-side complete-after-payment flow with processing (HTTP 202) polling.
 * Shared by BookingStripeReturnHandler and BookingModal for consistent UX.
 */

import { siteConfig } from "@/config/site";
import { invalidateBookingCaches } from "@/lib/booking/booking-data-cache";

export const COMPLETE_AFTER_POLL_INITIAL_INTERVAL_MS = 3000;
export const COMPLETE_AFTER_POLL_MAX_INTERVAL_MS = 15_000;
export const COMPLETE_AFTER_POLL_HARD_TIMEOUT_DEFAULT_MS = 300_000;
/** Initial POST and single-shot retries use this bound so a stalled server cannot spin forever. */
export const COMPLETE_AFTER_PAYMENT_FETCH_TIMEOUT_MS = 30_000;
/** @deprecated Use COMPLETE_AFTER_PAYMENT_FETCH_TIMEOUT_MS */
export const COMPLETE_AFTER_INITIAL_FETCH_TIMEOUT_MS = COMPLETE_AFTER_PAYMENT_FETCH_TIMEOUT_MS;

export const COMPLETE_AFTER_PAYMENT_STALLED_MESSAGE =
  "Your payment was received — we are confirming your booking. You will receive a confirmation email shortly.";

function triggerRollbackPendingReconcileHint(body: {
  paymentIntentId: string;
  holdId?: string;
  receiptClaimToken?: string | null;
}): void {
  const token = body.receiptClaimToken?.trim();
  const holdId = body.holdId?.trim();
  void fetch("/api/booking/trigger-reconcile-rollback-pending-holds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      paymentIntentId: body.paymentIntentId,
      ...(holdId ? { holdId } : {}),
      ...(token ? { receipt_claim_token: token } : {}),
    }),
  }).catch(() => {});
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

/**
 * Single POST /api/booking/complete-after-payment with a 30s timeout (merged with optional caller signal).
 * Use for retry flows in InlineBookingDetailsStep, ExperienceBookingCard, and BookingSuccessPanel.
 */
export async function postCompleteAfterPaymentWithTimeout(
  body: { paymentIntentId: string; holdId?: string; receiptClaimToken?: string | null },
  signal?: AbortSignal
): Promise<Response> {
  const timeoutSig = timeoutAbortSignal(COMPLETE_AFTER_PAYMENT_FETCH_TIMEOUT_MS);
  const merged = signal ? mergeAbortSignals(signal, timeoutSig) : timeoutSig;
  const token = body.receiptClaimToken?.trim();
  const holdId = body.holdId?.trim();
  return fetch("/api/booking/complete-after-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      paymentIntentId: body.paymentIntentId,
      ...(holdId ? { holdId } : {}),
      ...(token ? { receipt_claim_token: token } : {}),
    }),
    signal: merged,
  });
}

function isAbortOrTimeout(e: unknown): boolean {
  return e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
}

/**
 * Shared “try again” POST after payment succeeded but confirmation failed. Returns JSON body on success path.
 * On timeout/abort, returns { ok: false, stallTimeout: true } so callers can show COMPLETE_AFTER_PAYMENT_STALLED_MESSAGE.
 */
export async function retryCompleteAfterPaymentOnce(options: {
  holdId?: string | null;
  paymentIntentId: string;
  receiptClaimToken?: string | null;
  signal?: AbortSignal;
}): Promise<
  | { ok: true; res: Response; data: Record<string, unknown> }
  | { ok: false; stallTimeout: true; message: string }
  | { ok: false; stallTimeout: false; error: string }
> {
  const { holdId, paymentIntentId, receiptClaimToken, signal } = options;
  try {
    const res = await postCompleteAfterPaymentWithTimeout(
      { holdId: holdId ?? undefined, paymentIntentId, receiptClaimToken },
      signal
    );
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: true, res, data };
  } catch (e) {
    if (isAbortOrTimeout(e)) {
      return { ok: false, stallTimeout: true, message: COMPLETE_AFTER_PAYMENT_STALLED_MESSAGE };
    }
    return {
      ok: false,
      stallTimeout: false,
      error: e instanceof Error ? e.message : "Request failed",
    };
  }
}

/** `AbortSignal.any` + timeout, with fallback when `any` is unavailable. */
export function completeAfterInitialFetchSignal(abortController: AbortController): AbortSignal {
  if (typeof AbortSignal !== "undefined" && "any" in AbortSignal && typeof AbortSignal.any === "function") {
    return AbortSignal.any([abortController.signal, AbortSignal.timeout(COMPLETE_AFTER_PAYMENT_FETCH_TIMEOUT_MS)]);
  }
  const combined = new AbortController();
  const onAbort = () => {
    if (!combined.signal.aborted) combined.abort();
  };
  const timeoutId = setTimeout(onAbort, COMPLETE_AFTER_PAYMENT_FETCH_TIMEOUT_MS);
  abortController.signal.addEventListener(
    "abort",
    () => {
      clearTimeout(timeoutId);
      onAbort();
    },
    { once: true },
  );
  return combined.signal;
}

export type CompleteAfterPaymentSuccessPayload = {
  success: true;
  bookingId?: string | null;
  receiptClaimToken?: string | null;
  receiptToken?: string | null;
  experienceId?: string;
  paymentSummary?: {
    isDeposit?: boolean;
    depositCents?: number;
    totalCents?: number;
    finalCents?: number;
  };
  message?: string;
  alreadyConverted?: boolean;
  /** True when a pending refund row exists for discount limit exceeded */
  discountLimitExceeded?: boolean;
  /** When receipt token cannot be signed, server returns booking summary for the success UI */
  degradedConfirmation?: {
    bookingId: string;
    startDateStr?: string;
  };
};

export type CompleteAfterPaymentClientOutcome =
  | { kind: "success"; data: CompleteAfterPaymentSuccessPayload }
  | {
      kind: "reconciliation_pending";
      message: string;
      experienceId?: string;
    }
  | {
      kind: "terminal_error";
      message: string;
      holdExpired?: boolean;
      status: number;
    }
  | { kind: "processing_timeout"; message: string; pollHardTimeoutMs?: number; experienceId?: string }
  | { kind: "aborted" }
  | { kind: "fetch_error"; message: string; isAbort: boolean }
  | { kind: "stall_timeout"; message: string; pollHardTimeoutMs?: number; experienceId?: string };

function parseJsonSafe<T>(res: Response): Promise<T> {
  return res.json().catch(() => ({} as T));
}

type CompleteAfterJson = {
  success?: boolean;
  error?: string;
  processing?: boolean;
  pollHardTimeoutMs?: number;
  reconciliationPending?: boolean;
  holdExpired?: boolean;
  message?: string;
  bookingId?: string;
  receiptClaimToken?: string;
  receiptToken?: string;
  experienceId?: string;
  alreadyConverted?: boolean;
  paymentSummary?: CompleteAfterPaymentSuccessPayload["paymentSummary"];
  discountLimitExceeded?: boolean;
  degradedConfirmation?: CompleteAfterPaymentSuccessPayload["degradedConfirmation"];
};

function pollFetchSignal(parent: AbortSignal): AbortSignal {
  const t = timeoutAbortSignal(COMPLETE_AFTER_PAYMENT_FETCH_TIMEOUT_MS);
  return mergeAbortSignals(parent, t);
}

/**
 * POST /api/booking/complete-after-payment with bounded polling when `processing === true` (incl. HTTP 202).
 */
export async function completeAfterPaymentWithPolling(options: {
  paymentIntentId: string;
  holdId?: string | null;
  /** Optional signed claim; if omitted, server verifies via holdId + PaymentIntent metadata. */
  receiptClaimToken?: string | null;
  signal: AbortSignal;
  /** Called once when the server reports payment still processing (HTTP 202 / `processing: true`) before polling begins. */
  onEnteredProcessing?: () => void;
}): Promise<CompleteAfterPaymentClientOutcome> {
  const { paymentIntentId, holdId, receiptClaimToken, signal, onEnteredProcessing } = options;
  const token = receiptClaimToken?.trim();
  const holdIdTrim = holdId?.trim();
  const body = JSON.stringify({
    paymentIntentId,
    ...(holdIdTrim ? { holdId: holdIdTrim } : {}),
    ...(token ? { receipt_claim_token: token } : {}),
  });

  const abortController = new AbortController();
  const onParentAbort = () => {
    if (!abortController.signal.aborted) abortController.abort();
  };
  if (signal.aborted) {
    return { kind: "aborted" };
  }
  signal.addEventListener("abort", onParentAbort, { once: true });

  const initialSignal = completeAfterInitialFetchSignal(abortController);

  let res: Response;
  try {
    res = await fetch("/api/booking/complete-after-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: initialSignal,
    });
  } catch (e) {
    signal.removeEventListener("abort", onParentAbort);
    const isAbort = e instanceof Error && e.name === "AbortError";
    const isTimeout = e instanceof Error && e.name === "TimeoutError";
    if (isAbort || isTimeout) {
      return {
        kind: "stall_timeout",
        message: COMPLETE_AFTER_PAYMENT_STALLED_MESSAGE,
        pollHardTimeoutMs: COMPLETE_AFTER_POLL_HARD_TIMEOUT_DEFAULT_MS,
      };
    }
    return {
      kind: "fetch_error",
      message: e instanceof Error ? e.message : "Request failed",
      isAbort: false,
    };
  }

  let json = (await parseJsonSafe<CompleteAfterJson>(res)) as CompleteAfterJson;
  let experienceIdInitial =
    typeof json.experienceId === "string" && json.experienceId.trim() ? json.experienceId.trim() : undefined;

  const isProcessing =
    json?.processing === true || (res.status === 202 && json?.processing !== false);
  /** Server may return 200 + reconciliationPending while webhook/cron finishes conversion — keep polling like processing. */
  const isReconciliationPending =
    res.ok && json?.reconciliationPending === true && json?.success !== true;
  const shouldPollForConfirmation = isProcessing || isReconciliationPending;

  if (shouldPollForConfirmation) {
    onEnteredProcessing?.();
    if (isReconciliationPending && !isProcessing) {
      triggerRollbackPendingReconcileHint({
        paymentIntentId,
        holdId: holdIdTrim,
        receiptClaimToken: token,
      });
    }
    const pollStart = Date.now();
    const rawPollLimit =
      typeof json.pollHardTimeoutMs === "number" && json.pollHardTimeoutMs >= 1000
        ? json.pollHardTimeoutMs
        : COMPLETE_AFTER_POLL_HARD_TIMEOUT_DEFAULT_MS;
    const hardLimitMs = Math.min(
      COMPLETE_AFTER_POLL_HARD_TIMEOUT_DEFAULT_MS,
      Number.isFinite(rawPollLimit) ? rawPollLimit : COMPLETE_AFTER_POLL_HARD_TIMEOUT_DEFAULT_MS
    );
    let pollIntervalMs = COMPLETE_AFTER_POLL_INITIAL_INTERVAL_MS;
    let firstReconciliationPoll = isReconciliationPending && !isProcessing;

    for (;;) {
      if (signal.aborted) {
        signal.removeEventListener("abort", onParentAbort);
        return { kind: "aborted" };
      }
      if (Date.now() - pollStart > hardLimitMs) {
        signal.removeEventListener("abort", onParentAbort);
        if (experienceIdInitial) invalidateBookingCaches(experienceIdInitial);
        triggerRollbackPendingReconcileHint({
          paymentIntentId,
          holdId: holdIdTrim,
          receiptClaimToken: token,
        });
        return {
          kind: "processing_timeout",
          message:
            "Your payment went through, but confirmation is taking longer than usual. Tap “Try again” below—we’ll keep trying. You can also check your email; if nothing arrives within 15 minutes, contact us with the email you used to book.",
          pollHardTimeoutMs: hardLimitMs,
          experienceId: experienceIdInitial,
        };
      }
      if (!firstReconciliationPoll) {
        await new Promise<void>((r) => setTimeout(r, pollIntervalMs));
        pollIntervalMs = Math.min(COMPLETE_AFTER_POLL_MAX_INTERVAL_MS, pollIntervalMs * 2);
      } else {
        firstReconciliationPoll = false;
      }
      if (signal.aborted) {
        signal.removeEventListener("abort", onParentAbort);
        return { kind: "aborted" };
      }

      let pollRes: Response;
      try {
        pollRes = await fetch("/api/booking/complete-after-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: pollFetchSignal(signal),
        });
      } catch (e) {
        signal.removeEventListener("abort", onParentAbort);
        const isAbort = e instanceof Error && e.name === "AbortError";
        const isTimeout = e instanceof Error && e.name === "TimeoutError";
        if (isAbort || isTimeout) {
          if (experienceIdInitial) invalidateBookingCaches(experienceIdInitial);
          return {
            kind: "stall_timeout",
            message: COMPLETE_AFTER_PAYMENT_STALLED_MESSAGE,
            pollHardTimeoutMs: hardLimitMs,
            experienceId: experienceIdInitial,
          };
        }
        return {
          kind: "fetch_error",
          message: e instanceof Error ? e.message : "Request failed",
          isAbort: false,
        };
      }

      if (pollRes.status === 429) {
        const ra = pollRes.headers.get("Retry-After");
        const sec = ra != null ? parseInt(ra, 10) : NaN;
        const waitMs = Number.isFinite(sec) && sec >= 0 ? sec * 1000 : 5000;
        await new Promise<void>((r) => setTimeout(r, waitMs));
        continue;
      }

      const pollJson = (await parseJsonSafe<CompleteAfterJson>(pollRes)) as CompleteAfterJson;

      if (pollJson?.processing === true || pollRes.status === 202) {
        continue;
      }

      if (pollRes.ok && pollJson?.reconciliationPending === true && pollJson?.success !== true) {
        const expPoll =
          typeof pollJson.experienceId === "string" && pollJson.experienceId.trim()
            ? pollJson.experienceId.trim()
            : undefined;
        if (expPoll) {
          experienceIdInitial = experienceIdInitial ?? expPoll;
          invalidateBookingCaches(expPoll);
        }
        continue;
      }

      if (pollRes.ok && pollJson?.success === true) {
        signal.removeEventListener("abort", onParentAbort);
        const experienceIdOk =
          typeof pollJson.experienceId === "string" && pollJson.experienceId.trim()
            ? pollJson.experienceId.trim()
            : undefined;
        if (experienceIdOk) invalidateBookingCaches(experienceIdOk);
        return {
          kind: "success",
          data: {
            success: true,
            bookingId: pollJson.bookingId ?? null,
            receiptClaimToken: pollJson.receiptClaimToken ?? null,
            receiptToken: pollJson.receiptToken ?? null,
            experienceId: experienceIdOk,
            paymentSummary: pollJson.paymentSummary,
            message: typeof pollJson.message === "string" ? pollJson.message : undefined,
            alreadyConverted: pollJson.alreadyConverted,
            discountLimitExceeded: pollJson.discountLimitExceeded === true,
            degradedConfirmation: pollJson.degradedConfirmation,
          },
        };
      }

      signal.removeEventListener("abort", onParentAbort);
      const isHoldExpired = !!(pollJson && pollJson.holdExpired);
      const msg =
        isHoldExpired
          ? "We've received your payment. Your booking is being confirmed and you'll receive a confirmation email shortly. If you don't see it, check your spam or contact us."
          : (pollJson && typeof pollJson.error === "string" && pollJson.error)
            ? pollJson.error
            : "We couldn't confirm your booking. Please check your email for next steps.";
      return {
        kind: "terminal_error",
        message: msg,
        holdExpired: isHoldExpired,
        status: pollRes.status,
      };
    }
  }

  signal.removeEventListener("abort", onParentAbort);

  if (res.ok && json?.success === true) {
    const experienceIdOk =
      typeof json.experienceId === "string" && json.experienceId.trim() ? json.experienceId.trim() : undefined;
    if (experienceIdOk) invalidateBookingCaches(experienceIdOk);
    return {
      kind: "success",
      data: {
        success: true,
        bookingId: json.bookingId ?? null,
        receiptClaimToken: json.receiptClaimToken ?? null,
        receiptToken: json.receiptToken ?? null,
        experienceId: experienceIdOk,
        paymentSummary: json.paymentSummary,
        message: typeof json.message === "string" ? json.message : undefined,
        alreadyConverted: json.alreadyConverted,
        discountLimitExceeded: json.discountLimitExceeded === true,
        degradedConfirmation: json.degradedConfirmation,
      },
    };
  }

  const isHoldExpired = !!(json && json.holdExpired);
  const msg =
    isHoldExpired
      ? "We've received your payment. Your booking is being confirmed and you'll receive a confirmation email shortly. If you don't see it, check your spam or contact us."
      : (json && typeof json.error === "string" && json.error)
        ? json.error
        : "We couldn't confirm your booking. Please check your email for next steps.";
  return {
    kind: "terminal_error",
    message: msg,
    holdExpired: isHoldExpired,
    status: res.status,
  };
}
