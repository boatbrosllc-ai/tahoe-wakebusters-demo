"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { AdminBookingCalendar, type AdminBookingCalendarItem } from "@/components/booking/AdminBookingCalendar";
import { List, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

type BookingItem = {
  id: string;
  experienceId?: string;
  experienceName: string;
  customer: { name: string; email: string; phone: string };
  pricing: { totalCents: number; currency: string };
  status: string;
  createdAt: string | null;
  startDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
};

export default function AdminBookingsPage() {
  const [list, setList] = useState<BookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [fromTripDate, setFromTripDate] = useState<string>("");
  const [toTripDate, setToTripDate] = useState<string>("");
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [selectedBooking, setSelectedBooking] = useState<BookingItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    if (fromTripDate) params.set("fromTripDate", fromTripDate);
    if (toTripDate) params.set("toTripDate", toTripDate);
    params.set("limit", "500");
    return params.toString();
  }, [statusFilter, fromDate, toDate, fromTripDate, toTripDate]);

  useEffect(() => {
    const qs = buildParams();
    const url = qs ? `/api/admin/bookings?${qs}` : "/api/admin/bookings";
    fetch(url, { credentials: "include" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = data.error ?? "Failed to load";
          const hint = data.hint;
          throw new Error(hint ? `${msg} ${hint}` : msg);
        }
        return data;
      })
      .then(setList)
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [buildParams]);

  function exportCsv() {
    const headers = ["Date", "Experience", "Customer name", "Email", "Phone", "Amount (USD)", "Status"];
    const rows = list.map((b) => {
      const date = b.createdAt ? new Date(b.createdAt).toISOString() : "";
      const amount = b.pricing ? (b.pricing.totalCents / 100).toFixed(2) : "";
      return [
        date,
        b.experienceName ?? "",
        b.customer?.name ?? "",
        b.customer?.email ?? "",
        b.customer?.phone ?? "",
        amount,
        b.status ?? "",
      ];
    });
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `bookings-${fromDate || "all"}-${toDate || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function formatDate(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function formatCents(cents: number) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  }

  const handleBookingClick = (booking: AdminBookingCalendarItem) => {
    setSelectedBooking(booking as BookingItem);
    setDetailOpen(true);
  };

  const calendarBookings: AdminBookingCalendarItem[] = list;

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 sm:mb-8">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">Bookings</h1>
          <p className="mt-1 text-sm text-brand-muted">Upcoming and past reservations.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          {/* List / Calendar view toggle */}
          <div className="flex rounded-lg p-1 bg-brand-bg/50 border border-brand-dark/15">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                viewMode === "list"
                  ? "bg-white text-brand-dark shadow-sm border border-brand-dark/10"
                  : "text-brand-muted hover:text-brand-dark"
              )}
            >
              <List className="w-4 h-4" />
              List
            </button>
            <button
              type="button"
              onClick={() => setViewMode("calendar")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                viewMode === "calendar"
                  ? "bg-white text-brand-dark shadow-sm border border-brand-dark/10"
                  : "text-brand-muted hover:text-brand-dark"
              )}
            >
              <CalendarDays className="w-4 h-4" />
              Calendar
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2">
              <label htmlFor="from" className="text-sm font-medium text-brand-dark">From</label>
              <input
                id="from"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="min-h-[44px] rounded-lg border border-brand-dark/20 px-3 py-2.5 text-sm text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary sm:min-h-0"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="to" className="text-sm font-medium text-brand-dark">To</label>
              <input
                id="to"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="min-h-[44px] rounded-lg border border-brand-dark/20 px-3 py-2.5 text-sm text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary sm:min-h-0"
              />
            </div>
            <span className="text-xs text-brand-muted hidden sm:inline">Booking date</span>
            <div className="flex items-center gap-2">
              <label htmlFor="fromTrip" className="text-sm font-medium text-brand-dark">Trip from</label>
              <input
                id="fromTrip"
                type="date"
                value={fromTripDate}
                onChange={(e) => setFromTripDate(e.target.value)}
                className="min-h-[44px] rounded-lg border border-brand-dark/20 px-3 py-2.5 text-sm text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary sm:min-h-0"
                title="Filter by trip date"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="toTrip" className="text-sm font-medium text-brand-dark">Trip to</label>
              <input
                id="toTrip"
                type="date"
                value={toTripDate}
                onChange={(e) => setToTripDate(e.target.value)}
                className="min-h-[44px] rounded-lg border border-brand-dark/20 px-3 py-2.5 text-sm text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary sm:min-h-0"
                title="Filter by trip date"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="status" className="text-sm font-medium text-brand-dark">Status</label>
              <select
                id="status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="min-h-[44px] rounded-lg border border-brand-dark/20 px-3 py-2.5 text-sm text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary sm:min-h-0"
              >
                <option value="">All</option>
                <option value="paid">Paid</option>
                <option value="canceled">Canceled</option>
                <option value="refunded">Refunded</option>
              </select>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={exportCsv} disabled={list.length === 0}>
              Export CSV
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
          <Link href="/admin/login" className="ml-2 text-brand-primary hover:underline">Sign in</Link>
        </div>
      )}

      {loading && (
        <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-8 text-center text-brand-muted text-sm">
          Loading…
        </div>
      )}

      {!loading && !error && list.length === 0 && (
        <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-8 text-center text-brand-muted text-sm">
          No bookings yet.
        </div>
      )}

      {!loading && !error && list.length > 0 && viewMode === "list" && (
        <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 overflow-hidden">
          <div className="overflow-x-auto -mx-px">
            <table className="w-full min-w-[640px] text-sm">
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
                {list.map((b) => (
                  <tr key={b.id} className="border-b border-brand-dark/5 hover:bg-brand-bg/30">
                    <td className="px-3 py-3 sm:px-4 sm:py-4 text-brand-muted whitespace-nowrap">{formatDate(b.createdAt)}</td>
                    <td className="px-3 py-3 sm:px-4 sm:py-4 text-brand-dark">{b.experienceName}</td>
                    <td className="px-3 py-3 sm:px-4 sm:py-4">
                      <span className="font-medium text-brand-dark">{b.customer?.name || "—"}</span>
                      <span className="block text-brand-muted text-xs truncate max-w-[180px] sm:max-w-none">{b.customer?.email}</span>
                    </td>
                    <td className="px-3 py-3 sm:px-4 sm:py-4 text-right font-medium text-brand-dark whitespace-nowrap">
                      {b.pricing ? formatCents(b.pricing.totalCents) : "—"}
                    </td>
                    <td className="px-3 py-3 sm:px-4 sm:py-4">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          b.status === "paid"
                            ? "bg-green-100 text-green-800"
                            : b.status === "canceled"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && !error && list.length > 0 && viewMode === "calendar" && (
        <AdminBookingCalendar
          bookings={calendarBookings}
          onBookingClick={handleBookingClick}
        />
      )}

      {/* Booking detail modal */}
      <Dialog
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setSelectedBooking(null);
        }}
        title={selectedBooking ? `Booking — ${selectedBooking.customer?.name ?? "Customer"}` : undefined}
      >
        {selectedBooking && (
          <div className="space-y-4 text-sm">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-brand-muted font-medium">Experience</dt>
                <dd className="text-brand-dark font-medium">{selectedBooking.experienceName}</dd>
              </div>
              <div>
                <dt className="text-brand-muted font-medium">Date & time</dt>
                <dd className="text-brand-dark">
                  {selectedBooking.startDate
                    ? new Date(selectedBooking.startDate).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "—"}
                  {(selectedBooking.startTime ?? selectedBooking.endTime) && (
                    <span className="block text-brand-muted text-xs mt-0.5">
                      {[selectedBooking.startTime, selectedBooking.endTime].filter(Boolean).join(" – ")}
                    </span>
                  )}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-brand-muted font-medium">Customer</dt>
                <dd className="text-brand-dark">
                  <span className="font-medium">{selectedBooking.customer?.name ?? "—"}</span>
                  {selectedBooking.customer?.email && (
                    <a
                      href={`mailto:${selectedBooking.customer.email}`}
                      className="block text-brand-primary hover:underline truncate"
                    >
                      {selectedBooking.customer.email}
                    </a>
                  )}
                  {selectedBooking.customer?.phone && (
                    <a
                      href={`tel:${selectedBooking.customer.phone}`}
                      className="block text-brand-muted hover:text-brand-dark"
                    >
                      {selectedBooking.customer.phone}
                    </a>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-brand-muted font-medium">Amount</dt>
                <dd className="text-brand-dark font-medium">
                  {selectedBooking.pricing ? formatCents(selectedBooking.pricing.totalCents) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-brand-muted font-medium">Status</dt>
                <dd>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      selectedBooking.status === "paid"
                        ? "bg-green-100 text-green-800"
                        : selectedBooking.status === "canceled"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {selectedBooking.status}
                  </span>
                </dd>
              </div>
            </dl>
          </div>
        )}
      </Dialog>
    </div>
  );
}
