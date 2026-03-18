/**
 * Shared create-hold + create-payment-intent sequence used by BookingModal (useBookingPayment),
 * ExperienceBookingCard, and InlineBookingDetailsStep so behaviour stays in sync.
 * Callers build the params and handle success/error (UI, cache invalidation, etc.).
 */

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
}

export interface CreateHoldAndPaymentSuccess {
  ok: true;
  holdId: string;
  releaseToken: string | null;
  expiresAt: string | null;
  pricing: Record<string, unknown> | null;
  clientSecret: string;
  paymentIntentId: string | null;
  /** Server-resolved payFullAmount (may differ from client when deposit is disabled). */
  payFullAmount?: boolean;
  depositCents?: number;
  totalCents?: number;
  finalCents?: number;
  expiresAtFromIntent?: string;
}

export interface CreateHoldAndPaymentError {
  ok: false;
  status: number;
  error: string;
  hint?: string;
  holdId?: string;
  releaseToken?: string | null;
}

export type CreateHoldAndPaymentResult = CreateHoldAndPaymentSuccess | CreateHoldAndPaymentError;

/**
 * Run create-hold then create-payment-intent. On success returns payload for the caller to set state.
 * On failure returns ok: false with status/error/hint so callers can show messages or handle 409.
 * If create-hold succeeds but create-payment-intent fails or throws, result includes holdId/releaseToken so caller can release.
 */
export async function runCreateHoldAndPaymentIntent(
  params: CreateHoldAndPaymentParams,
  payFullAmount: boolean
): Promise<CreateHoldAndPaymentResult> {
  let holdId: string | undefined;
  let releaseToken: string | null = null;
  const holdRes = await fetch("/api/booking/create-hold", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
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
    }),
  });
  const holdData = await holdRes.json();
  if (!holdRes.ok) {
    return {
      ok: false,
      status: holdRes.status,
      error: holdData.error ?? "Failed to create hold",
      hint: holdData.hint,
    };
  }
  holdId = holdData.holdId as string;
  releaseToken = holdData.releaseToken ?? null;
  const expiresAt = typeof holdData.expiresAt === "string" ? holdData.expiresAt : null;
  const pricing = holdData.pricing && typeof holdData.pricing === "object" ? holdData.pricing : null;

  try {
    const intentRes = await fetch("/api/booking/create-payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holdId, payFullAmount }),
    });
    const intentData = await intentRes.json();
    if (!intentRes.ok) {
      return {
        ok: false,
        status: intentRes.status,
        error: intentData.error ?? "Failed to start payment",
        hint: intentData.hint,
        holdId,
        releaseToken,
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
      };
    }
    return {
      ok: true,
      holdId,
      releaseToken,
      expiresAt,
      pricing,
      clientSecret,
      paymentIntentId: intentData.paymentIntentId ?? null,
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
      error: err instanceof Error ? err.message : "Something went wrong",
      holdId,
      releaseToken,
    };
  }
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
