"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Download,
  Mail,
  Phone,
  RefreshCw,
  Search,
  Users,
  Wallet,
  CalendarDays,
  Repeat,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  customerProfilePath,
  customerStatusLabel,
  matchesCustomerSegment,
  mergeCustomerRecords,
  type CustomerListItem,
  type CustomerSegment,
} from "@/lib/admin/customer-crm";
import { daysWaiting, leadSourceLabel } from "@/lib/lead/lead";

type CustomersApiResponse = {
  customers: CustomerListItem[];
  nextCursor: string | null;
  pageSize?: number;
  pageBookingDocs?: number;
  leadsIncluded?: boolean;
};

type SortKey = "name" | "email" | "bookings" | "spent" | "last";
type SortDir = "asc" | "desc";

const SEGMENTS: { id: CustomerSegment; label: string }[] = [
  { id: "all", label: "All" },
  { id: "customers", label: "Customers" },
  { id: "leads", label: "Leads" },
  { id: "repeat", label: "Repeat" },
  { id: "lapsed", label: "Lapsed" },
];

function coerceCustomer(raw: unknown): CustomerListItem | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Partial<CustomerListItem>;
  const email = typeof c.email === "string" ? c.email.trim() : "";
  if (!email) return null;
  const bookingCount = typeof c.bookingCount === "number" ? c.bookingCount : 0;
  return {
    email,
    name: typeof c.name === "string" ? c.name : "",
    phone: typeof c.phone === "string" ? c.phone : "",
    bookingCount,
    lastBookingAt: typeof c.lastBookingAt === "string" ? c.lastBookingAt : null,
    totalSpentCents: typeof c.totalSpentCents === "number" ? c.totalSpentCents : 0,
    kind: c.kind === "lead" || c.kind === "customer" ? c.kind : bookingCount > 0 ? "customer" : "lead",
    marketingOptIn: Boolean(c.marketingOptIn),
    lastExperienceName: typeof c.lastExperienceName === "string" ? c.lastExperienceName : null,
    leadSource: typeof c.leadSource === "string" ? c.leadSource : null,
    leadCapturedAt: typeof c.leadCapturedAt === "string" ? c.leadCapturedAt : null,
    leadInterest: typeof c.leadInterest === "string" ? c.leadInterest : null,
    leadPage: typeof c.leadPage === "string" ? c.leadPage : null,
    lastContactedAt: typeof c.lastContactedAt === "string" ? c.lastContactedAt : null,
    leadMessage: typeof c.leadMessage === "string" ? c.leadMessage : null,
  };
}

function statusBadgeClass(item: CustomerListItem) {
  const label = customerStatusLabel(item);
  if (label === "Lead") return "bg-amber-100 text-amber-900";
  if (label === "Contacted") return "bg-brand-dark/10 text-brand-dark";
  if (label === "Repeat") return "bg-brand-secondary/15 text-brand-secondary";
  if (label === "Lapsed") return "bg-brand-dark/10 text-brand-muted";
  return "bg-brand-primary/15 text-brand-primary";
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function initials(name: string, email: string) {
  const source = name.trim() || email.trim();
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase() || "?";
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
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "teal" | "pink" | "navy" | "amber";
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
        </div>
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl", toneClass)}>
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      </div>
    </div>
  );
}

function CustomersSkeleton() {
  return (
    <div className="space-y-6 sm:space-y-8 animate-pulse">
      <div className="h-56 rounded-3xl bg-brand-dark/90" />
      <div className="h-20 rounded-2xl border border-brand-dark/10 bg-white" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-2xl border border-brand-dark/10 bg-white" />
        ))}
      </div>
      <div className="h-96 rounded-3xl border border-brand-dark/10 bg-white" />
    </div>
  );
}

