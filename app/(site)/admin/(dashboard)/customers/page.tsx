"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type CustomerItem = {
  email: string;
  name: string;
  phone: string;
  bookingCount: number;
  lastBookingAt: string | null;
  totalSpentCents: number;
};

export default function AdminCustomersPage() {
  const [list, setList] = useState<CustomerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/customers", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error ?? "Failed to load";
        const hint = data.hint;
        throw new Error(hint ? `${msg} ${hint}` : msg);
      }
      const rows = Array.isArray(data) ? data : Array.isArray(data.customers) ? data.customers : [];
      setList(rows as CustomerItem[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  function formatDate(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function formatCents(cents: number) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  }

  const filtered = search.trim()
    ? list.filter(
        (c) =>
          c.email.toLowerCase().includes(search.toLowerCase()) ||
          c.name.toLowerCase().includes(search.toLowerCase())
      )
    : list;

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">Customers</h1>
        <p className="mt-1 text-sm text-brand-muted">People who have booked. Search by name or email.</p>
      </div>

      <div className="mb-4">
        <input
          type="search"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-h-[44px] w-full max-w-sm rounded-lg border border-brand-dark/20 px-3 py-2.5 text-sm text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
          aria-label="Search customers"
        />
      </div>

      <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 overflow-hidden">
        {loading && <div className="p-6 sm:p-8 text-center text-brand-muted text-sm">Loading…</div>}
        {error && (
          <div className="p-4 sm:p-6 text-red-600 bg-red-50 border-b border-red-200 text-sm flex flex-wrap items-center justify-between gap-2">
            <span>
              {error}
              <Link href="/admin/login" className="ml-2 text-brand-primary hover:underline">
                Sign in
              </Link>
            </span>
            <button
              type="button"
              onClick={() => void loadCustomers()}
              className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-100 min-h-[44px]"
            >
              Retry
            </button>
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="p-6 sm:p-8 text-center text-brand-muted text-sm">
            {search.trim() ? "No customers match your search." : "No customers yet."}
          </div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto -mx-px">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-brand-dark/10 bg-brand-bg/50">
                    <th className="px-3 py-3 sm:px-4 sm:py-4 text-left font-medium text-brand-dark">Name</th>
                    <th className="px-3 py-3 sm:px-4 sm:py-4 text-left font-medium text-brand-dark">Email</th>
                    <th className="px-3 py-3 sm:px-4 sm:py-4 text-left font-medium text-brand-dark hidden sm:table-cell">Phone</th>
                    <th className="px-3 py-3 sm:px-4 sm:py-4 text-center font-medium text-brand-dark">Bookings</th>
                    <th className="px-3 py-3 sm:px-4 sm:py-4 text-right font-medium text-brand-dark">Total spent</th>
                    <th className="px-3 py-3 sm:px-4 sm:py-4 text-left font-medium text-brand-dark hidden md:table-cell">Last booking</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.email} className="border-b border-brand-dark/5 hover:bg-brand-bg/30">
                      <td className="px-3 py-3 sm:px-4 sm:py-4 font-medium text-brand-dark">{c.name || "—"}</td>
                      <td className="px-3 py-3 sm:px-4 sm:py-4 text-brand-dark">
                        <a href={`mailto:${c.email}`} className="text-brand-primary hover:underline break-all">
                          {c.email}
                        </a>
                      </td>
                      <td className="px-3 py-3 sm:px-4 sm:py-4 text-brand-muted hidden sm:table-cell">{c.phone || "—"}</td>
                      <td className="px-3 py-3 sm:px-4 sm:py-4 text-center text-brand-dark">{c.bookingCount}</td>
                      <td className="px-3 py-3 sm:px-4 sm:py-4 text-right font-medium text-brand-dark whitespace-nowrap">{formatCents(c.totalSpentCents)}</td>
                      <td className="px-3 py-3 sm:px-4 sm:py-4 text-brand-muted hidden md:table-cell">{formatDate(c.lastBookingAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-brand-dark/5">
              {filtered.map((c) => (
                <div key={c.email} className="px-4 py-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-brand-dark text-sm">{c.name || "—"}</span>
                    <span className="font-semibold text-brand-dark text-sm shrink-0">{formatCents(c.totalSpentCents)}</span>
                  </div>
                  <a href={`mailto:${c.email}`} className="block text-xs text-brand-primary hover:underline break-all">
                    {c.email}
                  </a>
                  <p className="text-xs text-brand-muted">
                    {c.bookingCount} booking{c.bookingCount !== 1 ? "s" : ""}
                    {c.lastBookingAt ? ` · Last: ${formatDate(c.lastBookingAt)}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
