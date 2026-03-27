"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PendingRefundsPanel } from "@/components/admin/PendingRefundsPanel";
import { getAdminBookingStatusBadgeClass } from "@/lib/admin/admin-booking-status-badge";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type StripeData = {
  balanceAvailableCents: number;
  balancePendingCents: number;
  currency: string;
  recentTransactions: { id: string; amount: number; net: number; fee: number; created: number; type: string; description?: string }[];
  stripeError?: string;
} | null;

type FinalDueMissingStripeRow = {
  id: string;
  customerEmail: string;
  finalChargeAt: string | null;
  missingFields: string[];
};

type FinancialsData = {
  totalRevenueCents: number;
  revenueThisMonthCents: number;
  revenueInRangeCents?: number;
  revenueInRangeDataSourceDisclaimer?: string;
  paidBookingCount?: number;
  activeBookingCount?: number;
  totalBookingCount?: number;
  recent: { id: string; createdAt: string; customerEmail: string; totalCents: number; status: string; experienceName?: string }[];
  byExperience: { experienceId: string; experienceName: string; revenueCents: number; bookingCount: number }[];
  /** `filtered` = rows use the same createdAt date rules as attributed revenue in range; `all_time` = Firestore per-experience summary docs. */
  byExperienceScope?: "filtered" | "all_time";
  stripe?: StripeData;
  finalDueMissingStripe?: FinalDueMissingStripeRow[];
  truncationWarning?: string;
};
type SyncPreview = {
  hold?: { id?: string; experienceId?: string; slotId?: string; customer?: { name?: string; email?: string } };
  paymentSummary?: { totalCents?: number; depositCents?: number; finalCents?: number; isDeposit?: boolean };
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
  const [syncPreview, setSyncPreview] = useState<SyncPreview | null>(null);
  const [syncConfirmOpen, setSyncConfirmOpen] = useState(false);
  const [syncConfirmSubmitReadyAt, setSyncConfirmSubmitReadyAt] = useState<number | null>(null);
  const [syncConfirmTick, setSyncConfirmTick] = useState(0);
  const [syncForceExpired, setSyncForceExpired] = useState(false);
  const [patchStripeByBooking, setPatchStripeByBooking] = useState<Record<string, { customerId: string; paymentMethodId: string }>>({});
  const [patchLoadingId, setPatchLoadingId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!syncConfirmOpen) return;
    const id = window.setInterval(() => setSyncConfirmTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, [syncConfirmOpen]);

  async function handlePreviewSyncStripePayment() {
    const id = syncPiId.trim();
    if (!id || !id.startsWith("pi_")) {
      setSyncMessage({ type: "error", text: "Enter a valid Payment Intent ID (starts with pi_)" });
      return;
    }
    setSyncMessage(null);
    setSyncPreview(null);
    setSyncLoading(true);
    try {
      const res = await fetch("/api/admin/sync-stripe-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ paymentIntentId: id, dryRun: true, ...(syncForceExpired ? { forceExpired: true } : {}) }),
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
      setSyncPreview(json as SyncPreview);
      setSyncMessage({
        type: "success",
        text: "Preview ready. Confirm to create the booking from this Stripe payment.",
      });
    } catch (e) {
      setSyncMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setSyncLoading(false);
    }
  }

  async function handleConfirmSyncStripePayment() {
    const id = syncPiId.trim();
    if (!id || !id.startsWith("pi_")) return;
    if (syncConfirmSubmitReadyAt != null && Date.now() < syncConfirmSubmitReadyAt) return;
    setSyncLoading(true);
    try {
      const res = await fetch("/api/admin/sync-stripe-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ paymentIntentId: id, ...(syncForceExpired ? { forceExpired: true } : {}) }),
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
      const msg = (json as { message?: string }).message;
      setSyncMessage({ type: "success", text: msg ?? "Booking created from Stripe payment." });
      setSyncPiId("");
      setSyncPreview(null);
      setSyncForceExpired(false);
      setSyncConfirmOpen(false);
      setSyncConfirmSubmitReadyAt(null);
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
            {totalRevenueCents === 0 && (data.activeBookingCount ?? data.paidBookingCount ?? 0) === 0 && (
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
            <p className="text-sm font-medium text-brand-muted">Attributed revenue (bookings created in range)</p>
            <p className="mt-2 text-xl font-bold text-brand-dark sm:text-2xl">{formatCents(data.revenueInRangeCents)}</p>
            <p className="mt-2 text-xs text-brand-muted leading-relaxed">
              Payment-attributed cents from Firestore booking documents with <code className="bg-brand-bg px-1 rounded text-[11px]">createdAt</code> in your
              selected dates; slot-taken statuses only (same rules as summary revenue: deposit until final balance is collected).
            </p>
          </div>
        )}
        {typeof data.totalBookingCount === "number" && (
          <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 min-h-[88px] sm:min-h-0 flex flex-col justify-center sm:col-span-2 lg:col-span-1">
            <p className="text-sm font-medium text-brand-muted">Booking records (all statuses)</p>
            <p className="mt-2 text-xl font-bold text-brand-dark sm:text-2xl">{data.totalBookingCount}</p>
            <p className="mt-2 text-xs text-brand-muted leading-relaxed">
              Count of booking documents scanned for the current date filters (every status). The admin dashboard “Bookings” KPI is a Firestore count of slot-taken statuses; global summaries also expose a separate increment-only booking counter tied to revenue.
            </p>
          </div>
        )}
      </div>

      {(fromDate || toDate) && data.revenueInRangeCents !== undefined && data.revenueInRangeDataSourceDisclaimer && (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 space-y-2"
          role="note"
        >
          <p>{data.revenueInRangeDataSourceDisclaimer}</p>
        </div>
      )}

      {data.truncationWarning && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
          {data.truncationWarning}
        </div>
      )}

      <PendingRefundsPanel />

      {Array.isArray(data.finalDueMissingStripe) && data.finalDueMissingStripe.length > 0 && (
        <div className="rounded-2xl bg-white shadow-soft border border-amber-200/80 p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-brand-dark border-b border-brand-dark/10 pb-3 mb-4">
            Final balance due — missing Stripe customer or payment method
          </h2>
          <p className="text-sm text-brand-muted mb-4">
            These bookings match <code className="bg-brand-bg px-1 rounded text-xs">final_charge_missing_stripe_data</code> from the final-charge cron.
            Patch validated IDs from Stripe Dashboard, then the next cron run can charge the remaining balance.
          </p>
          <div className="space-y-4">
            {data.finalDueMissingStripe.map((row) => (
              <div
                key={row.id}
                className="rounded-lg border border-brand-dark/10 p-3 text-sm space-y-2"
              >
                <p className="font-mono text-xs break-all">
                  <Link href={`/admin/bookings?highlight=${encodeURIComponent(row.id)}`} className="text-brand-primary hover:underline">
                    {row.id}
                  </Link>
                </p>
                <p className="text-brand-muted">
                  {row.customerEmail || "—"} · finalChargeAt: {row.finalChargeAt ? formatDate(row.finalChargeAt) : "—"}
                </p>
                <p className="text-amber-800 text-xs">Missing: {row.missingFields.join(", ")}</p>
                <div className="flex flex-wrap gap-2 items-end">
                  <input
                    type="text"
                    placeholder="cus_…"
                    value={patchStripeByBooking[row.id]?.customerId ?? ""}
                    onChange={(e) =>
                      setPatchStripeByBooking((prev) => ({
                        ...prev,
                        [row.id]: { customerId: e.target.value, paymentMethodId: prev[row.id]?.paymentMethodId ?? "" },
                      }))
                    }
                    className="flex-1 min-w-[140px] rounded-lg border border-brand-dark/20 px-2 py-2 text-xs font-mono"
                  />
                  <input
                    type="text"
                    placeholder="pm_…"
                    value={patchStripeByBooking[row.id]?.paymentMethodId ?? ""}
                    onChange={(e) =>
                      setPatchStripeByBooking((prev) => ({
                        ...prev,
                        [row.id]: { customerId: prev[row.id]?.customerId ?? "", paymentMethodId: e.target.value },
                      }))
                    }
                    className="flex-1 min-w-[140px] rounded-lg border border-brand-dark/20 px-2 py-2 text-xs font-mono"
                  />
                  <button
                    type="button"
                    disabled={patchLoadingId === row.id}
                    onClick={async () => {
                      const p = patchStripeByBooking[row.id];
                      if (!p?.customerId?.trim() || !p?.paymentMethodId?.trim()) return;
                      setPatchLoadingId(row.id);
                      try {
                        const res = await fetch(`/api/admin/bookings/${encodeURIComponent(row.id)}/patch-stripe-data`, {
                          method: "POST",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            customerId: p.customerId.trim(),
                            paymentMethodId: p.paymentMethodId.trim(),
                          }),
                        });
                        const j = await res.json().catch(() => ({}));
                        if (!res.ok) {
                          setError(typeof j.error === "string" ? j.error : "Patch failed");
                          return;
                        }
                        loadFinancials();
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Patch failed");
                      } finally {
                        setPatchLoadingId(null);
                      }
                    }}
                    className="rounded-lg bg-brand-primary px-3 py-2 text-xs font-medium text-white hover:bg-brand-primary/90 disabled:opacity-50"
                  >
                    {patchLoadingId === row.id ? "…" : "Save Stripe IDs"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-brand-dark border-b border-brand-dark/10 pb-3 mb-4">
          Sync a Stripe payment
        </h2>
        <p className="text-sm text-brand-muted mb-4">
          If a payment succeeded in Stripe but no booking appears here, paste the Payment Intent ID (e.g.{" "}
          <code className="bg-brand-bg px-1 rounded text-xs">pi_3SzmmbIYQB2nYanl1CRz5bAL</code>) from Stripe → Payments
          and click Preview sync. Confirm after preview to create the booking in Firestore so revenue and the transaction list update. Use{" "}
          <strong>force expired hold</strong> only when the hold has expired but the PaymentIntent succeeded and you accept the risk of converting late.
        </p>
        <label className="flex items-center gap-2 text-sm text-brand-dark mb-3">
          <input
            type="checkbox"
            checked={syncForceExpired}
            onChange={(e) => setSyncForceExpired(e.target.checked)}
            className="rounded border-brand-dark/30"
          />
          Force sync when hold has expired (admin recovery)
        </label>
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
            onClick={handlePreviewSyncStripePayment}
            disabled={syncLoading}
            className="rounded-lg bg-brand-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-1 disabled:opacity-60"
          >
            {syncLoading ? "Loading…" : "Preview sync"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!syncPreview || !syncPiId.trim().startsWith("pi_")) return;
              setSyncConfirmSubmitReadyAt(Date.now() + 2500);
              setSyncConfirmOpen(true);
            }}
            disabled={syncLoading || !syncPreview}
            className="rounded-lg border border-brand-dark/20 bg-white px-4 py-2.5 text-sm font-medium text-brand-dark hover:bg-brand-bg focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-1 disabled:opacity-60"
          >
            Review & confirm…
          </button>
        </div>
        {syncPreview && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <p className="font-semibold">Preview</p>
            <p>Hold: {syncPreview.hold?.id ?? "—"} · Experience: {syncPreview.hold?.experienceId ?? "—"} · Slot: {syncPreview.hold?.slotId ?? "—"}</p>
            <p>Customer: {syncPreview.hold?.customer?.name ?? "—"} ({syncPreview.hold?.customer?.email ?? "—"})</p>
            <p>
              Amounts: total {formatCents(syncPreview.paymentSummary?.totalCents ?? 0)}, deposit {formatCents(syncPreview.paymentSummary?.depositCents ?? 0)}, final {formatCents(syncPreview.paymentSummary?.finalCents ?? 0)}
            </p>
          </div>
        )}
        {syncMessage && (
          <p
            className={`mt-3 text-sm ${syncMessage.type === "success" ? "text-green-700" : "text-red-700"}`}
            role="alert"
          >
            {syncMessage.text}
          </p>
        )}

        <Dialog
          open={syncConfirmOpen}
          onOpenChange={(open) => {
            setSyncConfirmOpen(open);
            if (!open) setSyncConfirmSubmitReadyAt(null);
          }}
          title="Create booking from this Stripe payment?"
          description="This creates a Firestore booking from the hold linked to this Payment Intent. Only proceed if the preview matches what you expect."
          fullScreenOnMobile
        >
          {syncPreview && (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="font-semibold">Preview</p>
                <p>
                  Hold: {syncPreview.hold?.id ?? "—"} · Experience: {syncPreview.hold?.experienceId ?? "—"} · Slot:{" "}
                  {syncPreview.hold?.slotId ?? "—"}
                </p>
                <p>
                  Customer: {syncPreview.hold?.customer?.name ?? "—"} ({syncPreview.hold?.customer?.email ?? "—"})
                </p>
                <p>
                  Amounts: total {formatCents(syncPreview.paymentSummary?.totalCents ?? 0)}, deposit{" "}
                  {formatCents(syncPreview.paymentSummary?.depositCents ?? 0)}, final{" "}
                  {formatCents(syncPreview.paymentSummary?.finalCents ?? 0)}
                </p>
              </div>
              {syncConfirmSubmitReadyAt != null && Date.now() < syncConfirmSubmitReadyAt && (
                <p className="text-xs text-brand-muted" aria-live="polite">
                  Confirm button enables in a moment (accidental double-click guard).
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setSyncConfirmOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={
                    syncLoading ||
                    (syncConfirmSubmitReadyAt != null && Date.now() < syncConfirmSubmitReadyAt)
                  }
                  onClick={() => void handleConfirmSyncStripePayment()}
                >
                  {syncLoading ? "Working…" : "Yes, create booking from this payment"}
                </Button>
              </div>
            </div>
          )}
        </Dialog>
      </div>

      {(byExperience.length > 0 ||
        (data.byExperienceScope === "filtered" && (fromDate || toDate))) && (
        <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 overflow-hidden">
          <div className="px-4 py-4 sm:px-6 border-b border-brand-dark/10">
            <h2 className="text-lg font-semibold text-brand-dark">By experience</h2>
            <p className="mt-1 text-xs text-brand-muted leading-relaxed">
              {data.byExperienceScope === "filtered"
                ? "Scoped to bookings created in the selected date range (slot-taken statuses; revenue attribution matches “Attributed revenue in range”)."
                : "All-time totals from Firestore per-experience summary documents — not narrowed by the date filters above."}
            </p>
          </div>
          {byExperience.length === 0 ? (
            <div className="px-4 py-6 sm:px-6 text-sm text-brand-muted">No per-experience attributed revenue in this range.</div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto -mx-px">
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
              {/* Mobile card list */}
              <div className="md:hidden divide-y divide-brand-dark/5">
                {byExperience.map((row) => (
                  <div key={row.experienceId} className="flex items-center justify-between px-4 py-3 gap-3">
                    <span className="font-semibold text-brand-dark text-sm">{row.experienceName}</span>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-brand-dark text-sm">{formatCents(row.revenueCents)}</p>
                      <p className="text-xs text-brand-muted">{row.bookingCount} booking{row.bookingCount !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 overflow-hidden">
        <h2 className="px-4 py-4 sm:px-6 border-b border-brand-dark/10 text-lg font-semibold text-brand-dark">
          Recent transactions
        </h2>
        {recent.length === 0 ? (
          <div className="p-6 sm:p-8 text-center text-brand-muted text-sm">No transactions yet.</div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto -mx-px">
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
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getAdminBookingStatusBadgeClass(r.status)}`}
                        >
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-brand-dark/5">
              {recent.map((r) => (
                <div key={r.id} className="px-4 py-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-brand-dark text-sm">{r.experienceName ?? "—"}</span>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${getAdminBookingStatusBadgeClass(r.status)}`}
                    >
                      {r.status}
                    </span>
                  </div>
                  <p className="text-xs text-brand-muted">{formatDate(r.createdAt)}</p>
                  <p className="text-xs text-brand-muted break-all">{r.customerEmail || "—"}</p>
                  <p className="text-right font-semibold text-brand-dark text-sm">{formatCents(r.totalCents)}</p>
                </div>
              ))}
            </div>
          </>
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
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto -mx-px">
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
              {/* Mobile card list */}
              <div className="md:hidden divide-y divide-brand-dark/5">
                {data.stripe.recentTransactions.map((t) => (
                  <div key={t.id} className="px-4 py-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-brand-muted">
                        {new Date(t.created * 1000).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      <span className="text-xs font-medium text-brand-dark capitalize">{t.type}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-brand-muted text-xs">Net: {formatCents(t.net)} · Fee: {formatCents(t.fee)}</span>
                      <span className="font-semibold text-brand-dark">{formatCents(t.amount)}</span>
                    </div>
                  </div>
                ))}
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
