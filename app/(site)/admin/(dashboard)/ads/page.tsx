"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Megaphone, RefreshCw, MousePointerClick, DollarSign, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminSessionRedirectError, throwIfAdminApiError } from "@/lib/admin-auth-client";
import { GOOGLE_ADS_FINAL_URL_SUFFIX } from "@/lib/ads/attribution";

type AdsRow = {
  id: string;
  kind: "booking" | "contact" | "lead";
  createdAt: string | null;
  name: string;
  email: string;
  campaign: string;
  ad: string | null;
  adGroup: string | null;
  keyword: string | null;
  matchType: string | null;
  network: string | null;
  device: string | null;
  placement: string | null;
  channel: string;
  landingPath: string | null;
  amountCents: number;
  googleAds: boolean;
};

type AdsResponse = {
  bookingsFromAds: number;
  googleAdsBookings: number;
  revenueCents: number;
  leadsFromAds: number;
  rows: AdsRow[];
  error?: string;
};

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    cents / 100
  );
}

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function kindLabel(kind: AdsRow["kind"]) {
  if (kind === "booking") return "Booking";
  if (kind === "contact") return "Contact form";
  return "Lead";
}

export default function AdminAdsPage() {
  const [data, setData] = useState<AdsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ads", { credentials: "include" });
      const json = (await res.json()) as AdsResponse;
      throwIfAdminApiError(res, json, "Failed to load");
      setData(json);
    } catch (e) {
      if (e instanceof AdminSessionRedirectError) return;
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6 sm:space-y-8">
      <section className="relative overflow-hidden rounded-3xl bg-brand-dark px-5 py-6 text-white shadow-premium sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-brand-primary/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-brand-secondary/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-primary">Ads</h1>
            <p className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
              {data ? data.googleAdsBookings : "—"}
            </p>
            <p className="mt-2 text-sm text-white/70">Website bookings that started from a Google Ad click</p>
          </div>
          <div className="flex flex-wrap gap-3 lg:justify-end">
            <div className="min-w-[140px] rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/55">Ad booking revenue</p>
              <p className="mt-1 text-lg font-bold">{data ? formatCents(data.revenueCents) : "—"}</p>
            </div>
            <div className="min-w-[140px] rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/55">Leads & contacts</p>
              <p className="mt-1 text-lg font-bold">{data ? data.leadsFromAds : "—"}</p>
            </div>
          </div>
        </div>
        <div className="relative mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
          <p className="max-w-xl text-xs leading-relaxed text-white/55">
            This tracks people who clicked a Google Ad, then booked or left their info on the website — including
            campaign, ad, keyword, device, and where they landed. Old ads from before this tracker will not show up
            here. Each new website booking also sends the dollar amount to Google so the ads can learn from real
            bookings.
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden />
            Refresh
          </button>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-brand-dark/10 bg-white p-5 shadow-sm">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary">
            <MousePointerClick className="h-5 w-5" aria-hidden />
          </div>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-muted">Ad bookings</p>
          <p className="mt-1 font-display text-2xl font-bold text-brand-dark">{data?.bookingsFromAds ?? "—"}</p>
        </div>
        <div className="rounded-2xl border border-brand-dark/10 bg-white p-5 shadow-sm">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-dark/10 text-brand-dark">
            <DollarSign className="h-5 w-5" aria-hidden />
          </div>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-muted">Revenue from those</p>
          <p className="mt-1 font-display text-2xl font-bold text-brand-dark">
            {data ? formatCents(data.revenueCents) : "—"}
          </p>
        </div>
        <div className="rounded-2xl border border-brand-dark/10 bg-white p-5 shadow-sm">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-secondary/10 text-brand-secondary">
            <Mail className="h-5 w-5" aria-hidden />
          </div>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-muted">Ad leads</p>
          <p className="mt-1 font-display text-2xl font-bold text-brand-dark">{data?.leadsFromAds ?? "—"}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-brand-dark/10 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-brand-dark/10 px-5 py-4 sm:px-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-dark">
            <Megaphone className="h-5 w-5 text-brand-primary" aria-hidden />
            What converted from ads
          </h2>
        </div>
        {loading && !data ? (
          <div className="h-48 animate-pulse bg-brand-bg/40" />
        ) : !data?.rows.length ? (
          <div className="px-5 py-12 text-center sm:px-6">
            <p className="text-sm font-medium text-brand-dark">No ad conversions yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-brand-muted">
              After someone clicks a Google Ad and then books or fills out a form, they will show up here. Campaign
              spend still lives in Google Ads.
            </p>
            <Link href="/admin/bookings" className="mt-4 inline-block text-sm font-semibold text-brand-primary hover:underline">
              View all bookings
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <thead>
                <tr className="border-b border-brand-dark/10 bg-brand-bg/50 text-left">
                  <th className="px-4 py-3 font-medium text-brand-dark">When</th>
                  <th className="px-4 py-3 font-medium text-brand-dark">What</th>
                  <th className="px-4 py-3 font-medium text-brand-dark">Person</th>
                  <th className="px-4 py-3 font-medium text-brand-dark">Campaign / ad</th>
                  <th className="px-4 py-3 font-medium text-brand-dark">Keyword</th>
                  <th className="px-4 py-3 font-medium text-brand-dark">Device</th>
                  <th className="px-4 py-3 font-medium text-brand-dark">Page</th>
                  <th className="px-4 py-3 text-right font-medium text-brand-dark">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={`${row.kind}-${row.id}`} className="border-b border-brand-dark/5 hover:bg-brand-bg/30">
                    <td className="whitespace-nowrap px-4 py-3 text-brand-muted">{formatWhen(row.createdAt)}</td>
                    <td className="px-4 py-3 font-medium text-brand-dark">{kindLabel(row.kind)}</td>
                    <td className="px-4 py-3">
                      <p className="text-brand-dark">{row.name}</p>
                      <p className="text-xs text-brand-muted">{row.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-brand-dark">{row.campaign}</p>
                      <p className="text-xs text-brand-muted">{row.ad ?? row.adGroup ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-brand-dark">{row.keyword ?? "—"}</p>
                      <p className="text-xs text-brand-muted">
                        {[row.matchType, row.network].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-brand-dark">{row.device ?? "—"}</p>
                      {row.placement ? (
                        <p className="max-w-[10rem] truncate text-xs text-brand-muted">{row.placement}</p>
                      ) : null}
                    </td>
                    <td className="max-w-[12rem] truncate px-4 py-3 text-xs text-brand-muted">{row.landingPath ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-brand-dark">
                      {row.kind === "booking" ? formatCents(row.amountCents) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-brand-dark/10 bg-white px-5 py-5 shadow-sm sm:px-6">
        <h2 className="text-sm font-semibold text-brand-dark">Final URL suffix</h2>
        <p className="mt-2 text-sm text-brand-muted">
          On the Tracking screen you already found, replace whatever is in Final URL suffix with this. Leave Tracking
          template blank. Google will then send campaign, ad, keyword, device, and network on each click.
        </p>
        <code className="mt-3 block break-all rounded-xl bg-brand-bg px-3 py-2 text-xs text-brand-dark">
          {GOOGLE_ADS_FINAL_URL_SUFFIX}
        </code>
      </div>
    </div>
  );
}