export default function AdminCustomersPage() {
  const router = useRouter();
  const [list, setList] = useState<CustomerListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pagesLoaded, setPagesLoaded] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState<CustomerSegment>("all");
  const [sortKey, setSortKey] = useState<SortKey>("last");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const parsePayload = (data: unknown): CustomersApiResponse => {
    const d = data as CustomersApiResponse & { error?: string };
    const customers = Array.isArray(d.customers)
      ? d.customers.map(coerceCustomer).filter((x): x is CustomerListItem => x != null)
      : [];
    const nc = d.nextCursor === null || typeof d.nextCursor === "string" ? d.nextCursor : null;
    return { customers, nextCursor: nc, pageSize: d.pageSize, pageBookingDocs: d.pageBookingDocs };
  };

  const loadCustomers = useCallback(async (opts?: { append: boolean; cursor: string | null }) => {
    const append = opts?.append ?? false;
    const cursor = opts?.cursor ?? null;
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setNextCursor(null);
      setPagesLoaded(0);
    }
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (cursor) qs.set("cursor", cursor);
      const url = qs.toString() ? `/api/admin/customers?${qs}` : "/api/admin/customers";
      const res = await fetch(url, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data as { error?: string }).error ?? "Failed to load";
        const hint = (data as { hint?: string }).hint;
        throw new Error(hint ? `${msg} ${hint}` : msg);
      }
      const { customers, nextCursor: nc } = parsePayload(data);
      setList((prev) => (append ? mergeCustomerRecords(prev, customers) : customers));
      setNextCursor(nc);
      setPagesLoaded((p) => (append ? p + 1 : 1));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      if (!append) setList([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    const base = list.filter((c) => matchesCustomerSegment(c, segment));
    const searched = q
      ? base.filter(
          (c) =>
            c.email.toLowerCase().includes(q) ||
            c.name.toLowerCase().includes(q) ||
            (c.phone || "").toLowerCase().includes(q)
        )
      : base;

    const dir = sortDir === "asc" ? 1 : -1;
    return [...searched].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return dir * (a.name || a.email).localeCompare(b.name || b.email);
        case "email":
          return dir * a.email.localeCompare(b.email);
        case "bookings":
          return dir * (a.bookingCount - b.bookingCount);
        case "spent":
          return dir * (a.totalSpentCents - b.totalSpentCents);
        case "last":
        default:
          return dir * (a.lastBookingAt ?? a.leadCapturedAt ?? "").localeCompare(b.lastBookingAt ?? b.leadCapturedAt ?? "");
      }
    });
  }, [list, q, sortKey, sortDir, segment]);

  const stats = useMemo(() => {
    const source = filtered;
    const totalSpent = source.reduce((sum, c) => sum + c.totalSpentCents, 0);
    const totalBookings = source.reduce((sum, c) => sum + c.bookingCount, 0);
    const repeats = source.filter((c) => c.bookingCount > 1).length;
    const leads = source.filter((c) => c.kind === "lead").length;
    const avgSpend = source.length > 0 ? Math.round(totalSpent / source.length) : 0;
    return { count: source.length, totalSpent, totalBookings, repeats, avgSpend, leads };
  }, [filtered]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" || key === "email" ? "asc" : "desc");
    }
  }

  function exportCsv() {
    downloadCsv(
      `customers-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Name", "Email", "Phone", "Status", "Bookings", "Total spent (USD)", "Last booking", "Opted in"],
      filtered.map((c) => [
        c.name,
        c.email,
        c.phone,
        customerStatusLabel(c),
        c.bookingCount,
        (c.totalSpentCents / 100).toFixed(2),
        c.lastBookingAt ? c.lastBookingAt.slice(0, 10) : "",
        c.marketingOptIn ? "yes" : "no",
      ])
    );
  }

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return null;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5" aria-hidden />
    ) : (
      <ArrowDown className="h-3.5 w-3.5" aria-hidden />
    );
  };

  if (loading && list.length === 0) {
    return <CustomersSkeleton />;
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <section className="relative overflow-hidden rounded-3xl bg-brand-dark px-5 py-6 text-white shadow-premium sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-brand-primary/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-brand-secondary/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-primary">Customers &amp; leads</h1>
            <p className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
              {stats.count.toLocaleString()}
            </p>
            <p className="mt-2 text-sm text-white/70">
              {q || segment !== "all" ? "Matching this view" : "People who booked or signed up"}
              {pagesLoaded > 0
                ? ` · ${pagesLoaded} booking page${pagesLoaded !== 1 ? "s" : ""} loaded`
                : ""}
              {nextCursor == null && pagesLoaded > 0 ? " · end of history" : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 lg:justify-end">
            <div className="min-w-[140px] rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/55">Total spent</p>
              <p className="mt-1 text-lg font-bold">{formatCents(stats.totalSpent)}</p>
              <p className="text-[11px] text-white/60">From loaded bookings</p>
            </div>
            <div className="min-w-[140px] rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/55">Bookings</p>
              <p className="mt-1 text-lg font-bold">{stats.totalBookings.toLocaleString()}</p>
              <p className="text-[11px] text-white/60">Across this list</p>
            </div>
            <div className="min-w-[140px] rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/55">Leads</p>
              <p className="mt-1 text-lg font-bold">{stats.leads.toLocaleString()}</p>
              <p className="text-[11px] text-white/60">No booking yet</p>
            </div>
            <div className="min-w-[140px] rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/55">Repeat guests</p>
              <p className="mt-1 text-lg font-bold">{stats.repeats.toLocaleString()}</p>
              <p className="text-[11px] text-white/60">More than one booking</p>
            </div>
          </div>
        </div>
        <div className="relative mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
          <p className="max-w-xl text-xs leading-relaxed text-white/55">
            Click a person to open their profile — booking history, emails, and a way to message them. “Load more”
            merges older booking pages into this list.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportCsv}
              disabled={filtered.length === 0}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/20 disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              Export CSV
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>
            {error}
            <Link href="/admin/login" className="ml-2 text-brand-primary hover:underline">
              Sign in
            </Link>
          </span>
          <button
            type="button"
            onClick={() => void loadCustomers()}
            className="inline-flex min-h-[44px] shrink-0 items-center rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-brand-dark/10 bg-white/80 p-4 shadow-sm backdrop-blur-sm sm:p-5">
        <div className="flex min-w-[220px] flex-1 items-center gap-2">
          <Search className="h-4 w-4 shrink-0 text-brand-primary" aria-hidden />
          <label htmlFor="customer-search" className="sr-only">
            Search customers
          </label>
          <input
            id="customer-search"
            type="search"
            placeholder="Search by name, email, or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-[44px] w-full rounded-xl border border-brand-dark/15 bg-brand-bg/40 px-3 py-2.5 text-sm text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
          />
        </div>
        <button
          type="button"
          onClick={() => void loadCustomers()}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand-dark px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark/90"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden />
          {loading ? "Refreshing…" : "Refresh"}
        </button>
        {nextCursor != null && (
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => void loadCustomers({ append: true, cursor: nextCursor })}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-brand-dark/15 bg-white px-4 py-2.5 text-sm font-semibold text-brand-dark transition hover:bg-brand-bg disabled:opacity-60"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        )}
        <div className="flex w-full flex-wrap gap-1.5 pt-1">
          {SEGMENTS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSegment(s.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                segment === s.id
                  ? "bg-brand-dark text-white"
                  : "bg-brand-bg text-brand-muted hover:bg-brand-dark/10 hover:text-brand-dark"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="People"
          value={stats.count.toLocaleString()}
          sub={q || segment !== "all" ? "Matching this view" : "Guests and leads in loaded pages"}
          icon={Users}
          tone="teal"
        />
        <MetricCard
          label="Bookings"
          value={stats.totalBookings.toLocaleString()}
          sub={`${pagesLoaded} page${pagesLoaded !== 1 ? "s" : ""} of booking history`}
          icon={CalendarDays}
          tone="navy"
        />
        <MetricCard
          label="Attributed spend"
          value={formatCents(stats.totalSpent)}
          sub="Paid bookings in this list"
          icon={Wallet}
          tone="pink"
        />
        <MetricCard
          label="Avg. spend"
          value={formatCents(stats.avgSpend)}
          sub={stats.repeats > 0 ? `${stats.repeats} repeat guest${stats.repeats === 1 ? "" : "s"}` : "Per customer in this list"}
          icon={Repeat}
          tone="amber"
        />
      </div>

      <div className="overflow-hidden rounded-3xl border border-brand-dark/10 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-dark/10 px-5 py-4 sm:px-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-dark">
            <Users className="h-5 w-5 text-brand-primary" aria-hidden />
            Customer list
          </h2>
          <p className="text-xs text-brand-muted">
            {filtered.length.toLocaleString()} shown
            {list.length !== filtered.length ? ` of ${list.length.toLocaleString()} loaded` : ""}
            {" · click a row to open"}
          </p>
        </div>

        {!error && filtered.length === 0 && (
          <div className="px-6 py-12 text-center text-sm text-brand-muted">
            {q || segment !== "all" ? "No people match this view." : "No customers or leads yet."}
          </div>
        )}

        {!error && filtered.length > 0 && (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-brand-dark/10 bg-brand-bg/50">
                    {(
                      [
                        ["name", "Name", "text-left"],
                        ["email", "Email", "text-left"],
                        ["bookings", "Bookings", "text-center"],
                        ["spent", "Total spent", "text-right"],
                        ["last", "Last booking", "text-left"],
                      ] as const
                    ).map(([key, label, align]) => (
                      <th key={key} className={cn("px-4 py-3.5 font-medium text-brand-dark", align)}>
                        <button
                          type="button"
                          onClick={() => toggleSort(key)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md hover:text-brand-primary",
                            align === "text-right" && "ml-auto",
                            align === "text-center" && "mx-auto"
                          )}
                        >
                          {label}
                          <SortIcon column={key} />
                        </button>
                      </th>
                    ))}
                    <th className="px-4 py-3.5 text-left font-medium text-brand-dark">Status</th>
                    <th className="px-4 py-3.5 text-left font-medium text-brand-dark">Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const href = customerProfilePath(c.email);
                    return (
                    <tr
                      key={c.email.toLowerCase()}
                      className="cursor-pointer border-b border-brand-dark/5 transition-colors hover:bg-brand-bg/50"
                      onClick={() => router.push(href)}
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-xs font-bold text-brand-primary">
                            {initials(c.name, c.email)}
                          </div>
                          <div className="min-w-0">
                            <Link href={href} className="font-semibold text-brand-dark hover:text-brand-primary" onClick={(e) => e.stopPropagation()}>
                              {c.name || "—"}
                            </Link>
                            {c.lastExperienceName ? (
                              <p className="mt-0.5 text-[11px] text-brand-muted">{c.lastExperienceName}</p>
                            ) : c.kind === "lead" && c.leadSource ? (
                              <p className="mt-0.5 text-[11px] text-brand-muted">
                                {leadSourceLabel(c.leadSource)}
                                {c.leadCapturedAt != null && daysWaiting(c.leadCapturedAt) != null
                                  ? ` · ${daysWaiting(c.leadCapturedAt)}d waiting`
                                  : ""}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <a
                          href={`mailto:${c.email}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 text-brand-primary hover:underline break-all"
                        >
                          <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          {c.email}
                        </a>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="inline-flex min-w-[2rem] justify-center rounded-full bg-brand-dark/5 px-2.5 py-0.5 text-sm font-semibold text-brand-dark">
                          {c.bookingCount}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold text-brand-dark whitespace-nowrap">
                        {formatCents(c.totalSpentCents)}
                      </td>
                      <td className="px-4 py-3.5 text-brand-muted whitespace-nowrap">
                        {c.kind === "lead" ? formatDate(c.leadCapturedAt) : formatDate(c.lastBookingAt)}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide", statusBadgeClass(c))}>
                          {customerStatusLabel(c)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-brand-muted">
                        {c.phone ? (
                          <a href={`tel:${c.phone}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1.5 hover:text-brand-primary">
                            <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            {c.phone}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-brand-dark/5">
              {filtered.map((c) => (
                <Link
                  key={c.email.toLowerCase()}
                  href={customerProfilePath(c.email)}
                  className="flex items-start gap-3 px-4 py-4 hover:bg-brand-bg/50"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-xs font-bold text-brand-primary">
                    {initials(c.name, c.email)}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-brand-dark text-sm">{c.name || "—"}</span>
                      <span className="shrink-0 font-bold text-brand-dark text-sm">{formatCents(c.totalSpentCents)}</span>
                    </div>
                    <p className="text-xs text-brand-primary break-all">{c.email}</p>
                    <p className="text-xs text-brand-muted">
                      <span className={cn("mr-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", statusBadgeClass(c))}>
                        {customerStatusLabel(c)}
                      </span>
                      {c.kind === "lead"
                        ? `${leadSourceLabel(c.leadSource)}${c.leadCapturedAt ? ` · ${formatDate(c.leadCapturedAt)}` : ""}`
                        : `${c.bookingCount} booking${c.bookingCount !== 1 ? "s" : ""}${c.lastBookingAt ? ` · Last: ${formatDate(c.lastBookingAt)}` : ""}`}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
