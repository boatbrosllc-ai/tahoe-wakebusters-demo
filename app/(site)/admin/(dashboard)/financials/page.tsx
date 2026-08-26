"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { PendingRefundsPanel } from "@/components/admin/PendingRefundsPanel";
import { FinancialsDiscountReport } from "@/components/admin/FinancialsDiscountReport";
import { getAdminBookingStatusBadgeClass } from "@/lib/admin/admin-booking-status-badge";
import type { DiscountFinancialsReport } from "@/lib/booking/discount-financials";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  DollarSign,
  Download,
  Percent,
  RefreshCw,
  Store,
  Tag,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { getChicagoToday } from "@/lib/booking/booking-date-range";
import { MarketplaceSourceBadge } from "@/components/admin/MarketplaceSourceBadge";
import {
  FINANCIAL_CHANNEL_LABELS,
  FINANCIAL_CHANNEL_ORDER,
  MARKETPLACE_SOURCE_STYLES,
  type FinancialChannelId,
} from "@/lib/admin/marketplace-source";

type StripeData = {
  balanceAvailableCents: number;
  balancePendingCents: number;
  currency: string;
  livemode?: boolean;
  accountName?: string | null;
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
  revenueLastMonthCents?: number;
  revenueInRangeCents?: number;
  revenueInRangeDataSourceDisclaimer?: string;
  scopedRevenueCents?: number;
  paidBookingCountInScope?: number;
  averageBookingCents?: number;
  discountGivenCents?: number;
  discountedBookingCount?: number;
  paidBookingCount?: number;
  activeBookingCount?: number;
  totalBookingCount?: number;
  recent: {
    id: string;
    createdAt: string;
    customerEmail: string;
    customerName?: string;
    totalCents: number;
    status: string;
    experienceName?: string;
    discountCode?: string | null;
    discountCents?: number | null;
    source?: string | null;
    externalProvider?: string | null;
  }[];
  byExperience: { experienceId: string; experienceName: string; revenueCents: number; bookingCount: number }[];
  byExperienceScope?: "filtered" | "all_time";
  bySource?: {
    id: FinancialChannelId;
    label: string;
    revenueCents: number;
    bookingCount: number;
    missingPayoutCount: number;
    share: number;
  }[];
  bySourceScope?: "filtered" | "all_time";
  directRevenueCents?: number;
  marketplaceRevenueCents?: number;
  marketplaceBookingCount?: number;
  marketplaceMissingPayoutCount?: number;
  marketplaceBookings?: {
    id: string;
    createdAt: string;
    startDateStr: string | null;
    customerName: string;
    customerEmail: string;
    experienceId: string;
    experienceName: string;
    channel: Exclude<FinancialChannelId, "direct">;
    payoutCents: number;
  }[];
  discountReport?: DiscountFinancialsReport;
  discountReportDisclaimer?: string;
  stripe?: StripeData;
  finalDueMissingStripe?: FinalDueMissingStripeRow[];
  truncationWarning?: string;
};

type SyncPreview = {
  hold?: { id?: string; experienceId?: string; slotId?: string; customer?: { name?: string; email?: string } };
  paymentSummary?: { totalCents?: number; depositCents?: number; finalCents?: number; isDeposit?: boolean };
};

type ExperienceOption = { id: string; title: string; active: boolean };
type FinancialsTab = "overview" | "platforms" | "promos" | "operations";

const RECENT_PAGE_SIZE = 8;

function shiftIsoDate(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

function thisMonthRange() {
  const today = getChicagoToday();
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

function lastNDaysRange(n: number) {
  const to = getChicagoToday();
  return { from: shiftIsoDate(to, -(n - 1)), to };
}

function ytdRange() {
  const today = getChicagoToday();
  return { from: `${today.slice(0, 4)}-01-01`, to: today };
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

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "teal",
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "teal" | "pink" | "navy" | "amber";
  trend?: { dir: "up" | "down" | "flat"; text: string };
}) {
  const toneClass =
    tone === "pink"
      ? "bg-brand-secondary/10 text-brand-secondary"
      : tone === "navy"
        ? "bg-brand-dark/10 text-brand-dark"
        : tone === "amber"
          ? "bg-amber-100 text-amber-800"
          : "bg-brand-primary/10 text-brand-primary";
  const barClass =
    tone === "pink"
      ? "from-brand-secondary to-brand-secondary/40"
      : tone === "amber"
        ? "from-amber-400 to-amber-200"
        : tone === "navy"
          ? "from-brand-dark to-brand-primary"
          : "from-brand-primary to-brand-primary/40";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-brand-dark/10 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", barClass)} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-muted">{label}</p>
          <p className="mt-2 font-display text-2xl font-bold tracking-tight text-brand-dark sm:text-[1.65rem]">{value}</p>
          {sub ? <p className="mt-1 text-xs leading-relaxed text-brand-muted">{sub}</p> : null}
          {trend ? (
            <span
              className={cn(
                "mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                trend.dir === "up"
                  ? "bg-emerald-50 text-emerald-700"
                  : trend.dir === "down"
                    ? "bg-amber-50 text-amber-800"
                    : "bg-brand-dark/5 text-brand-muted"
              )}
            >
              {trend.dir === "up" && <TrendingUp className="h-3.5 w-3.5" aria-hidden />}
              {trend.dir === "down" && <TrendingDown className="h-3.5 w-3.5" aria-hidden />}
              {trend.text}
            </span>
          ) : null}
        </div>
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl", toneClass)}>
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      </div>
    </div>
  );
}

