"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";
import { formatMoneyNonNegative } from "@/lib/booking/format-money";

const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
const stripePromise = STRIPE_PUBLISHABLE_KEY ? loadStripe(STRIPE_PUBLISHABLE_KEY) : null;

const MANAGE_RETURN_PATH = "/booking/manage";
const MANAGE_BOOKING_TOKEN_KEY = "manage-booking-token";

function getStoredManageToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(MANAGE_BOOKING_TOKEN_KEY);
  } catch {
    return null;
  }
}

function setStoredManageToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token == null) sessionStorage.removeItem(MANAGE_BOOKING_TOKEN_KEY);
    else sessionStorage.setItem(MANAGE_BOOKING_TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}


/** Only clear the stored token when the server proves the link is wrong — not on network/5xx blips. */
function shouldClearStoredManageToken(status: number, errorMessage: string): boolean {
  if (status === 401 || status === 403 || status === 404) return true;
  if (status === 400 && errorMessage.toLowerCase().includes("missing token")) return true;
  if (status === 400 && errorMessage.toLowerCase().includes("customeremail")) return true;
  return false;
}

/** Decode base64url payload (first segment of token) to get exp. UX pre-check only; server remains authoritative. */
function getExpFromTokenPayload(payloadB64: string): number | null {
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

function getManageReturnUrl(token?: string): string {
  if (typeof window === "undefined") return "";
  const base = `${window.location.origin}${MANAGE_RETURN_PATH}`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

type ManageData = {
  bookingId: string;
  customerName: string;
  startDateStr: string | null;
  pricing: { totalCents: number; currency: string };
  status: string;
  finalChargeAt: string | null;
  depositCents: number;
  finalCents: number;
  totalCents: number;
  card: { brand?: string; last4?: string; expMonth?: number; expYear?: number } | null;
  canPayRemaining: boolean;
  paymentMethodOnFile?: boolean;
};

function UpdateCardForm({
  token,
  customerEmail,
  clientSecret,
  onSuccess,
  onCancel,
}: {
  token: string;
  customerEmail: string;
  clientSecret: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setError(null);
    setLoading(true);
    try {
      setStoredManageToken(token);
      const result = (await stripe.confirmSetup({
        elements,
        clientSecret,
        confirmParams: { return_url: getManageReturnUrl(token) },
      })) as { error?: { message?: string }; setupIntent?: { payment_method?: string | { id?: string } } };
      if (result.error) {
        setError(result.error.message ?? "Setup failed");
        setLoading(false);
        return;
      }
      const si = result.setupIntent;
      const pmId = si && (typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id);
      if (!pmId) {
        setError("No payment method returned");
        setLoading(false);
        return;
      }
      const attachRes = await fetch("/api/booking/manage/attach-payment-method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, paymentMethodId: pmId, customerEmail }),
      });
      if (!attachRes.ok) {
        const d = await attachRes.json().catch(() => ({}));
        setError((d as { error?: string }).error ?? "Failed to save card");
        setLoading(false);
        return;
      }
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!stripe || loading}
          className={cn(
            "rounded-xl bg-brand-primary text-white font-semibold py-2.5 px-4",
            "hover:bg-brand-primary/90 disabled:opacity-60"
          )}
        >
          {loading ? "Saving…" : "Save new card"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="rounded-xl border border-brand-dark/20 px-4 py-2.5 font-medium text-brand-dark hover:bg-brand-dark/5"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function PayRemainingForm({
  token,
  finalCents,
  clientSecret,
  onSuccess,
  onCancel,
}: {
  token: string;
  finalCents: number;
  clientSecret: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitInFlightRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    setError(null);
    setLoading(true);
    try {
      setStoredManageToken(token);
      const { error: confirmError } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: { return_url: getManageReturnUrl(token) },
      });
      if (confirmError) {
        setError(confirmError.message ?? "Payment failed");
        return;
      }
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      submitInFlightRef.current = false;
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!stripe || loading}
          className={cn(
            "rounded-xl bg-brand-primary text-white font-semibold py-2.5 px-4",
            "hover:bg-brand-primary/90 disabled:opacity-60"
          )}
        >
          {loading ? "Processing…" : `Pay $${(finalCents / 100).toFixed(2)}`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="rounded-xl border border-brand-dark/20 px-4 py-2.5 font-medium text-brand-dark hover:bg-brand-dark/5"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ManageBookingClient() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState<string | null>(null);
  const [manageCustomerEmail, setManageCustomerEmail] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailGateError, setEmailGateError] = useState<string | null>(null);
  const [data, setData] = useState<ManageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tokenExpired, setTokenExpired] = useState(false);
  const [setupClientSecret, setSetupClientSecret] = useState<string | null>(null);
  const [payClientSecret, setPayClientSecret] = useState<string | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [payLoading, setPayLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [payProcessingMessage, setPayProcessingMessage] = useState<string | null>(null);
  const [verifyingFinalPayment, setVerifyingFinalPayment] = useState(false);
  const [finalPaymentVerifyMessage, setFinalPaymentVerifyMessage] = useState<string | null>(null);
  const [pendingStripeReturnVerify, setPendingStripeReturnVerify] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  useEffect(() => {
    const redirectStatus = searchParams.get("redirect_status");
    const paymentIntentUrl = searchParams.get("payment_intent");
    const stripeReturnVerify =
      redirectStatus === "succeeded" &&
      typeof paymentIntentUrl === "string" &&
      paymentIntentUrl.length > 0;

    const urlToken = searchParams.get("token");
    const raw = urlToken ?? getStoredManageToken();
    if (raw) {
      const parts = raw.split(".");
      const exp = parts.length >= 1 ? getExpFromTokenPayload(parts[0]) : null;
      if (exp !== null && Date.now() / 1000 > exp) {
        setStoredManageToken(null);
        setToken(null);
        setTokenExpired(true);
        setLoading(false);
        return;
      }
      setTokenExpired(false);
      setToken(raw);
      setManageCustomerEmail(null);
      if (urlToken) {
        setStoredManageToken(urlToken);
      }
      if (stripeReturnVerify) {
        setPendingStripeReturnVerify(true);
      }
      if (typeof window !== "undefined") {
        const u = new URL(window.location.href);
        u.searchParams.delete("token");
        u.searchParams.delete("redirect_status");
        u.searchParams.delete("payment_intent");
        u.searchParams.delete("payment_intent_client_secret");
        const next = u.pathname + (u.search && u.search !== "?" ? u.search : "");
        // Removing the token from the visible URL reduces accidental leakage via referrers and shared links.
        // This does not protect against tokens captured before this effect runs (e.g. other scripts, extensions, or pre-navigation logging).
        window.history.replaceState({}, "", next || MANAGE_RETURN_PATH);
      }
      setLoading(true);
      return;
    }
    setToken(null);
    setLoading(false);
  }, [searchParams]);

  const fetchBooking = useCallback(
    async (opts?: { silent?: boolean; customerEmail?: string }): Promise<ManageData | null> => {
      if (!token) return null;
      if (!opts?.silent) setLoading(true);
      setError(null);
      try {
        const email = opts?.customerEmail ?? manageCustomerEmail;
        if (!email) return null;
        const res = await fetch("/api/booking/manage/get", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token, customerEmail: email }),
        });
        let body: Record<string, unknown> = {};
        try {
          body = await res.json();
        } catch {
          /* ignore */
        }
        const errText = typeof body.error === "string" ? body.error : "";
        if (!res.ok) {
          const msg = errText || `Server error (${res.status})`;
          setError(msg);
          setData(null);
          if (shouldClearStoredManageToken(res.status, msg)) {
            setStoredManageToken(null);
          }
          return null;
        }
        const d = body as { error?: string } & ManageData;
        if (d.error) {
          setError(d.error);
          setData(null);
          if (/invalid|expired|not found|not valid for this booking/i.test(d.error)) {
            setStoredManageToken(null);
            setManageCustomerEmail(null);
          }
          return null;
        }
        setData(d as ManageData);
        return d as ManageData;
      } catch {
        setError("Failed to load booking. Check your connection and try again.");
        setData(null);
        return null;
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [token, manageCustomerEmail]
  );

  const startFinalPaidPoll = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setVerifyingFinalPayment(true);
    setFinalPaymentVerifyMessage("Payment received! Verifying your booking status…");
    let elapsedSec = 0;
    const tick = async () => {
      const d = await fetchBooking({ silent: true });
      if (unmountedRef.current) return;
      if (d?.status === "final_paid") {
        setVerifyingFinalPayment(false);
        setFinalPaymentVerifyMessage(null);
        return;
      }
      elapsedSec += 3;
      if (elapsedSec >= 30) {
        if (unmountedRef.current) return;
        setVerifyingFinalPayment(false);
        setFinalPaymentVerifyMessage(
          "Your payment was received. Your booking status will be updated shortly."
        );
        return;
      }
      if (unmountedRef.current) return;
      pollTimerRef.current = setTimeout(() => void tick(), 3000);
    };
    void tick();
  }, [fetchBooking]);

  const requestPayRemaining = useCallback(
    async (skipSavedPaymentMethod: boolean) => {
      if (!token) return;
      setPayError(null);
      setPayProcessingMessage(null);
      setPayLoading(true);
      try {
        if (!manageCustomerEmail) return;
        const res = await fetch("/api/booking/manage/pay-remaining", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token, skipSavedPaymentMethod, customerEmail: manageCustomerEmail }),
        });
        const d = await res.json().catch(() => ({})) as {
          clientSecret?: string;
          status?: string;
          error?: string;
          message?: string;
        };
        if (!res.ok) {
          setPayError(d.error ?? `Server error ${res.status}`);
          return;
        }
        if (d.status === "succeeded") {
          void fetchBooking({ silent: true });
          startFinalPaidPoll();
          return;
        }
        if (d.status === "processing") {
          setPayProcessingMessage(
            d.message ??
              "Your payment is still processing. Please wait a moment and refresh the page to check status."
          );
          return;
        }
        if (d.clientSecret) {
          setPayClientSecret(d.clientSecret);
        } else {
          setPayError(d.error ?? "No payment form available");
        }
      } catch (e) {
        setPayError(e instanceof Error ? e.message : "Failed");
      } finally {
        setPayLoading(false);
      }
    },
    [token, manageCustomerEmail, fetchBooking, startFinalPaidPoll]
  );

  useEffect(() => {
    return () => {
      unmountedRef.current = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (token && manageCustomerEmail) void fetchBooking();
  }, [token, manageCustomerEmail, fetchBooking]);

  useEffect(() => {
    if (!pendingStripeReturnVerify || !data || !token) return;
    if (data.status === "final_paid") {
      setPendingStripeReturnVerify(false);
      return;
    }
    setPendingStripeReturnVerify(false);
    startFinalPaidPoll();
  }, [data, pendingStripeReturnVerify, token, startFinalPaidPoll]);

  if (tokenExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-brand-bg/30">
        <div className="max-w-md w-full rounded-2xl border border-brand-dark/10 bg-white p-8 shadow-soft text-center">
          <h1 className="text-xl font-bold text-brand-dark mb-2">Link expired</h1>
          <p className="text-brand-muted mb-6">This manage link has expired. Please use the latest link from your email or contact us.</p>
          <Link href="/experiences" className="text-brand-primary font-medium hover:underline">
            Back to experiences
          </Link>
        </div>
      </div>
    );
  }

  if (!token && !loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-brand-bg/30">
        <div className="max-w-md w-full rounded-2xl border border-brand-dark/10 bg-white p-8 shadow-soft text-center">
          <h1 className="text-xl font-bold text-brand-dark mb-2">Invalid link</h1>
          <p className="text-brand-muted mb-6">This manage-booking link is missing or invalid.</p>
          <Link
            href="/experiences"
            className="text-brand-primary font-medium hover:underline"
            onClick={() => {
              setStoredManageToken(null);
            }}
          >
            Back to experiences
          </Link>
        </div>
      </div>
    );
  }

  if (token && !manageCustomerEmail && !tokenExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-brand-bg/30">
        <form
          className="max-w-md w-full rounded-2xl border border-brand-dark/10 bg-white p-8 shadow-soft"
          onSubmit={(e) => {
            e.preventDefault();
            const em = emailDraft.trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
              setEmailGateError("Enter a valid email address.");
              return;
            }
            setEmailGateError(null);
            setManageCustomerEmail(em);
          }}
        >
          <h1 className="text-xl font-bold text-brand-dark mb-2">Confirm your email</h1>
          <p className="text-sm text-brand-muted mb-4">
            Enter the email address you used for this booking to open your manage link.
          </p>
          <label className="block text-sm font-medium text-brand-dark mb-1" htmlFor="manage-email">
            Email
          </label>
          <input
            id="manage-email"
            type="email"
            autoComplete="email"
            value={emailDraft}
            onChange={(e) => setEmailDraft(e.target.value)}
            className="w-full rounded-xl border border-brand-dark/20 px-3 py-2 mb-4 text-brand-dark"
            required
          />
          {emailGateError && <p className="text-sm text-red-600 mb-4">{emailGateError}</p>}
          <button
            type="submit"
            className="rounded-xl bg-brand-primary text-white font-semibold py-2.5 px-4 w-full hover:bg-brand-primary/90"
          >
            Continue
          </button>
        </form>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-brand-bg/30">
        <div className="text-brand-muted">Loading…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-brand-bg/30">
        <div className="max-w-md w-full rounded-2xl border border-brand-dark/10 bg-white p-8 shadow-soft text-center">
          <h1 className="text-xl font-bold text-brand-dark mb-2">Unable to load booking</h1>
          <p className="text-brand-muted mb-6">{error ?? "Invalid link or server error."}</p>
          <div className="flex flex-col gap-3 items-center">
            <button
              type="button"
              onClick={() => void fetchBooking()}
              className={cn(
                "rounded-xl bg-brand-primary text-white font-semibold py-2.5 px-4",
                "hover:bg-brand-primary/90"
              )}
            >
              Retry
            </button>
            <p className="text-sm text-brand-muted">
              Need help? Call us at{" "}
              <a href={`tel:${siteConfig.phoneTel}`} className="text-brand-primary font-medium hover:underline">
                {siteConfig.phone}
              </a>
            </p>
            <Link
              href="/experiences"
              className="text-brand-primary font-medium hover:underline"
              onClick={() => {
                setStoredManageToken(null);
              }}
            >
              Back to experiences
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!token) return null;

  const isDepositFlow = ["final_due", "final_processing", "final_paid", "final_requires_action", "final_failed"].includes(
    data.status
  );

  const statusLabel: Record<string, string> = {
    final_due: "Final payment due",
    final_processing: "Final payment processing",
    final_paid: "Fully paid",
    final_requires_action: "Action required",
    final_failed: "Payment failed",
    paid: "Paid",
  };
  const cardLabel = data.card ? `${data.card.brand ?? "Card"} •••• ${data.card.last4 ?? ""}` : "No card on file";

  const ACTIVE_STATUSES = ["paid", "final_due", "final_failed", "final_requires_action", "final_processing"];
  const showUpdateCardSection = ACTIVE_STATUSES.includes(data.status);
  const isFullyPaid = data.status === "final_paid";
  const hideCardSection = data.status === "canceled" || data.status === "refunded";

  return (
    <div className="min-h-screen p-6 bg-brand-bg/30">
      <div className="max-w-lg mx-auto rounded-2xl border border-brand-dark/10 bg-white p-6 sm:p-8 shadow-soft">
        <h1 className="text-xl font-bold text-brand-dark mb-1">Manage booking</h1>
        <p className="text-sm text-brand-muted mb-6">Hi {data.customerName ?? "there"}.</p>

        {(verifyingFinalPayment || finalPaymentVerifyMessage) && (
          <div
            className={cn(
              "mb-6 rounded-xl border px-4 py-3 text-sm",
              verifyingFinalPayment
                ? "border-brand-primary/30 bg-brand-primary/5 text-brand-dark"
                : "border-amber-200 bg-amber-50 text-amber-900"
            )}
            role="status"
            aria-live="polite"
          >
            {verifyingFinalPayment && (
              <div className="flex items-center gap-2">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" aria-hidden />
                <span>{finalPaymentVerifyMessage ?? "Verifying…"}</span>
              </div>
            )}
            {!verifyingFinalPayment && finalPaymentVerifyMessage && <p>{finalPaymentVerifyMessage}</p>}
          </div>
        )}

        <div className="space-y-4 mb-8">
          <p><strong>Trip date</strong> {data.startDateStr ?? "—"}</p>
          <p><strong>Status</strong> {statusLabel[data.status] ?? data.status}</p>
          <p>
            <strong>Total</strong> ${(data.totalCents / 100).toFixed(2)}
            {data.status === "paid"
              ? null
              : isDepositFlow && data.depositCents > 0
                ? ` (deposit ${formatMoneyNonNegative(data.depositCents)} paid)`
                : null}
          </p>
          <p><strong>Card on file</strong> {cardLabel}</p>
        </div>

        {!hideCardSection && (
        <section className="mb-8">
          {showUpdateCardSection ? (
          <>
          <h2 className="text-sm font-semibold text-brand-dark mb-3">Update card</h2>
          {!stripePromise ? (
            <p className="text-sm text-brand-muted">Stripe is not configured.</p>
          ) : setupClientSecret ? (
            <Elements stripe={stripePromise} options={{ clientSecret: setupClientSecret }}>
              <UpdateCardForm
                token={token}
                customerEmail={manageCustomerEmail ?? ""}
                clientSecret={setupClientSecret}
                onSuccess={() => { setSetupClientSecret(null); void fetchBooking(); }}
                onCancel={() => setSetupClientSecret(null)}
              />
            </Elements>
          ) : (
            <div>
              <button
                type="button"
                onClick={async () => {
                  setSetupError(null);
                  setSetupLoading(true);
                  try {
                    if (!manageCustomerEmail) return;
                    const res = await fetch("/api/booking/manage/create-setup-intent", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      credentials: "include",
                      body: JSON.stringify({ token, customerEmail: manageCustomerEmail }),
                    });
                    if (!res.ok) {
                      let errBody: Record<string, unknown> = {};
                      try {
                        errBody = await res.json();
                      } catch {}
                      setSetupError((errBody.error as string) ?? `Server error ${res.status}`);
                      return;
                    }
                    const d = await res.json();
                    setSetupClientSecret((d as { clientSecret: string }).clientSecret);
                  } catch (e) {
                    setSetupError(e instanceof Error ? e.message : "Failed");
                  } finally {
                    setSetupLoading(false);
                  }
                }}
                disabled={setupLoading}
                className={cn(
                  "rounded-xl bg-brand-primary text-white font-semibold py-2.5 px-4",
                  "hover:bg-brand-primary/90 disabled:opacity-60"
                )}
              >
                {setupLoading ? "Loading…" : "Update card"}
              </button>
              {setupError && <p className="mt-2 text-sm text-red-600">{setupError}</p>}
            </div>
          )}
          </>
          ) : isFullyPaid ? (
            <p className="text-sm text-brand-muted">Your booking is fully paid — no card update needed.</p>
          ) : null}
        </section>
        )}

        {data.canPayRemaining && (
          <section>
            <h2 className="text-sm font-semibold text-brand-dark mb-3">Pay remaining balance</h2>
            <p className="text-sm text-brand-muted mb-3">Remaining: ${(data.finalCents / 100).toFixed(2)}</p>
            {!stripePromise ? (
              <p className="text-sm text-brand-muted">Stripe is not configured.</p>
            ) : payClientSecret ? (
              <Elements stripe={stripePromise} options={{ clientSecret: payClientSecret }}>
                <PayRemainingForm
                  token={token}
                  finalCents={data.finalCents}
                  clientSecret={payClientSecret}
                  onSuccess={() => {
                    setPayClientSecret(null);
                    startFinalPaidPoll();
                  }}
                  onCancel={() => setPayClientSecret(null)}
                />
              </Elements>
            ) : (
              <div>
                {data.paymentMethodOnFile ? (
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <button
                      type="button"
                      onClick={() => void requestPayRemaining(false)}
                      disabled={payLoading}
                      className={cn(
                        "rounded-xl bg-brand-primary text-white font-semibold py-2.5 px-4",
                        "hover:bg-brand-primary/90 disabled:opacity-60"
                      )}
                    >
                      {payLoading ? "Loading…" : "Charge my saved card"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void requestPayRemaining(true)}
                      disabled={payLoading}
                      className="rounded-xl border border-brand-dark/20 px-4 py-2.5 font-medium text-brand-dark hover:bg-brand-dark/5 disabled:opacity-60"
                    >
                      Use a different card
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void requestPayRemaining(false)}
                    disabled={payLoading}
                    className={cn(
                      "rounded-xl bg-brand-primary text-white font-semibold py-2.5 px-4",
                      "hover:bg-brand-primary/90 disabled:opacity-60"
                    )}
                  >
                    {payLoading ? "Loading…" : `Pay remaining $${(data.finalCents / 100).toFixed(2)}`}
                  </button>
                )}
                {payProcessingMessage && (
                  <p className="mt-2 text-sm text-amber-700 bg-amber-50 rounded-lg p-3">
                    {payProcessingMessage}
                    <button
                      type="button"
                      onClick={() => {
                        setPayProcessingMessage(null);
                        void fetchBooking();
                      }}
                      className="ml-2 font-medium text-amber-800 hover:underline"
                    >
                      Refresh status
                    </button>
                  </p>
                )}
                {payError && <p className="mt-2 text-sm text-red-600">{payError}</p>}
              </div>
            )}
          </section>
        )}

        <p className="mt-8 text-center">
          <Link href="/" className="text-brand-primary font-medium hover:underline" onClick={() => setStoredManageToken(null)}>
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
