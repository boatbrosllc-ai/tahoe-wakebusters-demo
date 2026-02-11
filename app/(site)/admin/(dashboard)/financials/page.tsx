"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type FinancialsData = {
  totalRevenueCents: number;
  revenueThisMonthCents: number;
  revenueInRangeCents?: number;
  recent: { id: string; createdAt: string; customerEmail: string; totalCents: number; status: string; experienceName?: string }[];
  byExperience: { experienceId: string; experienceName: string; revenueCents: number; bookingCount: number }[];
};

export default function AdminFinancialsPage() {
  const [data, setData] = useState<FinancialsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const fetchFinancials = useCallback(() => {
    const params = new URLSearchParams();
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    const qs = params.toString();
    const url = qs ? `/api/admin/financials?${qs}` : "/api/admin/financials";
    return fetch(url, { credentials: "include" });
  }, [fromDate, toDate]);

  useEffect(() => {
    fetchFinancials()
      .then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = d.error ?? "Failed to load";
          const hint = d.hint;
          throw new Error(hint ? `${msg} ${hint}` : msg);
        }
        return d;
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [fetchFinancials]);

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

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 sm:mb-8">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">Financials</h1>
          <p className="mt-1 text-sm text-brand-muted">Revenue and recent transactions from paid bookings.</p>
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
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
        <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 min-h-[88px] sm:min-h-0 flex flex-col justify-center">
          <p className="text-sm font-medium text-brand-muted">Total revenue (all time)</p>
          <p className="mt-2 text-xl font-bold text-brand-dark sm:text-2xl">{formatCents(data.totalRevenueCents)}</p>
        </div>
        <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 min-h-[88px] sm:min-h-0 flex flex-col justify-center">
          <p className="text-sm font-medium text-brand-muted">Revenue this month</p>
          <p className="mt-2 text-xl font-bold text-brand-dark sm:text-2xl">{formatCents(data.revenueThisMonthCents)}</p>
        </div>
        {data.revenueInRangeCents !== undefined && (
          <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 min-h-[88px] sm:min-h-0 flex flex-col justify-center">
            <p className="text-sm font-medium text-brand-muted">Revenue in selected range</p>
            <p className="mt-2 text-xl font-bold text-brand-dark sm:text-2xl">{formatCents(data.revenueInRangeCents)}</p>
          </div>
        )}
      </div>

      {data.byExperience && data.byExperience.length > 0 && (
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
                {data.byExperience.map((row) => (
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
        {data.recent.length === 0 ? (
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
                {data.recent.map((r) => (
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

      <p className="text-xs text-brand-muted pt-2">
        For payouts, disputes, and full Stripe data, use your{" "}
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