function ListPager({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  if (total <= pageSize) return null;
  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-brand-dark/10 px-5 py-3 sm:px-6">
      <p className="text-xs text-brand-muted">
        {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 0}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-brand-dark/10 text-brand-dark transition hover:bg-brand-bg disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= pageCount - 1}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-brand-dark/10 text-brand-dark transition hover:bg-brand-bg disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function ShareBar({ share, className, barClassName }: { share: number; className?: string; barClassName?: string }) {
  const width = Math.max(0, Math.min(100, share * 100));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-brand-dark/10", className)}>
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500",
          barClassName ?? "bg-gradient-to-r from-brand-primary to-brand-secondary"
        )}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function channelBarClass(id: FinancialChannelId): string {
  if (id === "boatsetter") return "bg-blue-500";
  if (id === "getmyboat") return "bg-orange-500";
  if (id === "viator") return "bg-pink-500";
  return "bg-brand-primary";
}

type PlatformChannelRow = {
  id: FinancialChannelId;
  label: string;
  revenueCents: number;
  bookingCount: number;
  missingPayoutCount: number;
  share: number;
};

type PlatformBookingRow = {
  id: string;
  createdAt: string;
  startDateStr: string | null;
  customerName: string;
  customerEmail: string;
  experienceName: string;
  channel: Exclude<FinancialChannelId, "direct">;
  payoutCents: number;
};

function defaultPlatformRows(directRevenueCents: number, scopedRevenueCents: number): PlatformChannelRow[] {
  const share = scopedRevenueCents > 0 ? directRevenueCents / scopedRevenueCents : 0;
  return FINANCIAL_CHANNEL_ORDER.map((id) => ({
    id,
    label: FINANCIAL_CHANNEL_LABELS[id],
    revenueCents: id === "direct" ? directRevenueCents : 0,
    bookingCount: 0,
    missingPayoutCount: 0,
    share: id === "direct" ? share : 0,
  }));
}

