"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DollarSign,
  Calendar,
  Users,
  BookOpen,
  List,
  TrendingUp,
  TrendingDown,
  Minus,
  Ship,
  Mail,
  ChevronRight,
  Sparkles,
} from "lucide-react";

type DashboardStats = {
  totalRevenueCents: number;
  revenueThisMonthCents: number;
  revenueLastMonthCents: number;
  bookingCountTotal: number;
  uniqueCustomerCount: number;
  listingCount: number;
  /** Booking confirmation emails stuck in notification outbox (dead letter). Resend via booking admin. */
  confirmationDeadLetterCount?: number;
  /** Last-500 sample: slot-taken bookings missing boatId where per-boat occupancy applies (shared ticketed excluded). */
  recentBookingsMissingBoatId?: number;
  recentBookings: {
    id: string;
    createdAt: string;
    customerEmail: string;
    customerName: string;
    totalCents: number;
    status: string;
    experienceName: string;
  }[];
  upcomingBookings: {
    id: string;
    tripDateStr: string;
    timeLabel: string;
    experienceName: string;
    customerName: string;
    customerEmail: string;
    totalCents: number;
  }[];
  notificationOutboxStats?: {
    byType: {
      booking_confirmation: { pending: number; deadLetter: number; stuckClaims: number };
      final_charge_success: { pending: number; deadLetter: number; stuckClaims: number };
      discount_limit_exceeded_notification: { pending: number; deadLetter: number; stuckClaims: number };
      waiver_invite_send: { pending: number; deadLetter: number; stuckClaims: number };
    };
    staleClaimCountsByTemplate: Record<string, number>;
    deadLetterTotal: number;
    pendingTotal: number;
    stuckClaimsTotal: number;
  };
};

function StatCard({
  href,
  label,
  value,
  sub,
  icon: Icon,
  trend,
}: {
  href: string;
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: "up" | "down" | "flat";
}) {
  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-2xl border border-brand-dark/10 bg-white p-5 shadow-sm transition-all hover:border-brand-primary/25 hover:shadow-md sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-brand-dark sm:text-3xl">{value}</p>
          {sub != null && sub !== "" && (
            <p className="mt-1 text-sm text-brand-muted">{sub}</p>
          )}
          {trend !== undefined && (
            <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium">
              {trend === "up" && <TrendingUp className="h-4 w-4 text-emerald-600" aria-hidden />}
              {trend === "down" && <TrendingDown className="h-4 w-4 text-amber-600" aria-hidden />}
              {trend === "flat" && <Minus className="h-4 w-4 text-brand-muted" aria-hidden />}
              {trend === "up" && <span className="text-emerald-700">vs last month</span>}
              {trend === "down" && <span className="text-amber-700">vs last month</span>}
              {trend === "flat" && <span className="text-brand-muted">vs last month</span>}
            </span>
          )}
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary transition-colors group-hover:bg-brand-primary/20">
          <Icon className="h-6 w-6" aria-hidden />
        </div>
      </div>
      <span className="absolute right-4 top-4 opacity-0 transition-opacity group-hover:opacity-100">
        <ChevronRight className="h-5 w-5 text-brand-muted" aria-hidden />
      </span>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-brand-dark/10 bg-white p-5 sm:p-6 animate-pulse">
      <div className="h-4 w-24 rounded bg-brand-dark/10" />
      <div className="mt-3 h-8 w-32 rounded bg-brand-dark/15" />
      <div className="mt-2 h-4 w-16 rounded bg-brand-dark/10" />
    </div>
  );
}

