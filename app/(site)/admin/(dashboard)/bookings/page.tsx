"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { AdminBookingCalendar, type AdminBookingCalendarItem } from "@/components/booking/AdminBookingCalendar";
import { List, CalendarDays, ChevronDown, ChevronUp, AlertCircle, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { AddBookingModal } from "./AddBookingModal";

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

type AddonWithName = { addonId: string; name: string; qty: number };

type BookingItem = {
  id: string;
  experienceId?: string;
  experienceName: string;
  boatId?: string | null;
  boatName?: string | null;
  customer: { name: string; email: string; phone: string };
  partySize: number | null;
  petsCount: number;
  specialNotes: string | null;
  answers: Record<string, string>;
  addonSelections: { addonId: string; qty: number }[];
  addonsWithNames: AddonWithName[];
  durationHours: number | null;
  slotId: string | null;
  rateId: string | null;
  pricing: {
    subtotalCents?: number;
    taxCents?: number;
    feesCents?: number;
    totalCents: number;
    currency: string;
  };
  stripe?: {
    paymentIntentId?: string;
    checkoutSessionId?: string;
    amountTotalCents?: number;
    currency?: string;
    customerId?: string;
    paymentMethodId?: string;
    depositPaymentIntentId?: string;
    finalPaymentIntentId?: string;
    depositAmountCents?: number;
    finalAmountCents?: number;
    totalAmountCents?: number;
    depositPaidAt?: unknown;
    finalChargedAt?: unknown;
    finalChargeAttemptedAt?: unknown;
    finalChargeLockAt?: unknown;
    finalError?: { code?: string; message?: string };
  };
  card?: { brand?: string; last4?: string; expMonth?: number; expYear?: number };
  finalChargeAt?: string | null;
  status: string;
  createdAt: string | null;
  startDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  waiver?: { requestId: string; status: string; templateId: string; templateVersion: number };
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
  const [addBookingOpen, setAddBookingOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

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
  }, [buildParams, refreshKey]);

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
    const headers = ["Date", "Trip date", "Experience", "Party", "Pets", "Customer name", "Email", "Phone", "Amount (USD)", "Status"];
    const rows = list.map((b) => {
      const date = b.createdAt ? new Date(b.createdAt).toISOString() : "";
      const tripDate = b.startDate ?? "";
      const party = b.partySize != null ? String(b.partySize) : "";
      const pets = b.petsCount != null ? String(b.petsCount) : "";
      const amount = b.pricing ? (b.pricing.totalCents / 100).toFixed(2) : "";
      return [
        date,
        tripDate,
        b.experienceName ?? "",
        party,
        pets,
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
    partySize: b.partySize ?? undefined,
    pricing: b.pricing,
    status: b.status,
    createdAt: b.createdAt ?? null,
    startDate: b.startDate ?? null,
    startTime: b.startTime ?? null,
    endTime: b.endTime ?? null,
  }));

  const inputClass =
    "rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary min-h-[40px] sm:min-h-[36px] transition-colors duration-200";

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="mb-6 sm:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">Bookings</h1>
            <p className="mt-1 text-sm text-brand-muted">
              Trip date, party size, and full details. Click a row to open booking details (customer, add-ons, payment breakdown).
            </p>
          </div>
          <Button onClick={() => setAddBookingOpen(true)} className="shrink-0 inline-flex items-center gap-2">
            <Plus className="h-4 w-4" aria-hidden />
            Add booking
          </Button>
        </div>
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
                  "flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ease-out",
                  viewMode === "list"
                    ? "bg-white text-brand-dark shadow-sm border border-brand-dark/10"
                    : "text-brand-muted hover:text-brand-dark hover:bg-white/60"
                )}
              >
                <List className="w-4 h-4" />
                List
              </button>
              <button
                type="button"
                onClick={() => setViewMode("calendar")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ease-out",
                  viewMode === "calendar"
                    ? "bg-white text-brand-dark shadow-sm border border-brand-dark/10"
                    : "text-brand-muted hover:text-brand-dark hover:bg-white/60"
                )}
                aria-label="View bookings by day (calendar)"
              >
                <CalendarDays className="w-4 h-4" />
                By day
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
              <option value="paid">Paid (full)</option>
              <option value="deposit_paid">Deposit paid</option>
              <option value="final_due">Final due</option>
              <option value="final_processing">Final processing</option>
              <option value="final_paid">Final paid</option>
              <option value="final_requires_action">Final requires action</option>
              <option value="final_failed">Final failed</option>
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
          <Button type="button" variant="outline" size="sm" onClick={exportCsv} disabled={list.length === 0} className="ml-auto transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]">
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
          <p className="mt-2 text-brand-muted text-xs max-w-md mx-auto">
            When you have bookings, the list shows <strong>Trip</strong> (date & time), <strong>Party</strong> (guests & pets), and more. Click any row to see full details (add-ons, notes, payment breakdown).
          </p>
          <p className="mt-3 text-brand-muted text-xs max-w-md mx-auto">
            If you have payments in Stripe but don&apos;t see them here, open <strong>Webhook events</strong> below and look for that payment&apos;s event — the <strong>error</strong> field explains why (e.g. Hold not found, Hold already converted).
          </p>
        </div>
      )}

      {!loading && !error && list.length > 0 && viewMode === "list" && (
        <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 overflow-hidden transition-shadow duration-200 hover:shadow-md">
          <div className="overflow-x-auto -mx-px">
            <table className="w-full min-w-[800px] text-sm">
              <thead>
                <tr className="border-b border-brand-dark/10 bg-brand-bg/50">
                  <th className="px-3 py-3 sm:px-4 sm:py-4 text-left font-medium text-brand-dark">Trip</th>
                  <th className="px-3 py-3 sm:px-4 sm:py-4 text-left font-medium text-brand-dark">Booked</th>
                  <th className="px-3 py-3 sm:px-4 sm:py-4 text-left font-medium text-brand-dark">Experience</th>
                  <th className="px-3 py-3 sm:px-4 sm:py-4 text-left font-medium text-brand-dark">Party</th>
                  <th className="px-3 py-3 sm:px-4 sm:py-4 text-left font-medium text-brand-dark">Customer</th>
                  <th className="px-3 py-3 sm:px-4 sm:py-4 text-right font-medium text-brand-dark">Amount</th>
                  <th className="px-3 py-3 sm:px-4 sm:py-4 text-left font-medium text-brand-dark">Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((b) => (
                  <tr
                    key={b.id}
                    onClick={() => {
                      setSelectedBooking(b);
                      setDetailOpen(true);
                    }}
                    className="border-b border-brand-dark/5 hover:bg-brand-primary/5 cursor-pointer transition-all duration-200 ease-out hover:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]"
                  >
                    <td className="px-3 py-3 sm:px-4 sm:py-4 text-brand-dark whitespace-nowrap">
                      {b.startDate
                        ? new Date(b.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                        : "—"}
                      {(b.startTime ?? b.endTime) && (
                        <span className="block text-brand-muted text-xs mt-0.5">
                          {[b.startTime, b.endTime].filter(Boolean).join(" – ")}
                          {b.durationHours != null && ` (${b.durationHours}h)`}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 sm:px-4 sm:py-4 text-brand-muted whitespace-nowrap text-xs">
                      {b.createdAt
                        ? new Date(b.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                        : "—"}
                    </td>
                    <td className="px-3 py-3 sm:px-4 sm:py-4 text-brand-dark">
                      {b.experienceName}
                      {b.boatName && <span className="block text-brand-muted text-xs">{b.boatName}</span>}
                    </td>
                    <td className="px-3 py-3 sm:px-4 sm:py-4 text-brand-dark">
                      {b.partySize != null ? (
                        <>
                          {b.partySize} guest{b.partySize !== 1 ? "s" : ""}
                          {b.petsCount > 0 && <span className="block text-brand-muted text-xs">{b.petsCount} pet{b.petsCount !== 1 ? "s" : ""}</span>}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
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
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-brand-dark">Bookings by day</h2>
            <p className="text-sm text-brand-muted mt-0.5">View reservations on a calendar. Click any booking to open details (customer, party, payment).</p>
          </div>
          <AdminBookingCalendar
            bookings={calendarBookings}
            onBookingClick={handleBookingClick}
          />
        </div>
      )}

      {/* Webhook events – diagnose why Stripe charges don't create bookings */}
      <section className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 overflow-hidden transition-shadow duration-200 hover:shadow-md">
        <button
          type="button"
          onClick={() => setWebhookEventsOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-brand-dark hover:bg-brand-bg/50 transition-colors duration-200"
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

      <AddBookingModal open={addBookingOpen} onOpenChange={setAddBookingOpen} onSuccess={() => setRefreshKey((k) => k + 1)} />

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
          <div className="space-y-6 text-sm max-h-[80vh] overflow-y-auto">
            {/* Status + Trip */}
            <div className="flex flex-wrap items-center gap-3 border-b border-brand-dark/10 pb-4">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                  selectedBooking.status === "paid" || selectedBooking.status === "final_paid"
                    ? "bg-green-100 text-green-800"
                    : selectedBooking.status === "canceled"
                      ? "bg-amber-100 text-amber-800"
                      : selectedBooking.status === "final_failed" || selectedBooking.status === "final_requires_action"
                        ? "bg-red-100 text-red-800"
                        : selectedBooking.status === "final_due" || selectedBooking.status === "deposit_paid"
                          ? "bg-blue-100 text-blue-800"
                          : selectedBooking.status === "final_processing"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-gray-100 text-gray-800"
                }`}
              >
                {selectedBooking.status}
              </span>
              <span className="text-brand-muted">
                Booked {selectedBooking.createdAt ? formatDate(selectedBooking.createdAt) : "—"}
              </span>
            </div>

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-muted mb-2">Trip</h3>
              <dl className="grid gap-2 sm:grid-cols-2">
                <dt className="text-brand-muted">Experience</dt>
                <dd className="text-brand-dark font-medium">
                  {selectedBooking.experienceName}
                  {selectedBooking.boatName && (
                    <span className="block text-brand-muted text-xs mt-0.5">Boat: {selectedBooking.boatName}</span>
                  )}
                </dd>
                <dt className="text-brand-muted">Date & time</dt>
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
                      {selectedBooking.durationHours != null && ` · ${selectedBooking.durationHours}h`}
                    </span>
                  )}
                </dd>
              </dl>
            </section>

            {selectedBooking.waiver && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-muted mb-2">Waiver</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      selectedBooking.waiver.status === "signed"
                        ? "bg-green-100 text-green-800"
                        : selectedBooking.waiver.status === "pending"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {selectedBooking.waiver.status}
                  </span>
                  <Link
                    href={`/admin/waivers/requests/${selectedBooking.waiver.requestId}`}
                    className="text-sm text-brand-primary hover:underline"
                  >
                    View request
                  </Link>
                  {selectedBooking.waiver.status === "signed" && (
                    <a
                      href={`/api/waiver/pdf/${selectedBooking.waiver.requestId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-brand-primary hover:underline"
                    >
                      View PDF
                    </a>
                  )}
                </div>
              </section>
            )}

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-muted mb-2">Party</h3>
              <dl className="grid gap-2 sm:grid-cols-2">
                <dt className="text-brand-muted">Guests</dt>
                <dd className="text-brand-dark">
                  {selectedBooking.partySize != null ? `${selectedBooking.partySize} guest${selectedBooking.partySize !== 1 ? "s" : ""}` : "—"}
                </dd>
                <dt className="text-brand-muted">Pets</dt>
                <dd className="text-brand-dark">
                  {selectedBooking.petsCount != null && selectedBooking.petsCount > 0
                    ? `${selectedBooking.petsCount} pet${selectedBooking.petsCount !== 1 ? "s" : ""}`
                    : "None"}
                </dd>
              </dl>
            </section>

            {selectedBooking.addonsWithNames && selectedBooking.addonsWithNames.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-muted mb-2">Add-ons</h3>
                <ul className="space-y-1">
                  {selectedBooking.addonsWithNames.map((a) => (
                    <li key={a.addonId} className="flex justify-between text-brand-dark">
                      <span>{a.name}</span>
                      <span className="text-brand-muted">×{a.qty}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-muted mb-2">Customer</h3>
              <dl className="space-y-1">
                <div>
                  <dt className="text-brand-muted">Name</dt>
                  <dd className="text-brand-dark font-medium">{selectedBooking.customer?.name ?? "—"}</dd>
                </div>
                {selectedBooking.customer?.email && (
                  <div>
                    <dt className="text-brand-muted">Email</dt>
                    <dd>
                      <a href={`mailto:${selectedBooking.customer.email}`} className="text-brand-primary hover:underline">
                        {selectedBooking.customer.email}
                      </a>
                    </dd>
                  </div>
                )}
                {selectedBooking.customer?.phone && (
                  <div>
                    <dt className="text-brand-muted">Phone</dt>
                    <dd>
                      <a href={`tel:${selectedBooking.customer.phone}`} className="text-brand-dark">
                        {selectedBooking.customer.phone}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            </section>

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-muted mb-2">Payment</h3>
              {selectedBooking.pricing && (
                <dl className="space-y-1">
                  {selectedBooking.pricing.subtotalCents != null && (
                    <div className="flex justify-between">
                      <dt className="text-brand-muted">Subtotal</dt>
                      <dd className="text-brand-dark">{formatCents(selectedBooking.pricing.subtotalCents)}</dd>
                    </div>
                  )}
                  {selectedBooking.pricing.taxCents != null && selectedBooking.pricing.taxCents > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-brand-muted">Tax</dt>
                      <dd className="text-brand-dark">{formatCents(selectedBooking.pricing.taxCents)}</dd>
                    </div>
                  )}
                  {selectedBooking.pricing.feesCents != null && selectedBooking.pricing.feesCents > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-brand-muted">Fees</dt>
                      <dd className="text-brand-dark">{formatCents(selectedBooking.pricing.feesCents)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between font-medium pt-2 border-t border-brand-dark/10">
                    <dt className="text-brand-dark">Total</dt>
                    <dd className="text-brand-dark">{formatCents(selectedBooking.pricing.totalCents)}</dd>
                  </div>
                </dl>
              )}
              {selectedBooking.stripe?.paymentIntentId && (
                <p className="mt-2 text-brand-muted text-xs font-mono truncate" title={selectedBooking.stripe.paymentIntentId}>
                  Stripe PI: {selectedBooking.stripe.paymentIntentId}
                </p>
              )}
              {(selectedBooking.stripe?.depositPaymentIntentId ?? selectedBooking.stripe?.depositAmountCents != null) && (
                <div className="mt-3 pt-3 border-t border-brand-dark/10 space-y-1">
                  <p className="text-xs font-semibold text-brand-muted uppercase tracking-wide">50/50 deposit flow</p>
                  {selectedBooking.stripe?.customerId && (
                    <p className="text-brand-muted text-xs font-mono truncate" title={selectedBooking.stripe.customerId}>
                      Customer: {selectedBooking.stripe.customerId}
                    </p>
                  )}
                  {selectedBooking.stripe?.paymentMethodId && (
                    <p className="text-brand-muted text-xs font-mono truncate" title={selectedBooking.stripe.paymentMethodId}>
                      PM: {selectedBooking.stripe.paymentMethodId.slice(0, 20)}…
                    </p>
                  )}
                  {selectedBooking.card && (
                    <p className="text-brand-dark text-xs">
                      Card: {selectedBooking.card.brand ?? "Card"} •••• {selectedBooking.card.last4 ?? ""}
                      {selectedBooking.card.expMonth != null && selectedBooking.card.expYear != null && (
                        <span> exp {selectedBooking.card.expMonth}/{selectedBooking.card.expYear}</span>
                      )}
                    </p>
                  )}
                  {selectedBooking.stripe?.depositAmountCents != null && (
                    <p className="text-brand-dark text-xs">Deposit: {formatCents(selectedBooking.stripe.depositAmountCents)}</p>
                  )}
                  {selectedBooking.stripe?.finalAmountCents != null && (
                    <p className="text-brand-dark text-xs">Final: {formatCents(selectedBooking.stripe.finalAmountCents)}</p>
                  )}
                  {selectedBooking.finalChargeAt && (
                    <p className="text-brand-muted text-xs">
                      Final charge at: {new Date(selectedBooking.finalChargeAt).toLocaleString()}
                    </p>
                  )}
                  {selectedBooking.stripe?.finalPaymentIntentId && (
                    <p className="text-brand-muted text-xs font-mono truncate" title={selectedBooking.stripe.finalPaymentIntentId}>
                      Final PI: {selectedBooking.stripe.finalPaymentIntentId}
                    </p>
                  )}
                  {selectedBooking.stripe?.finalError && (
                    <p className="text-red-700 text-xs" title={selectedBooking.stripe.finalError.message}>
                      Final error: {selectedBooking.stripe.finalError.code ?? "—"} {selectedBooking.stripe.finalError.message ?? ""}
                    </p>
                  )}
                </div>
              )}
            </section>

            {(selectedBooking.specialNotes || (selectedBooking.answers && Object.keys(selectedBooking.answers).length > 0)) && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-muted mb-2">Notes & answers</h3>
                <dl className="space-y-2">
                  {selectedBooking.specialNotes && (
                    <>
                      <dt className="text-brand-muted text-xs">Special requests</dt>
                      <dd className="text-brand-dark mt-0.5 rounded-lg bg-brand-bg/50 px-3 py-2">{selectedBooking.specialNotes}</dd>
                    </>
                  )}
                  {selectedBooking.answers && Object.entries(selectedBooking.answers).map(([key, value]) =>
                    value ? (
                      <Fragment key={key}>
                        <dt className="text-brand-muted text-xs capitalize">{key.replace(/_/g, " ")}</dt>
                        <dd className="text-brand-dark mt-0.5">{value}</dd>
                      </Fragment>
                    ) : null
                  )}
                </dl>
              </section>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
