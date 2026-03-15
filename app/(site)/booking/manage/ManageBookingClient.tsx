"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import Link from "next/link";
import { cn } from "@/lib/utils";

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
};

function UpdateCardForm({
  token,
  clientSecret,
  onSuccess,
  onCancel,
}: {
  token: string;
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
        confirmParams: { return_url: getManageReturnUrl() },
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
        body: JSON.stringify({ token, paymentMethodId: pmId }),
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setError(null);
    setLoading(true);
    try {
      setStoredManageToken(token);
      const { error: confirmError } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: { return_url: getManageReturnUrl() },
      });
      if (confirmError) {
        setError(confirmError.message ?? "Payment failed");
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
  const [data, setData] = useState<ManageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupClientSecret, setSetupClientSecret] = useState<string | null>(null);
  const [payClientSecret, setPayClientSecret] = useState<string | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [payLoading, setPayLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [payProcessingMessage, setPayProcessingMessage] = useState<string | null>(null);

  useEffect(() => {
    const urlToken = searchParams.get("token");
    if (urlToken) {
      setToken(urlToken);
      setStoredManageToken(urlToken);
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", MANAGE_RETURN_PATH);
      }
      setLoading(true);
      return;
    }
    const stored = getStoredManageToken();
    if (stored) {
      setToken(stored);
      setLoading(true);
      return;
    }
    if (!token) setLoading(false);
  }, [searchParams]);

  const fetchBooking = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    fetch("/api/booking/manage/get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        let body: Record<string, unknown> = {};
        try {
          body = await res.json();
        } catch {}
        if (!res.ok) {
          setError((body.error as string) ?? `Server error ${res.status}`);
          setData(null);
          setStoredManageToken(null);
          return;
        }
        const d = body as { error?: string } & ManageData;
        if (d.error) {
          setError(d.error);
          setData(null);
          setStoredManageToken(null);
        } else {
          setData(d as ManageData);
        }
      })
      .catch(() => {
        setError("Failed to load booking");
        setData(null);
        setStoredManageToken(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (token) fetchBooking();
  }, [token, fetchBooking]);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-brand-bg/30">
        <div className="max-w-md w-full rounded-2xl border border-brand-dark/10 bg-white p-8 shadow-soft text-center">
          <h1 className="text-xl font-bold text-brand-dark mb-2">Invalid link</h1>
          <p className="text-brand-muted mb-6">This manage-booking link is missing or invalid.</p>
          <Link href="/booking" className="text-brand-primary font-medium hover:underline" onClick={() => setStoredManageToken(null)}>
            Back to booking
          </Link>
        </div>
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
          <p className="text-brand-muted mb-6">{error ?? "Invalid or expired link."}</p>
          <Link href="/booking" className="text-brand-primary font-medium hover:underline" onClick={() => setStoredManageToken(null)}>
            Back to booking
          </Link>
        </div>
      </div>
    );
  }

  const statusLabel: Record<string, string> = {
    deposit_paid: "Deposit paid",
    final_due: "Final payment due",
    final_processing: "Final payment processing",
    final_paid: "Fully paid",
    final_requires_action: "Action required",
    final_failed: "Payment failed",
    paid: "Paid",
  };
  const cardLabel = data.card ? `${data.card.brand ?? "Card"} •••• ${data.card.last4 ?? ""}` : "No card on file";

  return (
    <div className="min-h-screen p-6 bg-brand-bg/30">
      <div className="max-w-lg mx-auto rounded-2xl border border-brand-dark/10 bg-white p-6 sm:p-8 shadow-soft">
        <h1 className="text-xl font-bold text-brand-dark mb-1">Manage booking</h1>
        <p className="text-sm text-brand-muted mb-6">Hi {data.customerName ?? "there"}.</p>

        <div className="space-y-4 mb-8">
          <p><strong>Trip date</strong> {data.startDateStr ?? "—"}</p>
          <p><strong>Status</strong> {statusLabel[data.status] ?? data.status}</p>
          <p><strong>Total</strong> ${(data.totalCents / 100).toFixed(2)} (deposit ${(data.depositCents / 100).toFixed(2)} paid)</p>
          <p><strong>Card on file</strong> {cardLabel}</p>
        </div>

        <section className="mb-8">
          <h2 className="text-sm font-semibold text-brand-dark mb-3">Update card</h2>
          {!stripePromise ? (
            <p className="text-sm text-brand-muted">Stripe is not configured.</p>
          ) : setupClientSecret ? (
            <Elements stripe={stripePromise} options={{ clientSecret: setupClientSecret }}>
              <UpdateCardForm
                token={token}
                clientSecret={setupClientSecret}
                onSuccess={() => { setSetupClientSecret(null); fetchBooking(); }}
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
                    const res = await fetch("/api/booking/manage/create-setup-intent", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ token }),
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
        </section>

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
                  onSuccess={() => { setPayClientSecret(null); fetchBooking(); }}
                  onCancel={() => setPayClientSecret(null)}
                />
              </Elements>
            ) : (
              <div>
                <button
                  type="button"
                  onClick={async () => {
                    setPayError(null);
                    setPayProcessingMessage(null);
                    setPayLoading(true);
                    try {
                      const res = await fetch("/api/booking/manage/pay-remaining", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ token }),
                      });
                      const d = await res.json().catch(() => ({})) as { clientSecret?: string; status?: string; error?: string; message?: string };
                      if (!res.ok) {
                        setPayError(d.error ?? `Server error ${res.status}`);
                        return;
                      }
                      if (d.status === "processing") {
                        setPayProcessingMessage(d.message ?? "Your payment is still processing. Please wait a moment and refresh the page to check status.");
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
                  }}
                  disabled={payLoading}
                  className={cn(
                    "rounded-xl bg-brand-primary text-white font-semibold py-2.5 px-4",
                    "hover:bg-brand-primary/90 disabled:opacity-60"
                  )}
                >
                  {payLoading ? "Loading…" : `Pay remaining $${(data.finalCents / 100).toFixed(2)}`}
                </button>
                {payProcessingMessage && (
                  <p className="mt-2 text-sm text-amber-700 bg-amber-50 rounded-lg p-3">
                    {payProcessingMessage}
                    <button
                      type="button"
                      onClick={() => { setPayProcessingMessage(null); fetchBooking(); }}
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
