/**
 * Admin bookings list and calendar. Background polling uses {@link ADMIN_BOOKING_VISIBILITY_SLA_MS} (60s)
 * so the list and calendar view stay within roughly a one-minute visibility window when auto-refresh is enabled,
 * without masking concurrent edits from other admins when diagnostics or silent merges run too often.
 */
"use client";

import { useEffect, useState, useCallback, Fragment, useRef, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { AdminBookingCalendar, type AdminBookingCalendarItem } from "@/components/booking/AdminBookingCalendar";
import { getMonthRange } from "@/lib/booking/booking-date-range";
import { formatTripDateYyyyMmDd, formatTripDateYyyyMmDdShort } from "@/lib/booking/format-booking-datetime";
import { List, CalendarDays, ChevronDown, ChevronUp, AlertCircle, Plus, Search, FileSpreadsheet, Mail, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { AddBookingModal } from "./AddBookingModal";
import { AdminSessionRedirectError, subscribeAdminAuthRevalidate, throwIfAdminApiError } from "@/lib/admin-auth-client";
import { ADMIN_BOOKING_VISIBILITY_SLA_MS } from "@/lib/admin-booking-visibility-sla";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";
import { buildSlotId, parseSlotId } from "@/lib/booking/experience-slots";
import { getAdminBookingStatusBadgeClass } from "@/lib/admin/admin-booking-status-badge";

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
  tipCents?: number | null;
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
  confirmationSentAt?: string | null;
};

function mergeBookingLists(prev: BookingItem[], fresh: BookingItem[], order: "trip" | "created"): BookingItem[] {
  const byId = new Map(prev.map((b) => [b.id, b]));
  for (const b of fresh) byId.set(b.id, b);
  const merged = Array.from(byId.values());
  merged.sort((a, b) => {
    if (order === "trip") {
      const da = a.startDate ?? "";
      const db = b.startDate ?? "";
      const c = db.localeCompare(da);
      if (c !== 0) return c;
    } else {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (tb !== ta) return tb - ta;
    }
    return b.id.localeCompare(a.id);
  });
  return merged;
}

function intersectMonthWithTripFilters(
  year: number,
  month0: number,
  fromTrip: string,
  toTrip: string
): { start: string; end: string } | null {
  const { start: mStart, end: mEnd } = getMonthRange(year, month0);
  let start = mStart;
  let end = mEnd;
  if (fromTrip && fromTrip > start) start = fromTrip;
  if (toTrip && toTrip < end) end = toTrip;
  if (start > end) return null;
  return { start, end };
}

type CalendarEventApi = {
  type: string;
  id: string;
  bookingId?: string;
  experienceName?: string;
  customer?: { name: string; email: string; phone: string };
  partySize?: number | null;
  pricing?: { totalCents: number; currency: string };
  status?: string;
  createdAt?: string | null;
  startDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
};

function mapCalendarEventToItem(e: CalendarEventApi): AdminBookingCalendarItem | null {
  if (e.type !== "booking" || !e.bookingId) return null;
  return {
    id: e.bookingId,
    experienceName: e.experienceName ?? "—",
    customer: e.customer ?? { name: "", email: "", phone: "" },
    partySize: e.partySize ?? undefined,
    pricing: e.pricing ?? { totalCents: 0, currency: "usd" },
    status: e.status ?? "",
    createdAt: e.createdAt ?? null,
    startDate: e.startDate ?? null,
    startTime: e.startTime ?? null,
    endTime: e.endTime ?? null,
  };
}

export default function AdminBookingsPage() {
  const [list, setList] = useState<BookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [requiresManualReviewOnly, setRequiresManualReviewOnly] = useState(false);
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
  const [webhookEventsError, setWebhookEventsError] = useState<string | null>(null);
  const [webhookEventsRefreshKey, setWebhookEventsRefreshKey] = useState(0);
  const [addBookingOpen, setAddBookingOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [customerSearch, setCustomerSearch] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelRefund, setCancelRefund] = useState(true);
  const [cancelOverridePolicy, setCancelOverridePolicy] = useState(false);
  const [cancelNoRefundWarning, setCancelNoRefundWarning] = useState<string | null>(null);
  const [cancelRefundFailures, setCancelRefundFailures] = useState<Array<{ paymentIntentId: string; error?: string }>>([]);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [listLastUpdatedAt, setListLastUpdatedAt] = useState<Date | null>(null);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendFinalLoading, setResendFinalLoading] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });
  const [calendarEvents, setCalendarEvents] = useState<AdminBookingCalendarItem[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [calendarPollTick, setCalendarPollTick] = useState(0);
  /** When false, no background interval merge — use Refresh or explicit actions only (avoids surprise overwrites). */
  const [autoBackgroundRefresh, setAutoBackgroundRefresh] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleHour, setRescheduleHour] = useState("7");
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [rescheduleConfirmPricing, setRescheduleConfirmPricing] = useState(false);

  const listFetchGenRef = useRef(0);
  const loadMoreGenRef = useRef(0);
  const calendarFetchGenRef = useRef(0);
  const reconcileDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return subscribeAdminAuthRevalidate(() => {
      setRefreshKey((k) => k + 1);
      setCalendarPollTick((t) => t + 1);
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = new URLSearchParams(window.location.search).get("requiresManualReview");
    if (v === "true") setRequiresManualReviewOnly(true);
  }, []);

  const buildParams = useCallback((cursor?: string | null) => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    if (fromTripDate) params.set("fromTripDate", fromTripDate);
    if (toTripDate) params.set("toTripDate", toTripDate);
    if (requiresManualReviewOnly) params.set("requiresManualReview", "true");
    params.set("limit", "50");
    if (cursor) params.set("cursor", cursor);
    return params.toString();
  }, [statusFilter, fromDate, toDate, fromTripDate, toTripDate, requiresManualReviewOnly]);

  const hasTripFilter = Boolean(fromTripDate || toTripDate);
  const listOrder: "trip" | "created" = hasTripFilter ? "trip" : "created";

  const silentMergeFirstPage = useCallback(async () => {
    const genSnapshot = listFetchGenRef.current;
    setLoadError(null);
    setLoadMoreError(null);
    try {
      const qs = buildParams();
      const url = qs ? `/api/admin/bookings?${qs}` : "/api/admin/bookings";
      const res = await fetch(url, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throwIfAdminApiError(res, data);
      if (genSnapshot !== listFetchGenRef.current) return;
      const fresh = Array.isArray(data) ? data : (data.bookings ?? []);
      setList((prev) => mergeBookingLists(prev, fresh, listOrder));
      setNextCursor(data.nextCursor ?? null);
      setLoadError(null);
    } catch (e) {
      if (e instanceof AdminSessionRedirectError) return;
      if (genSnapshot !== listFetchGenRef.current) return;
      setLoadError(e instanceof Error ? e.message : "Error");
    }
  }, [buildParams, listOrder]);

  useEffect(() => {
    const gen = ++listFetchGenRef.current;
    loadMoreGenRef.current += 1;
    const ac = new AbortController();
    setLoadError(null);
    setLoadMoreError(null);
    setLoading(true);
    setNextCursor(null);
    const qs = buildParams();
    const url = qs ? `/api/admin/bookings?${qs}` : "/api/admin/bookings";
    fetch(url, { credentials: "include", signal: ac.signal })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throwIfAdminApiError(res, data);
        return data;
      })
      .then((data) => {
        if (gen !== listFetchGenRef.current) return;
        setList(Array.isArray(data) ? data : (data.bookings ?? []));
        setNextCursor(data.nextCursor ?? null);
        setLoadError(null);
      })
      .catch((e) => {
        if (e instanceof AdminSessionRedirectError) return;
        if (e instanceof Error && e.name === "AbortError") return;
        if (gen !== listFetchGenRef.current) return;
        setLoadError(e instanceof Error ? e.message : "Error");
      })
      .finally(() => {
        if (gen === listFetchGenRef.current) setLoading(false);
      });
    return () => ac.abort();
  }, [buildParams, refreshKey]);

  useEffect(() => {
    if (!loading) setListLastUpdatedAt(new Date());
  }, [loading, list, refreshKey]);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return;
    const gen = ++loadMoreGenRef.current;
    const ac = new AbortController();
    setLoadMoreError(null);
    setLoadingMore(true);
    const qs = buildParams(nextCursor);
    const url = `/api/admin/bookings?${qs}`;
    fetch(url, { credentials: "include", signal: ac.signal })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throwIfAdminApiError(res, data, "Failed to load more");
        return data;
      })
      .then((data) => {
        if (gen !== loadMoreGenRef.current) return;
        setList((prev) => [...prev, ...(Array.isArray(data) ? data : (data.bookings ?? []))]);
        setNextCursor(data.nextCursor ?? null);
        setLoadMoreError(null);
      })
      .catch((e) => {
        if (e instanceof AdminSessionRedirectError) return;
        if (e instanceof Error && e.name === "AbortError") return;
        if (gen !== loadMoreGenRef.current) return;
        setLoadMoreError(e instanceof Error ? e.message : "Error");
      })
      .finally(() => {
        if (gen === loadMoreGenRef.current) setLoadingMore(false);
      });
  }, [nextCursor, loadingMore, buildParams]);

  const handleCalendarMonthChange = useCallback((year: number, month: number) => {
    setCalendarMonth({ year, month });
  }, []);

  useEffect(() => {
    if (viewMode !== "calendar") return;
    const gen = ++calendarFetchGenRef.current;
    const ac = new AbortController();
    setCalendarError(null);
    setCalendarLoading(true);
    const range = intersectMonthWithTripFilters(calendarMonth.year, calendarMonth.month, fromTripDate, toTripDate);
    if (!range) {
      setCalendarEvents([]);
      setCalendarLoading(false);
      return;
    }
    const params = new URLSearchParams({ from: range.start, to: range.end });
    if (statusFilter) params.set("status", statusFilter);
    const url = `/api/admin/calendar-events?${params.toString()}`;
    fetch(url, { credentials: "include", signal: ac.signal })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throwIfAdminApiError(res, data, "Failed to load calendar");
        return data;
      })
      .then((data) => {
        if (gen !== calendarFetchGenRef.current) return;
        const raw = (data.events ?? []) as CalendarEventApi[];
        const items = raw.map(mapCalendarEventToItem).filter(Boolean) as AdminBookingCalendarItem[];
        setCalendarEvents(items);
        setCalendarError(null);
      })
      .catch((e) => {
        if (e instanceof AdminSessionRedirectError) return;
        if (e instanceof Error && e.name === "AbortError") return;
        if (gen !== calendarFetchGenRef.current) return;
        setCalendarError(e instanceof Error ? e.message : "Error");
      })
      .finally(() => {
        if (gen === calendarFetchGenRef.current) setCalendarLoading(false);
      });
    return () => ac.abort();
  }, [viewMode, calendarMonth, fromTripDate, toTripDate, statusFilter, calendarPollTick]);

  useEffect(() => {
    if (!autoBackgroundRefresh) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void silentMergeFirstPage();
      setCalendarPollTick((t) => t + 1);
    }, ADMIN_BOOKING_VISIBILITY_SLA_MS);
    return () => clearInterval(id);
  }, [silentMergeFirstPage, autoBackgroundRefresh]);

  const scheduleReconcile = useCallback(() => {
    if (reconcileDebounceRef.current) clearTimeout(reconcileDebounceRef.current);
    reconcileDebounceRef.current = setTimeout(() => {
      reconcileDebounceRef.current = null;
      if (document.visibilityState !== "visible") return;
      void silentMergeFirstPage();
      setCalendarPollTick((t) => t + 1);
    }, 2000);
  }, [silentMergeFirstPage]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") scheduleReconcile();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (reconcileDebounceRef.current) clearTimeout(reconcileDebounceRef.current);
    };
  }, [scheduleReconcile]);

  useEffect(() => {
    if (!selectedBooking?.slotId) {
      setRescheduleDate("");
      setRescheduleHour("7");
      setRescheduleConfirmPricing(false);
      return;
    }
    const parsed = parseSlotId(selectedBooking.slotId);
    if (!parsed) return;
    setRescheduleDate(parsed.dateStr);
    setRescheduleHour(String(parsed.startHour));
  }, [selectedBooking?.slotId]);

  useEffect(() => {
    if (!webhookEventsOpen) return;
    const endpoint = "/api/admin/stripe-events?limit=50";
    setWebhookEventsLoading(true);
    setWebhookEventsError(null);
    fetch(endpoint, { credentials: "include" })
      .then(async (res) => {
        const data: unknown = await res.json().catch(() => null);
        if (!res.ok) {
          try {
            throwIfAdminApiError(res, data, `Failed to load webhook diagnostics (${res.status})`);
          } catch (e) {
            if (e instanceof AdminSessionRedirectError) return;
            console.error("[admin] stripe-events diagnostics fetch failed", {
              endpoint,
              httpStatus: res.status,
              response: data,
            });
            setWebhookEventsError(e instanceof Error ? e.message : "Error");
            return;
          }
        }
        const list = Array.isArray(data) ? (data as StripeEventItem[]) : [];
        setWebhookEvents(list);
        setWebhookEventsError(null);
      })
      .catch((e) => {
        console.error("[admin] stripe-events diagnostics fetch failed", {
          endpoint,
          httpStatus: "network",
          error: e instanceof Error ? e.message : String(e),
        });
        setWebhookEventsError(e instanceof Error ? e.message : "Network error");
      })
      .finally(() => setWebhookEventsLoading(false));
  }, [webhookEventsOpen, webhookEventsRefreshKey]);

  function exportCsv() {
    const headers = ["Date", "Trip date", "Experience", "Party (guests)", "Customer name", "Email", "Phone", "Amount (USD)", "Status"];
    const rows = filteredList.map((b) => {
      const date = b.createdAt ? new Date(b.createdAt).toISOString() : "";
      const tripDate = b.startDate ?? "";
      const party = b.partySize != null ? String(b.partySize) : "";
      const amount = b.pricing ? (b.pricing.totalCents / 100).toFixed(2) : "";
      return [
        date,
        tripDate,
        b.experienceName ?? "",
        party,
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

  function exportFinancialsCsv() {
    const headers = [
      "Booking ID",
      "Created",
      "Trip date",
      "Trip time",
      "Experience",
      "Boat",
      "Customer name",
      "Email",
      "Phone",
      "Party size",
      "Subtotal (USD)",
      "Tax (USD)",
      "Fees (USD)",
      "Total (USD)",
      "Status",
      "Stripe Payment Intent ID",
    ];
    const rows = filteredList.map((b) => {
      const created = b.createdAt ? new Date(b.createdAt).toISOString().slice(0, 10) : "";
      const tripTime = [b.startTime, b.endTime].filter(Boolean).join(" – ") || "";
      const subtotal = b.pricing?.subtotalCents != null ? (b.pricing.subtotalCents / 100).toFixed(2) : "";
      const tax = b.pricing?.taxCents != null ? (b.pricing.taxCents / 100).toFixed(2) : "";
      const fees = b.pricing?.feesCents != null ? (b.pricing.feesCents / 100).toFixed(2) : "";
      const total = b.pricing?.totalCents != null ? (b.pricing.totalCents / 100).toFixed(2) : "";
      const piId = b.stripe?.paymentIntentId ?? b.stripe?.finalPaymentIntentId ?? b.stripe?.depositPaymentIntentId ?? "";
      return [
        b.id,
        created,
        b.startDate ?? "",
        tripTime,
        b.experienceName ?? "",
        b.boatName ?? "",
        b.customer?.name ?? "",
        b.customer?.email ?? "",
        b.customer?.phone ?? "",
        b.partySize != null ? String(b.partySize) : "",
        subtotal,
        tax,
        fees,
        total,
        b.status ?? "",
        piId,
      ];
    });
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `financial-export-${fromTripDate || fromDate || "all"}-${toTripDate || toDate || "all"}-${new Date().toISOString().slice(0, 10)}.csv`;
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

  const handleBookingClick = async (booking: AdminBookingCalendarItem) => {
    const fromList = list.find((b) => b.id === booking.id);
    if (fromList) {
      setSelectedBooking(fromList);
      setDetailOpen(true);
    } else {
      setSelectedBooking(null);
      setDetailOpen(true);
    }
    try {
      const res = await fetch(`/api/admin/bookings/${booking.id}`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throwIfAdminApiError(res, data, "Failed to load booking");
      setSelectedBooking(data as BookingItem);
    } catch (e) {
      if (e instanceof AdminSessionRedirectError) return;
      setLoadError(e instanceof Error ? e.message : "Failed to open booking");
    }
  };

  const openBookingDetailFromList = (b: BookingItem) => {
    setSelectedBooking(b);
    setDetailOpen(true);
    void (async () => {
      try {
        const res = await fetch(`/api/admin/bookings/${b.id}`, { credentials: "include" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throwIfAdminApiError(res, data, "Failed to load booking");
        setSelectedBooking(data as BookingItem);
      } catch (e) {
        if (e instanceof AdminSessionRedirectError) return;
        setLoadError(e instanceof Error ? e.message : "Failed to refresh booking");
      }
    })();
  };

  const submitReschedule = async () => {
    if (!selectedBooking?.id || !selectedBooking.slotId || !rescheduleDate) return;
    const parsed = parseSlotId(selectedBooking.slotId);
    const duration = parsed?.durationHours ?? selectedBooking.durationHours ?? 1;
    const slotId = buildSlotId(rescheduleDate, Number(rescheduleHour), duration);
    setRescheduleLoading(true);
    try {
      const res = await fetch(`/api/admin/bookings/${selectedBooking.id}/reschedule`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId, confirmPricingChange: rescheduleConfirmPricing }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        if ((data as { code?: string }).code === "PRICING_CHANGE_REQUIRES_CONFIRMATION") {
          setRescheduleConfirmPricing(true);
          const oldTotal = typeof (data as { oldTotalCents?: number }).oldTotalCents === "number" ? (data as { oldTotalCents: number }).oldTotalCents : null;
          const newTotal = typeof (data as { newTotalCents?: number }).newTotalCents === "number" ? (data as { newTotalCents: number }).newTotalCents : null;
          setLoadError(
            oldTotal != null && newTotal != null
              ? `Pricing changes from ${formatCents(oldTotal)} to ${formatCents(newTotal)}. Enable confirmation and retry.`
              : ((data as { error?: string }).error ?? "Reschedule conflict.")
          );
          return;
        }
        setLoadError((data as { error?: string }).error ?? "Slot conflict. Choose a different start.");
        return;
      }
      if (res.status === 400) {
        setLoadError((data as { error?: string }).error ?? "Invalid start time. Use an allowed operating hour.");
        return;
      }
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Failed to reschedule booking");
      setDetailOpen(false);
      setSelectedBooking(null);
      setRescheduleConfirmPricing(false);
      setRefreshKey((k) => k + 1);
      setCalendarPollTick((t) => t + 1);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to reschedule booking");
    } finally {
      setRescheduleLoading(false);
    }
  };

  const filteredList = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((b) => {
      const name = (b.customer?.name ?? "").toLowerCase();
      const email = (b.customer?.email ?? "").toLowerCase();
      const phone = (b.customer?.phone ?? "").replace(/\D/g, "");
      const qNorm = q.replace(/\D/g, "");
      return name.includes(q) || email.includes(q) || phone.includes(qNorm) || (qNorm.length >= 4 && phone.includes(qNorm));
    });
  }, [list, customerSearch]);

  const filteredCalendarEvents = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return calendarEvents;
    return calendarEvents.filter((b) => {
      const name = (b.customer?.name ?? "").toLowerCase();
      const email = (b.customer?.email ?? "").toLowerCase();
      const phone = (b.customer?.phone ?? "").replace(/\D/g, "");
      const qNorm = q.replace(/\D/g, "");
      return name.includes(q) || email.includes(q) || phone.includes(qNorm) || (qNorm.length >= 4 && phone.includes(qNorm));
    });
  }, [calendarEvents, customerSearch]);

  const showInitialLoading = loading && list.length === 0;
  const showFatalBlock = loadError && list.length === 0 && !loading;

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
            {listLastUpdatedAt && (
              <p className="mt-2 text-xs text-brand-muted">
                List updated {Math.max(0, Math.floor((Date.now() - listLastUpdatedAt.getTime()) / 1000))}s ago
                {" · "}
                <button
                  type="button"
                  className="text-brand-primary font-medium hover:underline"
                  onClick={() => {
                    setRefreshKey((k) => k + 1);
                    setCalendarPollTick((t) => t + 1);
                  }}
                >
                  Refresh
                </button>
                {" · "}
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoBackgroundRefresh}
                    onChange={(e) => setAutoBackgroundRefresh(e.target.checked)}
                    className="rounded border-brand-dark/30"
                  />
                  <span>Auto-refresh every {ADMIN_BOOKING_VISIBILITY_SLA_MS / 1000}s (tab visible)</span>
                </label>
              </p>
            )}
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
            <label htmlFor="customer-search" className="text-sm font-medium text-brand-dark sr-only sm:not-sr-only">Search customer</label>
            <span className="relative flex items-center">
              <Search className="absolute left-3 w-4 h-4 text-brand-muted pointer-events-none" aria-hidden />
              <input
                id="customer-search"
                type="search"
                placeholder="Search customer (name, email, phone)"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className={cn(inputClass, "min-w-[180px] sm:min-w-[200px] pl-9")}
                aria-label="Search by customer name, email, or phone"
              />
            </span>
          </div>
          <div className="flex flex-wrap items-end gap-3 sm:gap-4">
            <label htmlFor="status" className="text-sm font-medium text-brand-dark">Status</label>
            <select
              id="status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={inputClass}
              disabled={requiresManualReviewOnly}
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
            <label className="flex items-center gap-2 text-sm text-brand-dark cursor-pointer select-none">
              <input
                type="checkbox"
                checked={requiresManualReviewOnly}
                onChange={(e) => {
                  setRequiresManualReviewOnly(e.target.checked);
                  setRefreshKey((k) => k + 1);
                }}
                className="rounded border-brand-dark/30"
              />
              Manual payment review (pending refunds)
            </label>
          </div>
          {requiresManualReviewOnly && (
            <p className="w-full text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Showing bookings tied to <code className="text-xs">pendingRefunds</code> rows flagged for review. Clear the checkbox to return to the normal list. URL:{" "}
              <code className="text-xs">?requiresManualReview=true</code>
            </p>
          )}
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
            <p className="w-full text-xs text-brand-muted max-w-2xl leading-relaxed">
              <strong>Booking date</strong> filters when the reservation was created. <strong>Trip date</strong> filters when the charter starts; you can set only &quot;from&quot;, only &quot;to&quot;, or both.
              If both booking-date and trip-date filters are set, a booking must match <em>both</em> (trip range is queried first, then booking created date is applied). The &quot;By day&quot; calendar loads by trip month and status; it does not use booking-date filters.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <Button type="button" variant="outline" size="sm" onClick={exportCsv} disabled={list.length === 0} className="transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]">
              Export CSV
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={exportFinancialsCsv} disabled={list.length === 0} className="inline-flex items-center gap-1.5 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]" title="Tax-ready financial export (subtotal, tax, fees, total). Open in Excel or Google Sheets.">
              <FileSpreadsheet className="w-4 h-4" aria-hidden />
              Export financials (CSV)
            </Button>
          </div>
        </div>
      </div>

      {loadError && list.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {loadError}
          <Link href="/admin/login" className="ml-2 text-brand-primary hover:underline">Sign in</Link>
        </div>
      )}

      {loadMoreError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {loadMoreError}
        </div>
      )}

      {showFatalBlock && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {loadError}
          <Link href="/admin/login" className="ml-2 text-brand-primary hover:underline">Sign in</Link>
        </div>
      )}

      {showInitialLoading && (
        <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-8 text-center text-brand-muted text-sm">
          Loading…
        </div>
      )}

      {!loading && !loadError && list.length === 0 && viewMode === "list" && (
        <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-8 text-center">
          <p className="text-brand-muted text-sm">No bookings yet.</p>
          <p className="mt-2 text-brand-muted text-xs max-w-md mx-auto">
            When you have bookings, the list shows <strong>Trip</strong> (date & time), <strong>Party</strong> (guests), and more. Offer pets via add-ons on the experience. Click any row to see full details (add-ons, notes, payment breakdown).
          </p>
          <p className="mt-3 text-brand-muted text-xs max-w-md mx-auto">
            If you have payments in Stripe but don&apos;t see them here, open <strong>Webhook events</strong> below and look for that payment&apos;s event — the <strong>error</strong> field explains why (e.g. Hold not found, Hold already converted).
          </p>
        </div>
      )}

      {!loading && !loadError && list.length > 0 && filteredList.length === 0 && viewMode === "list" && (
        <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-8 text-center">
          <p className="text-brand-muted text-sm">No bookings match your customer search.</p>
          <p className="mt-1 text-brand-muted text-xs">Try a different name, email, or phone number, or clear the search box.</p>
        </div>
      )}

      {!loading && !loadError && list.length > 0 && filteredList.length > 0 && viewMode === "list" && (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-2xl bg-white shadow-soft border border-brand-dark/10 overflow-hidden transition-shadow duration-200 hover:shadow-md">
            {customerSearch.trim() && (
              <p className="px-4 py-2 text-xs text-brand-muted bg-brand-bg/50 border-b border-brand-dark/10">
                Showing {filteredList.length} of {list.length} bookings
              </p>
            )}
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
                  {filteredList.map((b) => (
                    <tr
                      key={b.id}
                      onClick={() => openBookingDetailFromList(b)}
                      className="border-b border-brand-dark/5 hover:bg-brand-primary/5 cursor-pointer transition-all duration-200 ease-out hover:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]"
                    >
                      <td className="px-3 py-3 sm:px-4 sm:py-4 text-brand-dark whitespace-nowrap">
                        {formatTripDateYyyyMmDdShort(b.startDate ?? null)}
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
                        {b.partySize != null ? `${b.partySize} guest${b.partySize !== 1 ? "s" : ""}` : "—"}
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
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getAdminBookingStatusBadgeClass(b.status)}`}
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

          {/* Mobile card list */}
          <div className="md:hidden space-y-3">
            {customerSearch.trim() && (
              <p className="text-xs text-brand-muted">
                Showing {filteredList.length} of {list.length} bookings
              </p>
            )}
            {filteredList.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => openBookingDetailFromList(b)}
                className="w-full text-left rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 space-y-2 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-brand-dark text-sm">{b.customer?.name || "—"}</span>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${getAdminBookingStatusBadgeClass(b.status)}`}
                  >
                    {b.status}
                  </span>
                </div>
                <div className="text-xs text-brand-muted">
                  {formatTripDateYyyyMmDdShort(b.startDate ?? null)}
                  {(b.startTime ?? b.endTime) && ` · ${[b.startTime, b.endTime].filter(Boolean).join(" – ")}`}
                  {" · "}{b.experienceName}
                </div>
                <div className="text-right font-semibold text-brand-dark text-sm">
                  {b.pricing ? formatCents(b.pricing.totalCents) : "—"}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {!loading && !loadError && nextCursor && viewMode === "list" && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={loadMore}
            disabled={loadingMore}
            className="inline-flex items-center gap-2 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          >
            {loadingMore ? (
              <>
                <svg className="animate-spin h-4 w-4 text-brand-muted" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Loading…
              </>
            ) : (
              "Load more"
            )}
          </Button>
        </div>
      )}

      {!loadError && viewMode === "calendar" && (
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-brand-dark">Bookings by day</h2>
            <p className="text-sm text-brand-muted mt-0.5">
              Loaded for the visible month from the server (not limited to the list page size). Trip date and status filters apply; booking-date filters do not. Click any booking to open details.
            </p>
          </div>
          {calendarError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{calendarError}</div>
          )}
          {calendarLoading && calendarEvents.length === 0 && (
            <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-6 text-center text-brand-muted text-sm">
              Loading calendar…
            </div>
          )}
          {!calendarError && (calendarEvents.length > 0 || !calendarLoading) && (
            <>
              {calendarEvents.length > 0 && filteredCalendarEvents.length === 0 && customerSearch.trim() && (
                <p className="text-sm text-brand-muted">No bookings match your customer search for this month.</p>
              )}
              <AdminBookingCalendar
                bookings={filteredCalendarEvents}
                onBookingClick={handleBookingClick}
                onMonthChange={handleCalendarMonthChange}
              />
            </>
          )}
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
            {webhookEventsError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-4" role="alert">
                <p className="font-medium">Could not load webhook events</p>
                <p className="mt-1">{webhookEventsError}</p>
                <button
                  type="button"
                  className="mt-3 text-sm font-semibold text-brand-primary hover:underline"
                  onClick={() => {
                    setWebhookEventsError(null);
                    setWebhookEventsRefreshKey((k) => k + 1);
                  }}
                >
                  Retry
                </button>
              </div>
            )}
            {!webhookEventsLoading && !webhookEventsError && webhookEvents.length === 0 && (
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

      <AddBookingModal
        open={addBookingOpen}
        onOpenChange={setAddBookingOpen}
        onSuccess={() => {
          setRefreshKey((k) => k + 1);
          setCalendarPollTick((t) => t + 1);
        }}
      />

      {/* Booking detail modal */}
      <Dialog
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) {
            setSelectedBooking(null);
            setRescheduleDate("");
            setRescheduleHour("7");
            setRescheduleConfirmPricing(false);
            setCancelConfirmOpen(false);
            setCancelRefund(true);
            setCancelOverridePolicy(false);
            setCancelNoRefundWarning(null);
            setCancelRefundFailures([]);
            void silentMergeFirstPage();
            setCalendarPollTick((t) => t + 1);
          }
        }}
        title={selectedBooking ? `Booking — ${selectedBooking.customer?.name ?? "Customer"}` : undefined}
        fullScreenOnMobile
      >
        {!selectedBooking && detailOpen && (
          <div className="py-12 text-center text-brand-muted text-sm">Loading booking…</div>
        )}
        {selectedBooking && (
          <div className="space-y-6 text-sm max-h-[80vh] overflow-y-auto">
            {/* Status + Trip */}
            <div className="flex flex-wrap items-center gap-3 border-b border-brand-dark/10 pb-4">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getAdminBookingStatusBadgeClass(selectedBooking.status)}`}
              >
                {selectedBooking.status}
              </span>
              <span className="text-brand-muted">
                Booked {selectedBooking.createdAt ? formatDate(selectedBooking.createdAt) : "—"}
              </span>
            </div>

            {BOOKING_STATUSES_SLOT_TAKEN.has(selectedBooking.status as never) &&
              !selectedBooking.confirmationSentAt &&
              selectedBooking.createdAt &&
              Date.now() - new Date(selectedBooking.createdAt).getTime() > 15 * 60 * 1000 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950" role="status">
                  <strong>Confirmation email not on file</strong> after the usual cron window. Check the notification outbox on the
                  dashboard or resend confirmation if the guest did not receive it.
                </div>
              )}

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
                  {formatTripDateYyyyMmDd(selectedBooking.startDate ?? null)}
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
                        : selectedBooking.waiver.status === "partial"
                          ? "bg-amber-100 text-amber-900"
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
                  {(selectedBooking.waiver.status === "signed" || selectedBooking.waiver.status === "partial") && (
                    <a
                      href={`/api/waiver/pdf/${selectedBooking.waiver.requestId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-brand-primary hover:underline"
                    >
                      View waiver document
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
                  {typeof selectedBooking.tipCents === "number" &&
                    selectedBooking.tipCents > 0 &&
                    selectedBooking.pricing.subtotalCents != null &&
                    selectedBooking.pricing.subtotalCents > 0 && (
                      <div className="flex justify-between">
                        <dt className="text-brand-muted">
                          Tip (
                          {Math.round(
                            (selectedBooking.tipCents / selectedBooking.pricing.subtotalCents) * 100
                          )}
                          %)
                        </dt>
                        <dd className="text-brand-dark">{formatCents(selectedBooking.tipCents)}</dd>
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

            {/* Actions */}
            <section className="border-t border-brand-dark/10 pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-muted mb-3">Actions</h3>
              {selectedBooking.slotId && BOOKING_STATUSES_SLOT_TAKEN.has(selectedBooking.status as never) && (
                <div className="mb-3 rounded-lg border border-brand-dark/10 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted mb-2">Reschedule</p>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-xs text-brand-muted">
                      Date
                      <input
                        type="date"
                        value={rescheduleDate}
                        onChange={(e) => setRescheduleDate(e.target.value)}
                        className="mt-1 block rounded border border-brand-dark/20 px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="text-xs text-brand-muted">
                      Start hour
                      <select
                        value={rescheduleHour}
                        onChange={(e) => setRescheduleHour(e.target.value)}
                        className="mt-1 block rounded border border-brand-dark/20 px-2 py-1 text-sm"
                      >
                        {Array.from({ length: 13 }, (_, i) => i + 7).map((h) => (
                          <option key={h} value={String(h)}>{h}:00</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs text-brand-muted flex items-center gap-1.5 mb-1">
                      <input
                        type="checkbox"
                        checked={rescheduleConfirmPricing}
                        onChange={(e) => setRescheduleConfirmPricing(e.target.checked)}
                        className="rounded border-brand-dark/30"
                      />
                      confirm pricing change
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={rescheduleLoading || !rescheduleDate}
                      onClick={() => void submitReschedule()}
                    >
                      {rescheduleLoading ? "Rescheduling..." : "Reschedule"}
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={resendLoading}
                  onClick={async () => {
                    if (!selectedBooking?.id) return;
                    setResendLoading(true);
                    try {
                      const res = await fetch(`/api/admin/bookings/${selectedBooking.id}/resend-confirmation`, {
                        method: "POST",
                        credentials: "include",
                      });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) throw new Error(data.error ?? "Failed to send");
                      setLoadError(null);
                      setDetailOpen(false);
                      setSelectedBooking(null);
                      setRefreshKey((k) => k + 1);
                    } catch (e) {
                      setLoadError(e instanceof Error ? e.message : "Failed to resend email");
                    } finally {
                      setResendLoading(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5"
                >
                  <Mail className="w-4 h-4" aria-hidden />
                  {resendLoading ? "Sending…" : "Resend confirmation (resets dead letter if needed)"}
                </Button>
                {["final_due", "final_requires_action", "final_failed"].includes(selectedBooking.status) &&
                  (selectedBooking.stripe?.finalAmountCents ?? 0) > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={resendFinalLoading}
                    onClick={async () => {
                      if (!selectedBooking?.id) return;
                      setResendFinalLoading(true);
                      try {
                        const res = await fetch(`/api/admin/bookings/${selectedBooking.id}/resend-final-payment-request`, {
                          method: "POST",
                          credentials: "include",
                        });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) throw new Error(data.error ?? "Failed to send");
                        setLoadError(null);
                        setDetailOpen(false);
                        setSelectedBooking(null);
                        setRefreshKey((k) => k + 1);
                      } catch (e) {
                        setLoadError(e instanceof Error ? e.message : "Failed to resend final payment request");
                      } finally {
                        setResendFinalLoading(false);
                      }
                    }}
                    className="inline-flex items-center gap-1.5"
                  >
                    <Mail className="w-4 h-4" aria-hidden />
                    {resendFinalLoading ? "Sending…" : "Resend final payment request"}
                  </Button>
                )}
                {selectedBooking.status !== "canceled" && selectedBooking.status !== "refunded" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="inline-flex items-center gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50"
                    onClick={() => setCancelConfirmOpen(true)}
                  >
                    <Ban className="w-4 h-4" aria-hidden />
                    Cancel booking
                  </Button>
                )}
              </div>
            </section>
          </div>
        )}
      </Dialog>

      {/* Cancel booking confirmation */}
      <Dialog
        open={cancelConfirmOpen}
        onOpenChange={(open) => {
          setCancelConfirmOpen(open);
          if (!open) {
            setCancelRefund(true);
            setCancelOverridePolicy(false);
            setCancelNoRefundWarning(null);
            setCancelRefundFailures([]);
          }
        }}
        title="Cancel booking?"
      >
        {selectedBooking && (
          <div className="space-y-4 text-sm">
            <p className="text-brand-dark">
              This will cancel the booking for <strong>{selectedBooking.customer?.name ?? "the customer"}</strong>
              {selectedBooking.pricing && (
                <> (amount: <strong>{formatCents(selectedBooking.pricing.totalCents)}</strong>)</>
              )}.
            </p>
            <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              A Stripe refund will be issued to the customer unless you opt out below (e.g. for penalty-free cancellations).
            </p>
            {cancelNoRefundWarning && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950">
                <p className="text-sm">{cancelNoRefundWarning}</p>
                <label className="mt-2 flex items-center gap-2 cursor-pointer text-brand-dark">
                  <input
                    type="checkbox"
                    checked={cancelOverridePolicy}
                    onChange={(e) => setCancelOverridePolicy(e.target.checked)}
                    className="rounded border-brand-dark/30"
                  />
                  <span>Override policy and proceed with cancellation</span>
                </label>
              </div>
            )}
            {cancelRefundFailures.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950" role="alert">
                <p className="font-medium">Stripe refund issue</p>
                <ul className="mt-1 list-disc pl-5 text-xs font-mono space-y-0.5">
                  {cancelRefundFailures.map((r) => (
                    <li key={r.paymentIntentId}>
                      {r.paymentIntentId}: {r.error ?? "failed"}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs">Resolve in Stripe or retry; the booking is already canceled.</p>
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={cancelRefund}
                onChange={(e) => setCancelRefund(e.target.checked)}
                className="rounded border-brand-dark/30"
              />
              <span className="text-brand-dark">Issue refund via Stripe</span>
            </label>
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCancelConfirmOpen(false)}
              >
                Back
              </Button>
              <Button
                type="button"
                className="bg-amber-600 hover:bg-amber-700"
                disabled={cancelLoading}
                onClick={async () => {
                  if (!selectedBooking?.id) return;
                  setCancelLoading(true);
                  setCancelNoRefundWarning(null);
                  try {
                    const res = await fetch(`/api/admin/bookings/${selectedBooking.id}/cancel`, {
                      method: "POST",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ refund: cancelRefund, overridePolicy: cancelOverridePolicy }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (res.status === 409 && (data as { code?: string }).code === "NO_REFUND_WINDOW_REQUIRES_CONFIRMATION") {
                      setCancelNoRefundWarning(
                        typeof (data as { error?: string }).error === "string"
                          ? (data as { error: string }).error
                          : "Policy confirmation required."
                      );
                      return;
                    }
                    if (!res.ok) throw new Error((data as { error?: string }).error ?? "Failed to cancel");
                    const refunds = Array.isArray((data as { refunds?: unknown }).refunds)
                      ? ((data as { refunds: Array<{ paymentIntentId: string; error?: string }> }).refunds)
                      : [];
                    const failed = refunds.filter((r) => r.error);
                    if (failed.length > 0) {
                      setCancelRefundFailures(failed);
                      return;
                    }
                    setLoadError(null);
                    setCancelConfirmOpen(false);
                    setCancelRefundFailures([]);
                    setDetailOpen(false);
                    setSelectedBooking(null);
                    setCancelRefund(true);
                    setCancelOverridePolicy(false);
                    setRefreshKey((k) => k + 1);
                  } catch (e) {
                    setLoadError(e instanceof Error ? e.message : "Failed to cancel booking");
                  } finally {
                    setCancelLoading(false);
                  }
                }}
              >
                {cancelLoading ? "Canceling…" : "Confirm cancel"}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
