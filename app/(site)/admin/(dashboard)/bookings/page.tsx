"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { AdminBookingCalendar, type AdminBookingCalendarItem } from "@/components/booking/AdminBookingCalendar";
import { List, CalendarDays, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type StripeEventItem = {
  id: string;
  eventType: string | null;
  receivedAt: string | null;
  processedAt: string | null;
  status: string | null;
  error: string | null;
  outcome: string | null;
  bookingId: string | null;
  holdId: string | null;
  sessionId: string | null;
  paymentIntentId: string | null;
  amountTotal: number | null;
  currency: string | null;
};

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
  const [webhookEventsOpen, setWebhookEventsOpen] = useState(false);
  const [webhookEvents, setWebhookEvents] = useState<StripeEventItem[]>([]);
  const [webhookEventsLoading, setWebhookEventsLoading] = useState(false);

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

  useEffect(() => {
    if (!webhookEventsOpen) return;
    setWebhookEventsLoading(true);
    fetch("/api/admin/stripe-events?limit=50", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => (Array.isArray(data) ? data : []))
      .then(setWebhookEvents)
      .catch(() => setWebhookEvents([]))
      .finally(() => setWebhookEventsLoading(false));
  }, [webhookEventsOpen]);

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
    setSelectedBooking(list.find((b) => b.id === booking.id) ?? null);
    setDetailOpen(true);
  };

  const calendarBookings: AdminBookingCalendarItem[] = list.map((b) => ({
    id: b.id,
    experienceName: b.experienceName,
    customer: b.customer,
    pricing: b.pricing,
    status: b.status,
    createdAt: b.createdAt ?? null,
    startDate: b.startDate ?? null,
    startTime: b.startTime ?? null,
    endTime: b.endTime ?? null,
  }));

  const inputClass =
    "rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary min-h-[40px] sm:min-h-[36px]";

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">Bookings</h1>
        <p className="mt-1 text-sm text-brand-muted">Upcoming and past reservations.</p>
      </div>

      {/* Filters */}
      <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6">
        <div className="flex flex-wrap items-end gap-4 sm:gap-6">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-brand-dark">View</span>
            <div className="flex rounded-lg p-0.5 bg-brand-bg/50 border border-brand-dark/15">
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
          </div>
          <div className="flex flex-wrap items-end gap-3 sm:gap-4">
            <label htmlFor="status" className="text-sm font-medium text-brand-dark">Status</label>
            <select
              id="status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={inputClass}
            >
              <option value="">All</option>
              <option value="paid">Paid</option>
              <option value="canceled">Canceled</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>
          <div className="border-l border-brand-dark/15 pl-4 sm:pl-6 flex flex-wrap items-end gap-3 sm:gap-4">
            <span className="text-xs font-medium text-brand-muted uppercase tracking-wide w-full sm:w-auto">Booking date</span>
            <div className="flex items-center gap-2">
              <label htmlFor="from" className="text-sm text-brand-muted sr-only sm:not-sr-only sm:whitespace-nowrap">From</label>
              <input
                id="from"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className={inputClass}
                aria-label="Filter from date (booking created)"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="to" className="text-sm text-brand-muted sr-only sm:not-sr-only sm:whitespace-nowrap">To</label>
              <input
                id="to"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className={inputClass}
                aria-label="Filter to date (booking created)"
              />
            </div>
          </div>
          <div className="border-l border-brand-dark/15 pl-4 sm:pl-6 flex flex-wrap items-end gap-3 sm:gap-4">
            <span className="text-xs font-medium text-brand-muted uppercase tracking-wide w-full sm:w-auto">Trip date</span>
            <div className="flex items-center gap-2">
              <label htmlFor="fromTrip" className="text-sm text-brand-muted sr-only sm:not-sr-only sm:whitespace-nowrap">From</label>
              <input
                id="fromTrip"
                type="date"
                value={fromTripDate}
                onChange={(e) => setFromTripDate(e.target.value)}
                className={inputClass}
                aria-label="Filter from date (trip start)"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="toTrip" className="text-sm text-brand-muted sr-only sm:not-sr-only sm:whitespace-nowrap">To</label>
              <input
                id="toTrip"
                type="date"
                value={toTripDate}
                onChange={(e) => setToTripDate(e.target.value)}
                className={inputClass}
                aria-label="Filter to date (trip start)"
              />
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={exportCsv} disabled={list.length === 0} className="ml-auto">
            Export CSV
          </Button>
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
        <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-8 text-center">
          <p className="text-brand-muted text-sm">No bookings yet.</p>
          <p className="mt-3 text-brand-muted text-xs max-w-md mx-auto">
            If you have payments in Stripe but don&apos;t see them here, open <strong>Webhook events</strong> below and look for that payment&apos;s event — the <strong>error</strong> field explains why (e.g. Hold not found, Hold already converted).
          </p>
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

      {/* Webhook events – diagnose why Stripe charges don't create bookings */}
      <section className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 overflow-hidden">
        <button
          type="button"
          onClick={() => setWebhookEventsOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-brand-dark hover:bg-brand-bg/50"
        >
          <span>Webhook events (Stripe → booking)</span>
          {webhookEventsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {webhookEventsOpen && (
          <div className="border-t border-brand-dark/10 p-4">
            <p className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
              <AlertCircle className="w-4 h-4 shrink-0" />
              If a charge appears in Stripe but no booking shows above: (1) In Stripe Dashboard → Developers → Webhooks, ensure the endpoint is <code className="bg-amber-100 px-1 rounded">APP_BASE_URL/api/stripe/webhook</code> and events <strong>checkout.session.completed</strong> and <strong>payment_intent.succeeded</strong> are enabled. (2) Check the table below for errors (e.g. &quot;Hold not found&quot;, &quot;Missing holdId&quot;). Match Stripe payment by Payment ID or Session ID to find the event and its error.
            </p>
            {webhookEventsLoading && (
              <p className="text-sm text-brand-muted py-2">Loading…</p>
            )}
            {!webhookEventsLoading && webhookEvents.length === 0 && (
              <p className="text-sm text-brand-muted py-2">No webhook events recorded yet. Complete a test payment to see events here.</p>
            )}
            {!webhookEventsLoading && webhookEvents.length > 0 && (
              <div className="overflow-x-auto -mx-2">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-brand-dark/15">
                      <th className="px-2 py-2 text-left font-medium text-brand-dark">Event</th>
                      <th className="px-2 py-2 text-left font-medium text-brand-dark">Received</th>
                      <th className="px-2 py-2 text-left font-medium text-brand-dark">Error / Outcome</th>
                      <th className="px-2 py-2 text-left font-medium text-brand-dark">Booking / Hold</th>
                      <th className="px-2 py-2 text-left font-medium text-brand-dark">Stripe ID / Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {webhookEvents.map((ev) => (
                      <tr key={ev.id} className="border-b border-brand-dark/5">
                        <td className="px-2 py-2 text-brand-dark font-mono text-xs">{ev.eventType ?? "—"}</td>
                        <td className="px-2 py-2 text-brand-muted text-xs whitespace-nowrap">
                          {ev.receivedAt ? new Date(ev.receivedAt).toLocaleString() : "—"}
                        </td>
                        <td className="px-2 py-2">
                          {ev.error ? (
                            <span className="text-red-700 font-medium" title={ev.error}>{ev.error}</span>
                          ) : ev.outcome ? (
                            <span className="text-green-700">{ev.outcome}</span>
                          ) : (
                            <span className="text-brand-muted">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-brand-muted text-xs">
                          {ev.bookingId ? `Booking: ${ev.bookingId}` : ev.holdId ? `Hold: ${ev.holdId}` : "—"}
                        </td>
                        <td className="px-2 py-2 text-brand-muted text-xs font-mono">
                          {ev.paymentIntentId && <span title="Payment Intent ID">{ev.paymentIntentId.slice(0, 20)}…</span>}
                          {ev.sessionId && ev.eventType === "checkout.session.completed" && (
                            <span title="Session ID" className="block truncate max-w-[12rem]">{ev.sessionId}</span>
                          )}
                          {ev.amountTotal != null && (
                            <span className="block">{(ev.amountTotal / 100).toFixed(2)} {ev.currency ?? "USD"}</span>
                          )}
                          {!ev.paymentIntentId && !ev.sessionId && ev.amountTotal == null && "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

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