function PlatformRevenueSection({
  rows,
  bookings,
  scopedRevenueCents,
  directRevenueCents,
  marketplaceRevenueCents,
  missingPayoutCount,
  onExport,
}: {
  rows: PlatformChannelRow[];
  bookings: PlatformBookingRow[];
  scopedRevenueCents: number;
  directRevenueCents: number;
  marketplaceRevenueCents: number;
  missingPayoutCount: number;
  onExport: () => void;
}) {
  const channels = rows.length > 0 ? rows : defaultPlatformRows(directRevenueCents, scopedRevenueCents);
  const bookingsByPlatform = {
    boatsetter: bookings.filter((b) => b.channel === "boatsetter"),
    getmyboat: bookings.filter((b) => b.channel === "getmyboat"),
    viator: bookings.filter((b) => b.channel === "viator"),
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-brand-dark/10 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-dark/10 px-5 py-4 sm:px-6">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-dark">
            <Store className="h-5 w-5 text-brand-primary" aria-hidden />
            Revenue by platform
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-brand-muted">
            Direct is website checkout through Stripe. Boatsetter, Getmyboat, and Viator are owner payouts from those
            confirmation emails. All four are included in the headline total for the selected dates.
          </p>
        </div>
        <button
          type="button"
          onClick={onExport}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-brand-dark/15 bg-brand-bg/40 px-4 py-2 text-xs font-semibold text-brand-dark transition hover:bg-brand-bg"
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          Platform CSV
        </button>
      </div>

      <div className="space-y-6 px-5 py-5 sm:px-6">
        <div>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-muted">Share of selected revenue</p>
            <p className="text-sm font-bold text-brand-dark">{formatCents(scopedRevenueCents)}</p>
          </div>
          <div className="flex h-4 w-full overflow-hidden rounded-full bg-brand-dark/10">
            {channels.map((row) =>
              row.share > 0 ? (
                <div
                  key={row.id}
                  className={cn("h-full", channelBarClass(row.id))}
                  style={{ width: `${Math.max(row.share * 100, row.revenueCents > 0 ? 0.6 : 0)}%` }}
                  title={`${row.label}: ${formatCents(row.revenueCents)}`}
                />
              ) : null
            )}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {channels.map((row) => (
              <li key={row.id} className="inline-flex items-center gap-1.5 text-[11px] text-brand-muted">
                <span className={cn("h-2.5 w-2.5 rounded-full", channelBarClass(row.id))} aria-hidden />
                {row.label}
              </li>
            ))}
          </ul>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {channels.map((row) => {
            const avg = row.bookingCount > 0 ? Math.round(row.revenueCents / row.bookingCount) : 0;
            const pct = scopedRevenueCents > 0 ? Math.round(row.share * 1000) / 10 : 0;
            return (
              <div key={row.id} className="rounded-2xl border border-brand-dark/10 bg-brand-bg/30 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-brand-dark">{row.label}</p>
                  {row.id !== "direct" ? (
                    <MarketplaceSourceBadge source={MARKETPLACE_SOURCE_STYLES[row.id]} />
                  ) : (
                    <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-primary">
                      Direct
                    </span>
                  )}
                </div>
                <p className="mt-3 font-display text-2xl font-bold text-brand-dark">{formatCents(row.revenueCents)}</p>
                <p className="mt-1 text-xs text-brand-muted">
                  {pct}% of total · {row.bookingCount} booking{row.bookingCount !== 1 ? "s" : ""}
                </p>
                <p className="mt-1 text-xs text-brand-muted">
                  Avg {formatCents(avg)}
                  {row.missingPayoutCount > 0 ? ` · ${row.missingPayoutCount} missing payout` : ""}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-brand-dark/10">
        <div className="flex items-center justify-between px-5 py-4 sm:px-6">
          <h3 className="text-sm font-semibold text-brand-dark">Bookings by platform</h3>
          <p className="text-sm font-bold text-brand-dark">{formatCents(marketplaceRevenueCents)}</p>
        </div>
        {missingPayoutCount > 0 && (
          <p className="mx-5 mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-950 sm:mx-6">
            {missingPayoutCount} marketplace booking{missingPayoutCount === 1 ? "" : "s"} have no owner payout parsed
            yet. Open the booking to set it from the saved email.
          </p>
        )}
        {bookings.length === 0 ? (
          <p className="px-5 pb-6 text-sm text-brand-muted sm:px-6">
            No Boatsetter, Getmyboat, or Viator bookings in this date range. Widen the dates or check{" "}
            <Link href="/admin/bookings" className="text-brand-primary hover:underline">
              Bookings
            </Link>
            .
          </p>
        ) : (
          <div className="grid gap-px bg-brand-dark/10 lg:grid-cols-3">
            {(["boatsetter", "getmyboat", "viator"] as const).map((id) => {
              const list = bookingsByPlatform[id];
              const channel = channels.find((c) => c.id === id);
              return (
                <div key={id} className="bg-white">
                  <div className="flex items-center justify-between gap-2 border-b border-brand-dark/10 px-4 py-3">
                    <MarketplaceSourceBadge source={MARKETPLACE_SOURCE_STYLES[id]} />
                    <span className="text-xs font-bold text-brand-dark">
                      {formatCents(channel?.revenueCents ?? 0)}
                    </span>
                  </div>
                  {list.length === 0 ? (
                    <p className="px-4 py-8 text-center text-xs text-brand-muted">None in this range</p>
                  ) : (
                    <ul className="divide-y divide-brand-dark/5">
                      {list.map((row) => (
                        <li key={row.id}>
                          <Link
                            href={`/admin/bookings?highlight=${encodeURIComponent(row.id)}`}
                            className="block px-4 py-3 transition-colors hover:bg-brand-bg/80"
                          >
                            <p className="truncate text-sm font-semibold text-brand-dark">{row.experienceName || "—"}</p>
                            <p className="truncate text-xs text-brand-muted">
                              {row.customerName || row.customerEmail || "—"}
                              {row.startDateStr ? ` · ${row.startDateStr}` : ""}
                            </p>
                            <p className="mt-1 text-sm font-bold text-brand-dark">{formatCents(row.payoutCents)}</p>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function FinancialsSkeleton() {
  return (
    <div className="space-y-6 sm:space-y-8 animate-pulse">
      <div className="h-56 rounded-3xl bg-brand-dark/90" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-2xl border border-brand-dark/10 bg-white" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-72 rounded-2xl border border-brand-dark/10 bg-white" />
        <div className="h-72 rounded-2xl border border-brand-dark/10 bg-white" />
      </div>
    </div>
  );
}

export default function AdminFinancialsPage() {
  const initialRange = thisMonthRange();
  const [data, setData] = useState<FinancialsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState<string>(initialRange.from);
  const [toDate, setToDate] = useState<string>(initialRange.to);
  const [experienceId, setExperienceId] = useState<string>("");
  const [experiences, setExperiences] = useState<ExperienceOption[]>([]);
  const [tab, setTab] = useState<FinancialsTab>("overview");
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
  const [recentPage, setRecentPage] = useState(0);
  const [stripeTxPage, setStripeTxPage] = useState(0);

  const fetchFinancials = useCallback(async () => {
    const params = new URLSearchParams();
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    if (experienceId) params.set("experienceId", experienceId);
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
  }, [fromDate, toDate, experienceId]);

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
    setRecentPage(0);
    setStripeTxPage(0);
  }, [fromDate, toDate, experienceId]);

  useEffect(() => {
    fetch("/api/admin/experiences", { credentials: "include" })
      .then(async (res) => {
        const json = await res.json().catch(() => []);
        return Array.isArray(json) ? (json as ExperienceOption[]) : [];
      })
      .then(setExperiences)
      .catch(() => setExperiences([]));
  }, []);

  useEffect(() => {
    if (!syncConfirmOpen) return;
    const id = window.setInterval(() => setSyncConfirmTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, [syncConfirmOpen]);

  const activePreset = useMemo(() => {
    const month = thisMonthRange();
    const d30 = lastNDaysRange(30);
    const d90 = lastNDaysRange(90);
    const ytd = ytdRange();
    if (!fromDate && !toDate) return "all";
    if (fromDate === month.from && toDate === month.to) return "month";
    if (fromDate === d30.from && toDate === d30.to) return "30";
    if (fromDate === d90.from && toDate === d90.to) return "90";
    if (fromDate === ytd.from && toDate === ytd.to) return "ytd";
    return "custom";
  }, [fromDate, toDate]);

  function applyRange(from: string, to: string) {
    setFromDate(from);
    setToDate(to);
  }

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

  function exportTransactionsCsv() {
    if (!data) return;
    const rangeLabel = `${fromDate || "all"}-${toDate || "all"}`;
    downloadCsv(
      `financial-transactions-${rangeLabel}-${getChicagoToday()}.csv`,
      ["Booking ID", "Created", "Experience", "Customer name", "Email", "Amount (USD)", "Source", "Discount code", "Discount (USD)", "Status"],
      data.recent.map((r) => [
        r.id,
        r.createdAt ? r.createdAt.slice(0, 10) : "",
        r.experienceName ?? "",
        r.customerName ?? "",
        r.customerEmail ?? "",
        (r.totalCents / 100).toFixed(2),
        r.externalProvider || r.source || "direct",
        r.discountCode ?? "",
        typeof r.discountCents === "number" && r.discountCents > 0 ? (r.discountCents / 100).toFixed(2) : "",
        r.status ?? "",
      ])
    );
  }

  function exportPlatformCsv() {
    if (!data) return;
    const rangeLabel = `${fromDate || "all"}-${toDate || "all"}`;
    const summary = (data.bySource ?? []).map((r) => [
      r.label,
      (r.revenueCents / 100).toFixed(2),
      r.bookingCount,
      r.bookingCount > 0 ? ((r.revenueCents / r.bookingCount) / 100).toFixed(2) : "0.00",
      `${(r.share * 100).toFixed(1)}%`,
      r.missingPayoutCount,
    ]);
    const bookingRows = (data.marketplaceBookings ?? []).map((r) => [
      r.channel,
      r.id,
      r.startDateStr ?? "",
      r.createdAt ? r.createdAt.slice(0, 10) : "",
      r.experienceName ?? "",
      r.customerName ?? "",
      r.customerEmail ?? "",
      (r.payoutCents / 100).toFixed(2),
    ]);
    downloadCsv(
      `revenue-by-platform-${rangeLabel}-${getChicagoToday()}.csv`,
      ["Platform", "Revenue (USD)", "Bookings", "Avg booking (USD)", "Share", "Missing payouts"],
      [
        ...summary,
        [],
        ["Platform", "Booking ID", "Trip date", "Ingested", "Experience", "Customer", "Email", "Payout (USD)"],
        ...bookingRows,
      ]
    );
  }

  function exportPromoCsv() {
    if (!data?.discountReport) return;
    const rangeLabel = `${fromDate || "all"}-${toDate || "all"}`;
    downloadCsv(
      `promo-conversions-${rangeLabel}-${getChicagoToday()}.csv`,
      ["Code", "Owner", "Type", "Conversions", "Unique customers", "Discount given (USD)", "Net revenue (USD)", "Avg booking (USD)", "Share of revenue", "Hold uses", "Max uses"],
      data.discountReport.byCode.map((r) => [
        r.code,
        r.assignedTo ?? "",
        r.assignedToType ?? "",
        r.conversionCount,
        r.uniqueCustomerCount,
        (r.discountCents / 100).toFixed(2),
        (r.netRevenueCents / 100).toFixed(2),
        (r.averageBookingCents / 100).toFixed(2),
        (r.shareOfRevenue * 100).toFixed(1) + "%",
        r.usedCount ?? "",
        r.maxRedemptions ?? "",
      ])
    );
  }

  if (loading && !data) {
    return <FinancialsSkeleton />;
  }

  if (error && !data) {
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
  const recentPageCount = Math.max(1, Math.ceil(recent.length / RECENT_PAGE_SIZE));
  const safeRecentPage = Math.min(recentPage, recentPageCount - 1);
  const pagedRecent = recent.slice(safeRecentPage * RECENT_PAGE_SIZE, (safeRecentPage + 1) * RECENT_PAGE_SIZE);
  const stripeTransactions = data.stripe?.recentTransactions ?? [];
  const stripeTxPageCount = Math.max(1, Math.ceil(stripeTransactions.length / RECENT_PAGE_SIZE));
  const safeStripeTxPage = Math.min(stripeTxPage, stripeTxPageCount - 1);
  const pagedStripeTransactions = stripeTransactions.slice(
    safeStripeTxPage * RECENT_PAGE_SIZE,
    (safeStripeTxPage + 1) * RECENT_PAGE_SIZE
  );
  const byExperience = Array.isArray(data.byExperience) ? data.byExperience : [];
  const bySource = Array.isArray(data.bySource) ? data.bySource : [];
  const marketplaceBookings = Array.isArray(data.marketplaceBookings) ? data.marketplaceBookings : [];
  const totalRevenueCents = typeof data.totalRevenueCents === "number" ? data.totalRevenueCents : 0;
  const revenueThisMonthCents = typeof data.revenueThisMonthCents === "number" ? data.revenueThisMonthCents : 0;
  const revenueLastMonthCents = typeof data.revenueLastMonthCents === "number" ? data.revenueLastMonthCents : 0;
  const scopedRevenueCents = typeof data.scopedRevenueCents === "number" ? data.scopedRevenueCents : totalRevenueCents;
  const marketplaceRevenueCents = data.marketplaceRevenueCents ?? 0;
  const directRevenueCents =
    typeof data.directRevenueCents === "number"
      ? data.directRevenueCents
      : Math.max(0, scopedRevenueCents - marketplaceRevenueCents);
  const averageBookingCents = typeof data.averageBookingCents === "number" ? data.averageBookingCents : 0;
  const discountGivenCents = typeof data.discountGivenCents === "number" ? data.discountGivenCents : 0;
  const monthDelta =
    revenueLastMonthCents === 0
      ? revenueThisMonthCents > 0
        ? 100
        : 0
      : Math.round(((revenueThisMonthCents - revenueLastMonthCents) / revenueLastMonthCents) * 100);

  const monthTrend: "up" | "down" | "flat" =
    revenueLastMonthCents === 0
      ? revenueThisMonthCents > 0
        ? "up"
        : "flat"
      : monthDelta > 2
        ? "up"
        : monthDelta < -2
          ? "down"
          : "flat";
  const rangeHeadline =
    activePreset === "all"
      ? "All-time attributed revenue"
      : activePreset === "month"
        ? "This month in filters"
        : activePreset === "30"
          ? "Last 30 days"
          : activePreset === "90"
            ? "Last 90 days"
            : activePreset === "ytd"
              ? "Year to date"
              : fromDate || toDate
                ? `${fromDate || "…"} → ${toDate || "…"}`
                : "Filtered revenue";
  const maxExperienceRevenue = byExperience.reduce((m, r) => Math.max(m, r.revenueCents), 0) || 1;

  const presetBtn = (id: string, label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3.5 py-1.5 text-xs font-semibold tracking-wide transition-all",
        activePreset === id
          ? "bg-white text-brand-dark shadow-sm"
          : "text-white/70 hover:bg-white/10 hover:text-white"
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6 sm:space-y-8">
      <section className="relative overflow-hidden rounded-3xl bg-brand-dark px-5 py-6 text-white shadow-premium sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-brand-primary/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-brand-secondary/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-primary">Financials</h1>
            <p className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">{formatCents(scopedRevenueCents)}</p>
            <p className="mt-2 text-sm text-white/70">
              {rangeHeadline}
              {typeof data.paidBookingCountInScope === "number" ? ` · ${data.paidBookingCountInScope} paid bookings` : ""}
              {experienceId ? " · one experience" : ""}
            </p>
            <p className="mt-3 text-sm text-white/80">
              {formatCents(directRevenueCents)} direct
              <span className="mx-2 text-white/35">+</span>
              {formatCents(marketplaceRevenueCents)} Boatsetter / Getmyboat / Viator
            </p>
            {totalRevenueCents === 0 && (data.activeBookingCount ?? data.paidBookingCount ?? 0) === 0 && (
              <p className="mt-3 max-w-xl text-sm text-amber-200">
                No paid bookings yet. Complete a test payment or check{" "}
                <Link href="/admin/bookings" className="underline underline-offset-2">
                  Admin → Bookings
                </Link>
                .
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3 lg:justify-end">
            <div className="min-w-[140px] rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/55">Direct</p>
              <p className="mt-1 text-lg font-bold">{formatCents(directRevenueCents)}</p>
              <p className="text-[11px] text-white/60">Site & Stripe</p>
            </div>
            <div className="min-w-[140px] rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/55">Other platforms</p>
              <p className="mt-1 text-lg font-bold">{formatCents(marketplaceRevenueCents)}</p>
              <p className="text-[11px] text-white/60">
                {data.marketplaceBookingCount ?? 0} owner payout
                {(data.marketplaceBookingCount ?? 0) === 1 ? "" : "s"}
              </p>
            </div>
            <div className="min-w-[140px] rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/55">Stripe available</p>
              <p className="mt-1 text-lg font-bold">
                {data.stripe && !data.stripe.stripeError ? formatCents(data.stripe.balanceAvailableCents) : "—"}
              </p>
              <p className="text-[11px] text-white/60">
                {data.stripe && !data.stripe.stripeError
                  ? `${data.stripe.livemode === false ? "Test" : "Live"} · Pending ${formatCents(data.stripe.balancePendingCents)}`
                  : "Not connected"}
              </p>
            </div>
          </div>
        </div>
        <div className="relative mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
          <div className="inline-flex flex-wrap rounded-full bg-white/10 p-1">
            {presetBtn("month", "This month", () => {
              const r = thisMonthRange();
              applyRange(r.from, r.to);
            })}
            {presetBtn("30", "Last 30", () => {
              const r = lastNDaysRange(30);
              applyRange(r.from, r.to);
            })}
            {presetBtn("90", "Last 90", () => {
              const r = lastNDaysRange(90);
              applyRange(r.from, r.to);
            })}
            {presetBtn("ytd", "YTD", () => {
              const r = ytdRange();
              applyRange(r.from, r.to);
            })}
            {presetBtn("all", "All time", () => applyRange("", ""))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportPlatformCsv}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              Platforms
            </button>
            <button
              type="button"
              onClick={exportTransactionsCsv}
              disabled={recent.length === 0}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/20 disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              Transactions
            </button>
            <button
              type="button"
              onClick={exportPromoCsv}
              disabled={!data.discountReport || data.discountReport.byCode.every((r) => r.conversionCount === 0)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/20 disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              Promos
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">{error}</div>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-brand-dark/10 bg-white/80 p-4 shadow-sm backdrop-blur-sm sm:p-5">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-brand-primary" aria-hidden />
          <label htmlFor="fin-from" className="text-xs font-semibold uppercase tracking-wider text-brand-muted">From</label>
          <input
            id="fin-from"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="min-h-[44px] rounded-xl border border-brand-dark/15 bg-brand-bg/40 px-3 py-2 text-sm text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary sm:min-h-0"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="fin-to" className="text-xs font-semibold uppercase tracking-wider text-brand-muted">To</label>
          <input
            id="fin-to"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="min-h-[44px] rounded-xl border border-brand-dark/15 bg-brand-bg/40 px-3 py-2 text-sm text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary sm:min-h-0"
          />
        </div>
        <div className="flex min-w-[200px] flex-1 items-center gap-2">
          <label htmlFor="fin-exp" className="text-xs font-semibold uppercase tracking-wider text-brand-muted">Experience</label>
          <select
            id="fin-exp"
            value={experienceId}
            onChange={(e) => setExperienceId(e.target.value)}
            className="min-h-[44px] w-full rounded-xl border border-brand-dark/15 bg-brand-bg/40 px-3 py-2 text-sm text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary sm:min-h-0"
          >
            <option value="">All experiences</option>
            {experiences.map((exp) => (
              <option key={exp.id} value={exp.id}>
                {exp.title || exp.id}
                {exp.active ? "" : " (inactive)"}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => loadFinancials()}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand-dark px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark/90"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden />
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="This month"
          value={formatCents(revenueThisMonthCents)}
          sub={`Last month ${formatCents(revenueLastMonthCents)}`}
          icon={TrendingUp}
          tone="teal"
          trend={{ dir: monthTrend, text: `${monthDelta > 0 ? "+" : ""}${monthDelta}% vs last month` }}
        />
        <MetricCard
          label="Average booking"
          value={formatCents(averageBookingCents)}
          sub="Net attributed revenue ÷ paid bookings in filters"
          icon={BarChart3}
          tone="navy"
        />
        <MetricCard
          label="Other platforms"
          value={formatCents(marketplaceRevenueCents)}
          sub={
            (data.marketplaceBookingCount ?? 0) > 0
              ? `${data.marketplaceBookingCount} Boatsetter / Getmyboat / Viator booking${(data.marketplaceBookingCount ?? 0) === 1 ? "" : "s"} · owner payout`
              : "No marketplace payouts in this range yet"
          }
          icon={Store}
          tone="pink"
        />
        <MetricCard
          label="Discount given"
          value={formatCents(discountGivenCents)}
          sub={`${data.discountedBookingCount ?? 0} promo conversion${(data.discountedBookingCount ?? 0) === 1 ? "" : "s"}`}
          icon={Percent}
          tone="amber"
        />
      </div>

      {(fromDate || toDate) && data.revenueInRangeCents !== undefined && data.revenueInRangeDataSourceDisclaimer && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 space-y-2" role="note">
          <p>{data.revenueInRangeDataSourceDisclaimer}</p>
        </div>
      )}

      {data.truncationWarning && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
          {data.truncationWarning}
        </div>
      )}

      <div className="inline-flex flex-wrap rounded-2xl border border-brand-dark/10 bg-white p-1 shadow-sm">
        {(
          [
            ["overview", "Overview", BarChart3],
            ["platforms", "Platforms", Store],
            ["promos", "Promo codes", Tag],
            ["operations", "Operations", CreditCard],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all",
              tab === id
                ? "bg-brand-dark text-white shadow-sm"
                : "text-brand-muted hover:bg-brand-bg hover:text-brand-dark"
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
            {id === "platforms" && typeof data.marketplaceBookingCount === "number" ? (
              <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", tab === id ? "bg-white/20" : "bg-brand-dark/10")}>
                {data.marketplaceBookingCount}
              </span>
            ) : null}
            {id === "promos" && typeof data.discountedBookingCount === "number" ? (
              <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", tab === id ? "bg-white/20" : "bg-brand-dark/10")}>
                {data.discountedBookingCount}
              </span>
            ) : null}
            {id === "operations" && Array.isArray(data.finalDueMissingStripe) && data.finalDueMissingStripe.length > 0 ? (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
                {data.finalDueMissingStripe.length}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-6">
          <PlatformRevenueSection
            rows={bySource}
            bookings={marketplaceBookings}
            scopedRevenueCents={scopedRevenueCents}
            directRevenueCents={directRevenueCents}
            marketplaceRevenueCents={marketplaceRevenueCents}
            missingPayoutCount={data.marketplaceMissingPayoutCount ?? 0}
            onExport={exportPlatformCsv}
          />

          <div className="grid gap-6 xl:grid-cols-5">
            {(byExperience.length > 0 ||
              (data.byExperienceScope === "filtered" && Boolean(fromDate || toDate))) && (
              <div className="overflow-hidden rounded-3xl border border-brand-dark/10 bg-white shadow-sm xl:col-span-2">
                <div className="border-b border-brand-dark/10 px-5 py-4 sm:px-6">
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-dark">
                    <BarChart3 className="h-5 w-5 text-brand-primary" aria-hidden />
                    By experience
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-brand-muted">
                    {data.byExperienceScope === "filtered"
                      ? "Revenue in the selected date range."
                      : "All-time totals from per-experience summaries."}
                  </p>
                </div>
                {byExperience.length === 0 ? (
                  <div className="px-5 py-10 text-center text-sm text-brand-muted">No attributed revenue in this range.</div>
                ) : (
                  <ul className="space-y-4 px-5 py-5 sm:px-6">
                    {byExperience.map((row) => (
                      <li key={row.experienceId}>
                        <div className="mb-1.5 flex items-baseline justify-between gap-3">
                          <span className="truncate text-sm font-semibold text-brand-dark">{row.experienceName}</span>
                          <span className="shrink-0 text-sm font-bold text-brand-dark">{formatCents(row.revenueCents)}</span>
                        </div>
                        <ShareBar share={row.revenueCents / maxExperienceRevenue} />
                        <p className="mt-1 text-[11px] text-brand-muted">
                          {row.bookingCount} booking{row.bookingCount !== 1 ? "s" : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div
              className={cn(
                "overflow-hidden rounded-3xl border border-brand-dark/10 bg-white shadow-sm",
                byExperience.length > 0 || (data.byExperienceScope === "filtered" && (fromDate || toDate))
                  ? "xl:col-span-3"
                  : "xl:col-span-5"
              )}
            >
              <div className="flex items-center justify-between border-b border-brand-dark/10 px-5 py-4 sm:px-6">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-dark">
                  <DollarSign className="h-5 w-5 text-brand-primary" aria-hidden />
                  Recent transactions
                </h2>
                <Link href="/admin/bookings" className="text-sm font-medium text-brand-primary hover:underline">
                  View all
                </Link>
              </div>
              {recent.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-brand-muted">No transactions yet.</div>
              ) : (
                <>
                  <ul className="divide-y divide-brand-dark/5">
                    {pagedRecent.map((r) => (
                      <li key={r.id}>
                        <Link
                          href={`/admin/bookings?highlight=${encodeURIComponent(r.id)}`}
                          className="flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors hover:bg-brand-bg/80 sm:px-6"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-xs font-bold text-brand-primary">
                            {(r.customerName || r.customerEmail || "?").slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-brand-dark">{r.experienceName ?? "—"}</p>
                            <p className="truncate text-xs text-brand-muted">
                              {r.customerName || r.customerEmail || "—"}
                              {r.createdAt ? ` · ${formatDate(r.createdAt)}` : ""}
                            </p>
                          </div>
                          <MarketplaceSourceBadge booking={{ source: r.source, externalProvider: r.externalProvider }} />
                          {r.discountCode ? (
                            <span className="rounded-full bg-brand-secondary/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-brand-secondary">
                              {r.discountCode}
                            </span>
                          ) : null}
                          <span className="text-sm font-bold text-brand-dark">{formatCents(r.totalCents)}</span>
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getAdminBookingStatusBadgeClass(r.status)}`}>
                            {r.status}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <ListPager
                    page={safeRecentPage}
                    pageCount={recentPageCount}
                    total={recent.length}
                    pageSize={RECENT_PAGE_SIZE}
                    onPage={setRecentPage}
                  />
                </>
              )}
            </div>
          </div>

          {data.stripe != null ? (
            <>
              <div className="overflow-hidden rounded-3xl border border-brand-dark/10 bg-gradient-to-br from-brand-dark to-[#01314f] p-5 text-white shadow-sm sm:p-6">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Wallet className="h-5 w-5 text-brand-primary" aria-hidden />
                  Stripe balance
                </h2>
                {data.stripe.accountName || data.stripe.livemode != null ? (
                  <p className={`mt-1 text-xs ${data.stripe.livemode === false ? "text-amber-200" : "text-white/60"}`}>
                    {data.stripe.livemode === false ? "Test mode" : "Live"}
                    {data.stripe.accountName ? ` · ${data.stripe.accountName}` : ""}
                  </p>
                ) : null}
                {data.stripe.stripeError ? (
                  <p className="mt-3 text-sm text-amber-200">Stripe: {data.stripe.stripeError}</p>
                ) : (
                  <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white/10 px-4 py-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">Available</p>
                      <p className="mt-1 font-display text-3xl font-bold">{formatCents(data.stripe.balanceAvailableCents)}</p>
                    </div>
                    <div className="rounded-2xl bg-white/10 px-4 py-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">Pending</p>
                      <p className="mt-1 font-display text-3xl font-bold">{formatCents(data.stripe.balancePendingCents)}</p>
                    </div>
                  </div>
                )}
              </div>
              {stripeTransactions.length > 0 && !data.stripe.stripeError && (
                <div className="overflow-hidden rounded-3xl border border-brand-dark/10 bg-white shadow-sm">
                  <h2 className="flex items-center gap-2 border-b border-brand-dark/10 px-5 py-4 text-lg font-semibold text-brand-dark sm:px-6">
                    <CreditCard className="h-5 w-5 text-brand-primary" aria-hidden />
                    Recent Stripe activity
                  </h2>
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
                        {pagedStripeTransactions.map((t) => (
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
                            <td className="px-3 py-3 sm:px-4 sm:py-4 text-right text-brand-dark whitespace-nowrap">{formatCents(t.net)}</td>
                            <td className="px-3 py-3 sm:px-4 sm:py-4 text-right text-brand-muted whitespace-nowrap">{formatCents(t.fee)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="md:hidden divide-y divide-brand-dark/5">
                    {pagedStripeTransactions.map((t) => (
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
                  <ListPager
                    page={safeStripeTxPage}
                    pageCount={stripeTxPageCount}
                    total={stripeTransactions.length}
                    pageSize={RECENT_PAGE_SIZE}
                    onPage={setStripeTxPage}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="rounded-3xl border border-brand-dark/10 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-dark">
                <Wallet className="h-5 w-5 text-brand-primary" aria-hidden />
                Stripe balance
              </h2>
              <p className="text-sm text-brand-muted">
                Stripe data is not loaded. Set <code className="bg-brand-bg px-1 rounded text-xs">STRIPE_LIVE_SECRET_KEY</code>{" "}
                or <code className="bg-brand-bg px-1 rounded text-xs">STRIPE_SECRET_KEY</code> and refresh.
              </p>
            </div>
          )}

          <p className="text-xs text-brand-muted pt-2">
            Direct revenue is from your Firestore bookings (Stripe deposit + final when applicable). Boatsetter, Getmyboat,
            and Viator amounts are owner payouts ingested from those platforms — not guest retail totals. Stripe balance
            and activity are from your Stripe account only. For payouts, disputes, and full history, use your{" "}
            <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer" className="text-brand-primary hover:underline">
              Stripe Dashboard
            </a>
            .
          </p>
        </div>
      )}

      {tab === "platforms" && (
        <PlatformRevenueSection
          rows={bySource}
          bookings={marketplaceBookings}
          scopedRevenueCents={scopedRevenueCents}
          directRevenueCents={directRevenueCents}
          marketplaceRevenueCents={marketplaceRevenueCents}
          missingPayoutCount={data.marketplaceMissingPayoutCount ?? 0}
          onExport={exportPlatformCsv}
        />
      )}

      {tab === "promos" && data.discountReport && (
        <FinancialsDiscountReport
          report={data.discountReport}
          disclaimer={data.discountReportDisclaimer}
          onExportCsv={exportPromoCsv}
        />
      )}

      {tab === "operations" && (
        <div className="space-y-6">
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
                  <div key={row.id} className="rounded-lg border border-brand-dark/10 p-3 text-sm space-y-2">
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
              <p className={`mt-3 text-sm ${syncMessage.type === "success" ? "text-green-700" : "text-red-700"}`} role="alert">
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
                  <span className="sr-only">{syncConfirmTick}</span>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setSyncConfirmOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      disabled={syncLoading || (syncConfirmSubmitReadyAt != null && Date.now() < syncConfirmSubmitReadyAt)}
                      onClick={() => void handleConfirmSyncStripePayment()}
                    >
                      {syncLoading ? "Working…" : "Yes, create booking from this payment"}
                    </Button>
                  </div>
                </div>
              )}
            </Dialog>
          </div>
        </div>
      )}
    </div>
  );
}