export default function AdminHomePage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [healthResult, setHealthResult] = useState<Record<string, unknown> | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const checkBookingHealth = useCallback(() => {
    setHealthLoading(true);
    setHealthResult(null);
    fetch("/api/health", { credentials: "include" })
      .then(async (res) => ({ status: res.status, ...(await res.json().catch(() => ({}))) }))
      .then(setHealthResult)
      .catch((e) => setHealthResult({ error: e instanceof Error ? e.message : String(e) }))
      .finally(() => setHealthLoading(false));
  }, []);
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
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(cents / 100);
  }

  function revenueTrend(thisMonth: number, lastMonth: number): "up" | "down" | "flat" {
    if (lastMonth === 0) return thisMonth > 0 ? "up" : "flat";
    const pct = ((thisMonth - lastMonth) / lastMonth) * 100;
    if (pct > 2) return "up";
    if (pct < -2) return "down";
    return "flat";
  }

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();
  const dateLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="space-y-8 sm:space-y-10">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">Dashboard</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-brand-muted">
            <Sparkles className="h-4 w-4 text-brand-primary" aria-hidden />
            {greeting} — {dateLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={checkBookingHealth}
          disabled={healthLoading}
          className="rounded-xl border border-brand-dark/15 bg-white px-4 py-2 text-sm font-medium text-brand-dark shadow-sm transition-colors hover:bg-brand-bg disabled:opacity-60"
        >
          {healthLoading ? "Checking…" : "Check booking health"}
        </button>
      </div>
      {healthResult != null && (
        <div className="space-y-3">
          {(healthResult as Record<string, unknown>).manageBookingSecret === "not_configured" && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900" role="alert">
              <p className="font-semibold">MANAGE_BOOKING_SECRET not set</p>
              <p className="mt-1 text-sm">
                Receipt links, manage-booking links, and release-token signing are degraded or unavailable. Set MANAGE_BOOKING_SECRET in your environment so confirmation emails and customer links work correctly.
              </p>
            </div>
          )}
          <div className="rounded-2xl border border-brand-dark/10 bg-white p-4 font-mono text-xs text-brand-dark overflow-x-auto">
            <pre className="whitespace-pre-wrap break-words">{JSON.stringify(healthResult, null, 2)}</pre>
          </div>
        </div>
      )}

      {loading && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-brand-dark/10 bg-white p-6 animate-pulse">
              <div className="h-6 w-40 rounded bg-brand-dark/10" />
              <div className="mt-4 space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-14 rounded-lg bg-brand-dark/5" />
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-brand-dark/10 bg-white p-6 animate-pulse">
              <div className="h-6 w-32 rounded bg-brand-dark/10" />
              <div className="mt-4 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-12 rounded-lg bg-brand-dark/5" />
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {error && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-800 shadow-sm">
          <p className="font-medium">{error}</p>
          {(error.includes("Unauthorized") || error.includes("not configured")) && (
            <Link href="/admin/login" className="mt-3 inline-block text-sm font-semibold text-brand-primary hover:underline">
              Sign in →
            </Link>
          )}
        </div>
      )}

      {!loading && stats && (
        <>
          {(stats.confirmationDeadLetterCount ?? 0) > 0 && (
            <div
              className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 sm:px-5 sm:py-4"
              role="status"
            >
              <p className="font-semibold">Confirmation emails need attention</p>
              <p className="mt-1 text-sm text-amber-900/95">
                {stats.confirmationDeadLetterCount} booking confirmation
                {stats.confirmationDeadLetterCount === 1 ? " is" : "s are"} in a failed queue (dead letter). Open the
                booking in{" "}
                <Link href="/admin/bookings" className="font-medium text-amber-950 underline underline-offset-2">
                  Bookings
                </Link>{" "}
                and use resend confirmation, or check operational alerts in Firestore.
              </p>
            </div>
          )}
          {stats.notificationOutboxStats && (
            <div className="rounded-2xl border border-brand-dark/10 bg-white px-4 py-3 text-sm shadow-sm sm:px-5">
              <p className="font-semibold text-brand-dark">Notification outbox</p>
              <p className="mt-1 text-brand-muted">
                Booking confirmations — pending: {stats.notificationOutboxStats.byType.booking_confirmation.pending}, dead
                letter: {stats.notificationOutboxStats.byType.booking_confirmation.deadLetter}, stuck claims:{" "}
                {stats.notificationOutboxStats.byType.booking_confirmation.stuckClaims}. Final-charge / waiver / discount
                rows also tracked in ops; see cron logs for full breakdown.
              </p>
            </div>
          )}
          {(stats.recentBookingsMissingBoatId ?? 0) > 0 && (
            <div
              className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-red-950 sm:px-5 sm:py-4"
              role="alert"
            >
              <p className="font-semibold">Bookings missing boat ID (per-boat occupancy)</p>
              <p className="mt-1 text-sm text-red-900/95">
                {stats.recentBookingsMissingBoatId} of the last 500 bookings (by creation time) are in a slot-taken status, have no{" "}
                <code className="rounded bg-red-100/80 px-1">boatId</code>, and are on experiences where a boat is required for calendar occupancy
                (charter listings, and ticketed departures booked as private charter). This count does{" "}
                <span className="font-medium">not</span> include shared ticketed tickets (pooled inventory; no per-boat{" "}
                <code className="rounded bg-red-100/80 px-1">boatId</code> on the booking). If this number is non-zero, run the backfill (
                <code className="rounded bg-red-100/80 px-1">POST /api/admin/backfill-booking-boat-ids</code> with body{" "}
                <code className="rounded bg-red-100/80 px-1">{`{ "applyUpdates": true }`}</code> or{" "}
                <code className="rounded bg-red-100/80 px-1">{`{ "dryRun": false }`}</code>) or assign{" "}
                <code className="rounded bg-red-100/80 px-1">boatId</code> manually. See docs/BOOKING_AVAILABILITY.md.
              </p>
            </div>
          )}
          {/* KPI row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              href="/admin/financials"
              label="Revenue (all time)"
              value={formatCents(stats.totalRevenueCents)}
              icon={DollarSign}
            />
            <StatCard
              href="/admin/financials"
              label="This month"
              value={formatCents(stats.revenueThisMonthCents)}
              sub={`Last month: ${formatCents(stats.revenueLastMonthCents ?? 0)}`}
              trend={revenueTrend(stats.revenueThisMonthCents, stats.revenueLastMonthCents ?? 0)}
              icon={TrendingUp}
            />
            <StatCard
              href="/admin/bookings"
              label="Bookings"
              value={stats.bookingCountTotal}
              icon={BookOpen}
            />
            <StatCard
              href="/admin/customers"
              label="Recent customers (last 500 bookings, unique by email)"
              value={stats.uniqueCustomerCount}
              icon={Users}
            />
          </div>

          {/* Upcoming + Recent + Quick actions */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Upcoming trips */}
            <div className="rounded-2xl border border-brand-dark/10 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-brand-dark/10 px-5 py-4 sm:px-6">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-dark">
                  <Calendar className="h-5 w-5 text-brand-primary" aria-hidden />
                  Upcoming trips
                </h2>
                <Link
                  href="/admin/bookings"
                  className="text-sm font-medium text-brand-primary hover:underline"
                >
                  View all
                </Link>
              </div>
              <div className="min-h-[200px]">
                {Array.isArray(stats.upcomingBookings) && stats.upcomingBookings.length > 0 ? (
                  <ul className="divide-y divide-brand-dark/5">
                    {stats.upcomingBookings.slice(0, 7).map((b) => (
                      <li key={b.id}>
                        <Link
                          href={`/admin/bookings?highlight=${b.id}`}
                          className="flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors hover:bg-brand-bg/80 sm:px-6"
                        >
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-brand-dark">
                              {new Date(b.tripDateStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                            </span>
                            <span className="text-xs text-brand-muted">{b.timeLabel}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-brand-dark">{b.experienceName}</p>
                            <p className="truncate text-xs text-brand-muted">{b.customerName || b.customerEmail || "—"}</p>
                          </div>
                          <span className="text-sm font-semibold text-brand-primary">{formatCents(b.totalCents)}</span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-brand-muted" aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                    <Calendar className="h-12 w-12 text-brand-dark/20" aria-hidden />
                    <p className="mt-3 text-sm text-brand-muted">No trips in the next 7 days</p>
                    <Link href="/admin/bookings" className="mt-2 text-sm font-medium text-brand-primary hover:underline">
                      View bookings
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {/* Recent bookings */}
            <div className="rounded-2xl border border-brand-dark/10 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-brand-dark/10 px-5 py-4 sm:px-6">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-dark">
                  <BookOpen className="h-5 w-5 text-brand-primary" aria-hidden />
                  Recent bookings
                </h2>
                <Link
                  href="/admin/bookings"
                  className="text-sm font-medium text-brand-primary hover:underline"
                >
                  View all
                </Link>
              </div>
              <div className="min-h-[200px]">
                {stats.recentBookings && stats.recentBookings.length > 0 ? (
                  <ul className="divide-y divide-brand-dark/5">
                    {stats.recentBookings.slice(0, 6).map((b) => (
                      <li key={b.id}>
                        <Link
                          href={`/admin/bookings?highlight=${b.id}`}
                          className="flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors hover:bg-brand-bg/80 sm:px-6"
                        >
                          <span className="text-xs text-brand-muted">
                            {b.createdAt ? new Date(b.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—"}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-brand-dark">{b.experienceName}</p>
                            <p className="truncate text-xs text-brand-muted">{b.customerName || b.customerEmail || "—"}</p>
                          </div>
                          <span className="text-sm font-semibold text-brand-dark">{formatCents(b.totalCents)}</span>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              b.status === "paid" ? "bg-emerald-100 text-emerald-800" : "bg-brand-dark/10 text-brand-muted"
                            }`}
                          >
                            {b.status}
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-brand-muted" aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                    <BookOpen className="h-12 w-12 text-brand-dark/20" aria-hidden />
                    <p className="mt-3 text-sm text-brand-muted">No bookings yet</p>
                    <p className="mt-1 text-xs text-brand-muted">Share your listing link to get started</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="rounded-2xl border border-brand-dark/10 bg-gradient-to-br from-brand-primary/5 to-brand-dark/5 p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-brand-dark">Quick actions</h2>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/admin/experiences/new"
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-primary/90 hover:shadow"
              >
                <Sparkles className="h-4 w-4" aria-hidden />
                Create listing
              </Link>
              <Link
                href="/admin/experiences"
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border-2 border-brand-dark/15 bg-white px-5 py-2.5 text-sm font-medium text-brand-dark transition-colors hover:border-brand-primary/30 hover:bg-brand-bg/50"
              >
                <List className="h-4 w-4" aria-hidden />
                Listings ({stats.listingCount})
              </Link>
              <Link
                href="/admin/boats"
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border-2 border-brand-dark/15 bg-white px-5 py-2.5 text-sm font-medium text-brand-dark transition-colors hover:border-brand-primary/30 hover:bg-brand-bg/50"
              >
                <Ship className="h-4 w-4" aria-hidden />
                Boats
              </Link>
              <Link
                href="/admin/bookings"
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border-2 border-brand-dark/15 bg-white px-5 py-2.5 text-sm font-medium text-brand-dark transition-colors hover:border-brand-primary/30 hover:bg-brand-bg/50"
              >
                <BookOpen className="h-4 w-4" aria-hidden />
                Bookings
              </Link>
              <Link
                href="/admin/financials"
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border-2 border-brand-dark/15 bg-white px-5 py-2.5 text-sm font-medium text-brand-dark transition-colors hover:border-brand-primary/30 hover:bg-brand-bg/50"
              >
                <DollarSign className="h-4 w-4" aria-hidden />
                Financials
              </Link>
              <Link
                href="/admin/emails"
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border-2 border-brand-dark/15 bg-white px-5 py-2.5 text-sm font-medium text-brand-dark transition-colors hover:border-brand-primary/30 hover:bg-brand-bg/50"
              >
                <Mail className="h-4 w-4" aria-hidden />
                Emails
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
