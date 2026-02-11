"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type DashboardStats = {
  totalRevenueCents: number;
  revenueThisMonthCents: number;
  bookingCount: number;
  customerCount: number;
  listingCount: number;
  recentBookings?: { id: string; createdAt: string; customerEmail: string; totalCents: number; status: string }[];
};

export default function AdminHomePage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/dashboard", { credentials: "include" })
      .then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = d.error ?? "Failed to load";
          const hint = d.hint;
          throw new Error(hint ? `${msg} ${hint}` : msg);
        }
        return d;
      })
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, []);

  function formatCents(cents: number) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">Dashboard</h1>
        <p className="mt-2 text-sm text-brand-muted sm:text-base">Overview of your booking business.</p>
      </div>

      {loading && <div className="py-8 text-brand-muted text-sm">Loading…</div>}
      {error && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 sm:p-5 text-amber-800 text-sm space-y-2">
          <p>{error}</p>
          {(error.includes("Unauthorized") || error.includes("not configured")) && (
            <Link href="/admin/login" className="text-brand-primary hover:underline font-medium">Sign in</Link>
          )}
        </div>
      )}
      {!loading && stats && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
            <Link
              href="/admin/financials"
              className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-5 hover:border-brand-primary/30 transition-colors min-h-[88px] sm:min-h-0 flex flex-col justify-center"
            >
              <p className="text-xs font-medium text-brand-muted uppercase tracking-wide">Revenue (all time)</p>
              <p className="mt-1 text-base font-bold text-brand-dark sm:text-lg">{formatCents(stats.totalRevenueCents)}</p>
            </Link>
            <Link
              href="/admin/financials"
              className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-5 hover:border-brand-primary/30 transition-colors min-h-[88px] sm:min-h-0 flex flex-col justify-center"
            >
              <p className="text-xs font-medium text-brand-muted uppercase tracking-wide">This month</p>
              <p className="mt-1 text-base font-bold text-brand-dark sm:text-lg">{formatCents(stats.revenueThisMonthCents)}</p>
            </Link>
            <Link
              href="/admin/bookings"
              className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-5 hover:border-brand-primary/30 transition-colors min-h-[88px] sm:min-h-0 flex flex-col justify-center"
            >
              <p className="text-xs font-medium text-brand-muted uppercase tracking-wide">Bookings</p>
              <p className="mt-1 text-base font-bold text-brand-dark sm:text-lg">{stats.bookingCount}</p>
            </Link>
            <Link
              href="/admin/customers"
              className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-5 hover:border-brand-primary/30 transition-colors min-h-[88px] sm:min-h-0 flex flex-col justify-center"
            >
              <p className="text-xs font-medium text-brand-muted uppercase tracking-wide">Customers</p>
              <p className="mt-1 text-base font-bold text-brand-dark sm:text-lg">{stats.customerCount}</p>
            </Link>
          </div>

          {stats.recentBookings && stats.recentBookings.length > 0 && (
            <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-brand-dark mb-4 sm:mb-5">Recent bookings</h2>
              <ul className="space-y-2">
                {stats.recentBookings.slice(0, 5).map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-brand-muted">
                      {b.createdAt ? new Date(b.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </span>
                    <span className="text-brand-dark truncate">{b.customerEmail || "—"}</span>
                    <span className="font-medium text-brand-dark">{formatCents(b.totalCents)}</span>
                    <span className={`rounded px-2 py-0.5 text-xs ${b.status === "paid" ? "bg-emerald-100 text-emerald-800" : "bg-brand-dark/10 text-brand-muted"}`}>{b.status}</span>
                  </li>
                ))}
              </ul>
              <Link href="/admin/bookings" className="mt-3 inline-block text-sm font-medium text-brand-primary hover:underline">View all bookings</Link>
            </div>
          )}

          {stats.bookingCount === 0 && stats.listingCount > 0 && (
            <div className="rounded-2xl bg-brand-bg/60 border border-brand-dark/10 p-4 sm:p-6 text-center">
              <p className="text-sm text-brand-muted">No bookings yet. Share your listing link with customers.</p>
              <p className="mt-2 text-xs text-brand-muted">Listings: /experiences/[slug] (e.g. /experiences/pontoon-party)</p>
            </div>
          )}

          <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-brand-dark mb-4 sm:mb-5">Quick actions</h2>
            <div className="flex flex-wrap gap-2 sm:gap-3">
              <Link
                href="/admin/experiences/new"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-primary/90"
              >
                Create listing
              </Link>
              <Link
                href="/admin/experiences"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-brand-dark/20 px-4 py-2.5 text-sm font-medium text-brand-dark hover:bg-brand-bg"
              >
                Listings ({stats.listingCount})
              </Link>
              <Link
                href="/admin/bookings"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-brand-dark/20 px-4 py-2.5 text-sm font-medium text-brand-dark hover:bg-brand-bg"
              >
                View bookings
              </Link>
              <Link
                href="/admin/financials"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-brand-dark/20 px-4 py-2.5 text-sm font-medium text-brand-dark hover:bg-brand-bg"
              >
                Financials
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
