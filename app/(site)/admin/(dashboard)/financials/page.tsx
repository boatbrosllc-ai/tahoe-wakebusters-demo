"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type StripeData = {
  balanceAvailableCents: number;
  balancePendingCents: number;
  currency: string;
  recentTransactions: { id: string; amount: number; net: number; fee: number; created: number; type: string; description?: string }[];
  stripeError?: string;
} | null;

type FinancialsData = {
  totalRevenueCents: number;
  revenueThisMonthCents: number;
  revenueInRangeCents?: number;
  paidBookingCount?: number;
  totalBookingCount?: number;
  recent: { id: string; createdAt: string; customerEmail: string; totalCents: number; status: string; experienceName?: string }[];
  byExperience: { experienceId: string; experienceName: string; revenueCents: number; bookingCount: number }[];
  stripe?: StripeData;
};

export default function AdminFinancialsPage() {
  const [data, setData] = useState<FinancialsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [syncPiId, setSyncPiId] = useState("");
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchFinancials = useCallback(async () => {
    const params = new URLSearchParams();
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    const qs = params.toString();
    const url = qs ? `/api/admin/financials?${qs}` : "/api/admin/financials";
    const res = await fetch(url, { credentials: "include" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = d.error ?? "Failed to load";
      const hint = d.hint;
      throw new Error(hint ? `${msg} ${hint}` : msg);
    }
    return d as FinancialsData;
  }, [fromDate, toDate]);

  const loadFinancials = useCallback(() => {
    setError(null);
    setLoading(true);
    fetchFinancials()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [fetchFinancials]);

  useEffect(() => {
    loadFinancials();
  }, [loadFinancials]);

  async function handleSyncStripePayment() {
    const id = syncPiId.trim();
    if (!id || !id.startsWith("pi_")) {
      setSyncMessage({ type: "error", text: "Enter a valid Payment Intent ID (starts with pi_)" });
      return;
    }
    setSyncMessage(null);
    setSyncLoading(true);
    try {
      const res = await fetch("/api/admin/sync-stripe-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ paymentIntentId: id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const hint = (json as { hint?: string }).hint;
        setSyncMessage({
          type: "error",
          text: [json.error, hint].filter(Boolean).join(" "),
        });
        return;
      }
      const msg = (json as { message?: string; bookingId?: string; alreadyConverted?: boolean }).message;
      setSyncMessage({ type: "success", text: msg ?? "Done." });
      setSyncPiId("");
      loadFinancials();
    } catch (e) {
      setSyncMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setSyncLoading(false);
    }
  }

  function formatCents(cents: number) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  }

  function formatDate(iso: string) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  if (loading) {
    return (
      <div>
        <div className="py-8 text-center text-brand-muted text-sm">Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="rounded-2xl bg-red-50 border border-red-200 p-4 sm:p-6 text-red-700 text-sm">
          {error}
          <Link href="/admin/login" className="ml-2 text-brand-primary hover:underline">Sign in</Link>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const recent = Array.isArray(data.recent) ? data.recent : [];
  const byExperience = Array.isArray(data.byExperience) ? data.byExperience : [];
  const totalRevenueCents = typeof data.totalRevenueCents === "number" ? data.totalRevenueCents : 0;
  const revenueThisMonthCents = typeof data.revenueThisMonthCents === "number" ? data.revenueThisMonthCents : 0;

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 sm:mb-8">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">Financials</h1>
          <p className="mt-1 text-sm text-brand-muted">
            Revenue and recent transactions from paid bookings in Firestore.
            {totalRevenueCents === 0 && (data.paidBookingCount ?? 0) === 0 && (
              <span className="block mt-2 text-amber-700">
                Showing $0 because there are no paid bookings yet. Complete a test payment (or ensure{" "}
                <Link href="/admin/bookings" className="text-brand-primary hover:underline">Admin → Bookings</Link>
                {" "}shows your completed payments). Revenue is created when a booking is saved after Stripe checkout.
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="fin-from" className="text-sm font-medium text-brand-dark">From</label>
            <input
              id="fin-from"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="min-h-[44px] rounded-lg border border-brand-dark/20 px-3 py-2.5 text-sm text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary sm:min-h-0"
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="fin-to" className="text-sm font-medium text-brand-dark">To</label>
            <input
              id="fin-to"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="min-h-[44px] rounded-lg border border-brand-dark/20 px-3 py-2.5 text-sm text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary sm:min-h-0"
            />
          </div>
          <button
            type="button"
            onClick={() => loadFinancials()}
            className="rounded-lg border border-brand-dark/20 bg-white px-4 py-2.5 text-sm font-medium text-brand-dark hover:bg-brand-bg focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-1"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
        <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 min-h-[88px] sm:min-h-0 flex flex-col justify-center">
          <p className="text-sm font-medium text-brand-muted">Total revenue (all time)</p>
          <p className="mt-2 text-xl font-bold text-brand-dark sm:text-2xl">{formatCents(totalRevenueCents)}</p>
        </div>
        <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 min-h-[88px] sm:min-h-0 flex flex-col justify-center">
          <p className="text-sm font-medium text-brand-muted">Revenue this month</p>
          <p className="mt-2 text-xl font-bold text-brand-dark sm:text-2xl">{formatCents(revenueThisMonthCents)}</p>
        </div>
        {data.revenueInRangeCents !== undefined && (
          <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 min-h-[88px] sm:min-h-0 flex flex-col justify-center">
            <p className="text-sm font-medium text-brand-muted">Revenue in selected range</p>
            <p className="mt-2 text-xl font-bold text-brand-dark sm:text-2xl">{formatCents(data.revenueInRangeCents)}</p>
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-brand-dark border-b border-brand-dark/10 pb-3 mb-4">
          Sync a Stripe payment
        </h2>
        <p className="text-sm text-brand-muted mb-4">
          If a payment succeeded in Stripe but no booking appears here, paste the Payment Intent ID (e.g.{" "}
          <code className="bg-brand-bg px-1 rounded text-xs">pi_3SzmmbIYQB2nYanl1CRz5bAL</code>) from Stripe → Payments
          and click Sync. This creates the booking in Firestore so revenue and the transaction list update. Only works if
          the hold still exists (holds expire after 10 minutes).
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="sync-pi-id" className="sr-only">
              Payment Intent ID
            </label>
            <input
              id="sync-pi-id"
              type="text"
              placeholder="pi_..."
              value={syncPiId}
              onChange={(e) => setSyncPiId(e.target.value)}
              className="w-full rounded-lg border border-brand-dark/20 px-3 py-2.5 text-sm text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            />
          </div>
          <button
            type="button"
            onClick={handleSyncStripePayment}
            disabled={syncLoading}
            className="rounded-lg bg-brand-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-1 disabled:opacity-60"
          >
            {syncLoading ? "Syncing…" : "Sync"}
          </button>
        </div>
        {syncMessage && (
          <p
            className={`mt-3 text-sm ${syncMessage.type === "success" ? "text-green-700" : "text-red-700"}`}
            role="alert"
          >
            {syncMessage.text}
          </p>
        )}
      </div>

      {byExperience.length > 0 && (
        <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 overflow-hidden">
          <h2 className="px-4 py-4 sm:px-6 border-b border-brand-dark/10 text-lg font-semibold text-brand-dark">
            By experience
          </h2>
          <div className="overflow-x-auto -mx-px">
            <table className="w-full min-w-[400px] text-sm">
              <thead>
                <tr className="border-b border-brand-dark/10 bg-brand-bg/50">
                  <th className="px-3 py-3 sm:px-4 sm:py-4 text-left font-medium text-brand-dark">Experience</th>
                  <th className="px-3 py-3 sm:px-4 sm:py-4 text-right font-medium text-brand-dark">Revenue</th>
                  <th className="px-3 py-3 sm:px-4 sm:py-4 text-right font-medium text-brand-dark">Bookings</th>
                </tr>
              </thead>
              <tbody>
                {byExperience.map((row) => (
                  <tr key={row.experienceId} className="border-b border-brand-dark/5 hover:bg-brand-bg/30">
                    <td className="px-3 py-3 sm:px-4 sm:py-4 text-brand-dark">{row.experienceName}</td>
                    <td className="px-3 py-3 sm:px-4 sm:py-4 text-right font-medium text-brand-dark whitespace-nowrap">
                      {formatCents(row.revenueCents)}
                    </td>
                    <td className="px-3 py-3 sm:px-4 sm:py-4 text-right text-brand-muted">{row.bookingCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 overflow-hidden">
        <h2 className="px-4 py-4 sm:px-6 border-b border-brand-dark/10 text-lg font-semibold text-brand-dark">
          Recent transactions
        </h2>
        {recent.length === 0 ? (
          <div className="p-6 sm:p-8 text-center text-brand-muted text-sm">No transactions yet.</div>
        ) : (
          <div className="overflow-x-auto -mx-px">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-brand-dark/10 bg-brand-bg/50">
                  <th className="px-3 py-3 sm:px-4 sm:py-4 text-left font-medium text-brand-dark">Date</th>
                  <th className="px-3 py-3 sm:px-4 sm:py-4 text-left font-medium text-brand-dark">Experience</th>
                  <th className="px-3 py-3 sm:px-4 sm:py-4 text-left font-medium text-brand-dark">Customer</th>
                  <th className="px-3 py-3 sm:px-4 sm:py-4 text-right font-medium text-brand-dark">Amount</th>
                  <th className="px-3 py-3 sm:px-4 sm:py-4 text-left font-medium text-brand-dark">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id} className="border-b border-brand-dark/5 hover:bg-brand-bg/30">
                    <td className="px-3 py-3 sm:px-4 sm:py-4 text-brand-muted whitespace-nowrap">{formatDate(r.createdAt)}</td>
                    <td className="px-3 py-3 sm:px-4 sm:py-4 text-brand-dark">{r.experienceName ?? "—"}</td>
                    <td className="px-3 py-3 sm:px-4 sm:py-4 text-brand-dark break-all">{r.customerEmail || "—"}</td>
                    <td className="px-3 py-3 sm:px-4 sm:py-4 text-right font-medium text-brand-dark whitespace-nowrap">
                      {formatCents(r.totalCents)}
                    </td>
                    <td className="px-3 py-3 sm:px-4 sm:py-4">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.status === "paid"
                            ? "bg-green-100 text-green-800"
                            : r.status === "canceled"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data.stripe != null ? (
        <>
          <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-brand-dark border-b border-brand-dark/10 pb-3 mb-4">
              Stripe balance
            </h2>
            {data.stripe.stripeError ? (
              <p className="text-sm text-amber-700">Stripe: {data.stripe.stripeError}</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-brand-muted">Available</p>
                  <p className="text-xl font-bold text-brand-dark mt-1">
                    {formatCents(data.stripe.balanceAvailableCents)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-brand-muted">Pending</p>
                  <p className="text-xl font-bold text-brand-dark mt-1">
                    {formatCents(data.stripe.balancePendingCents)}
                  </p>
                </div>
              </div>
            )}
          </div>
          {data.stripe.recentTransactions?.length > 0 && !data.stripe.stripeError && (
            <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 overflow-hidden">
              <h2 className="px-4 py-4 sm:px-6 border-b border-brand-dark/10 text-lg font-semibold text-brand-dark">
                Recent Stripe activity
              </h2>
              <div className="overflow-x-auto -mx-px">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-brand-dark/10 bg-brand-bg/50">
                      <th className="px-3 py-3 sm:px-4 sm:py-4 text-left font-medium text-brand-dark">Date</th>
                      <th className="px-3 py-3 sm:px-4 sm:py-4 text-left font-medium text-brand-dark">Type</th>
                      <th className="px-3 py-3 sm:px-4 sm:py-4 text-right font-medium text-brand-dark">Amount</th>
                      <th className="px-3 py-3 sm:px-4 sm:py-4 text-right font-medium text-brand-dark">Net</th>
                      <th className="px-3 py-3 sm:px-4 sm:py-4 text-right font-medium text-brand-dark">Fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.stripe.recentTransactions.map((t) => (
                      <tr key={t.id} className="border-b border-brand-dark/5 hover:bg-brand-bg/30">
                        <td className="px-3 py-3 sm:px-4 sm:py-4 text-brand-muted whitespace-nowrap">
                          {new Date(t.created * 1000).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-3 py-3 sm:px-4 sm:py-4 text-brand-dark">{t.type}</td>
                        <td className="px-3 py-3 sm:px-4 sm:py-4 text-right font-medium text-brand-dark whitespace-nowrap">
                          {formatCents(t.amount)}
                        </td>
                        <td className="px-3 py-3 sm:px-4 sm:py-4 text-right text-brand-dark whitespace-nowrap">
                          {formatCents(t.net)}
                        </td>
                        <td className="px-3 py-3 sm:px-4 sm:py-4 text-right text-brand-muted whitespace-nowrap">
                          {formatCents(t.fee)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-brand-dark border-b border-brand-dark/10 pb-3 mb-4">
            Stripe balance
          </h2>
          <p className="text-sm text-brand-muted">
            Stripe data is not loaded. Set <code className="bg-brand-bg px-1 rounded text-xs">STRIPE_SECRET_KEY</code> in
            your environment and refresh to see balance and activity.
          </p>
        </div>
      )}

      <p className="text-xs text-brand-muted pt-2">
        Revenue above is from your Firestore bookings. Stripe balance and activity are from your Stripe account. For
        payouts, disputes, and full history, use your{" "}
        <a
          href="https://dashboard.stripe.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-primary hover:underline"
        >
          Stripe Dashboard
        </a>
        .
      </p>
    </div>
  );
}
