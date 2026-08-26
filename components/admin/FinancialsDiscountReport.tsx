"use client";

import { useState } from "react";
import Link from "next/link";
import { getAdminBookingStatusBadgeClass } from "@/lib/admin/admin-booking-status-badge";
import { DISCOUNT_ASSIGNED_TO_TYPE_LABELS } from "@/lib/booking/discount-assignment";
import {
  UNASSIGNED_DISCOUNT_OWNER_LABEL,
  type DiscountCodeReportRow,
  type DiscountFinancialsReport,
  type DiscountOwnerReportRow,
} from "@/lib/booking/discount-financials";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Tag, Users } from "lucide-react";

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

function formatPct(share: number) {
  return `${(share * 100).toFixed(1)}%`;
}

function assignedLabel(row: { assignedTo: string | null; assignedToType: DiscountCodeReportRow["assignedToType"] }) {
  if (!row.assignedTo) return UNASSIGNED_DISCOUNT_OWNER_LABEL;
  const type = row.assignedToType ? DISCOUNT_ASSIGNED_TO_TYPE_LABELS[row.assignedToType] : null;
  return type ? `${row.assignedTo} · ${type}` : row.assignedTo;
}

function PromoShareBar({ share }: { share: number }) {
  const width = Math.max(0, Math.min(100, share * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-brand-dark/10">
      <div
        className="h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-secondary"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

export function FinancialsDiscountReport({
  report,
  disclaimer,
  onExportCsv,
}: {
  report: DiscountFinancialsReport;
  disclaimer?: string;
  onExportCsv: () => void;
}) {
  const [openCode, setOpenCode] = useState<DiscountCodeReportRow | null>(null);
  const converted = report.byCode.filter((r) => r.conversionCount > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-dark">
            <Tag className="h-5 w-5 text-brand-primary" aria-hidden />
            Promo code conversions
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-brand-muted">
            Completed bookings in the current filters, grouped by code and owner. Manage codes on{" "}
            <Link href="/admin/discounts" className="font-medium text-brand-primary hover:underline">
              Discounts
            </Link>
            .
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onExportCsv} disabled={converted.length === 0} className="gap-1.5">
          <Download className="h-3.5 w-3.5" aria-hidden />
          Export promo CSV
        </Button>
      </div>

      {disclaimer && (
        <p className="rounded-2xl border border-brand-dark/10 bg-white/80 px-4 py-3 text-xs leading-relaxed text-brand-muted">
          {disclaimer}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="relative overflow-hidden rounded-2xl border border-brand-dark/10 bg-white p-5 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-secondary to-brand-secondary/40" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-muted">Discount given</p>
          <p className="mt-2 font-display text-2xl font-bold text-brand-dark">{formatCents(report.totalDiscountGivenCents)}</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-brand-dark/10 bg-white p-5 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-primary to-brand-primary/40" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-muted">Converted bookings</p>
          <p className="mt-2 font-display text-2xl font-bold text-brand-dark">{report.discountedBookingCount}</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-brand-dark/10 bg-white p-5 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-dark to-brand-primary" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-muted">Net revenue with a code</p>
          <p className="mt-2 font-display text-2xl font-bold text-brand-dark">{formatCents(report.discountedRevenueCents)}</p>
        </div>
      </div>

      <OwnerTable rows={report.byOwner} />
      <CodeTable rows={report.byCode} onOpen={setOpenCode} />

      <Dialog
        open={openCode != null}
        onOpenChange={(open) => {
          if (!open) setOpenCode(null);
        }}
        title={openCode ? `${openCode.code} conversions` : "Code conversions"}
        description={
          openCode
            ? `${assignedLabel(openCode)} · ${openCode.conversionCount} booking${openCode.conversionCount === 1 ? "" : "s"} · ${formatCents(openCode.discountCents)} given`
            : undefined
        }
        fullScreenOnMobile
      >
        {openCode && (
          <div className="space-y-3">
            {openCode.redemptions.length === 0 ? (
              <p className="text-sm text-brand-muted">No converted bookings for this code in the current filters.</p>
            ) : (
              <ul className="divide-y divide-brand-dark/10 rounded-xl border border-brand-dark/10 overflow-hidden">
                {openCode.redemptions.map((r) => (
                  <li key={r.bookingId} className="px-3 py-3 text-sm space-y-1 bg-white">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/admin/bookings?highlight=${encodeURIComponent(r.bookingId)}`}
                        className="font-medium text-brand-primary hover:underline break-all"
                      >
                        {r.customerName || r.customerEmail || r.bookingId}
                      </Link>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${getAdminBookingStatusBadgeClass(r.status)}`}>
                        {r.status}
                      </span>
                    </div>
                    <p className="text-xs text-brand-muted">
                      {formatDate(r.createdAt)} · {r.experienceName} · {r.customerEmail || "—"}
                    </p>
                    <p className="text-xs text-brand-dark">
                      Discount {formatCents(r.discountCents)} · Net {formatCents(r.netRevenueCents)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={() => setOpenCode(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function OwnerTable({ rows }: { rows: DiscountOwnerReportRow[] }) {
  const maxRevenue = rows.reduce((m, r) => Math.max(m, r.netRevenueCents), 0) || 1;
  return (
    <div className="overflow-hidden rounded-3xl border border-brand-dark/10 bg-white shadow-sm">
      <div className="border-b border-brand-dark/10 px-5 py-4 sm:px-6">
        <h3 className="flex items-center gap-2 text-base font-semibold text-brand-dark">
          <Users className="h-4 w-4 text-brand-primary" aria-hidden />
          By owner / partner
        </h3>
        <p className="mt-1 text-xs text-brand-muted">Who the converting codes are connected to in the selected range.</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-brand-muted">No promo conversions in this range.</p>
      ) : (
        <ul className="divide-y divide-brand-dark/5">
          {rows.map((row) => (
            <li key={`${row.assignedTo}:${row.assignedToType ?? ""}`} className="px-5 py-4 sm:px-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="font-semibold text-brand-dark">{row.assignedTo}</p>
                  <p className="text-xs text-brand-muted">
                    {row.assignedToType ? DISCOUNT_ASSIGNED_TO_TYPE_LABELS[row.assignedToType] : "Uncategorized"} · {row.conversionCount} conversion
                    {row.conversionCount === 1 ? "" : "s"} · {row.codeCount} code{row.codeCount === 1 ? "" : "s"}
                  </p>
                </div>
                <p className="text-sm font-bold text-brand-dark">{formatCents(row.netRevenueCents)}</p>
              </div>
              <PromoShareBar share={row.netRevenueCents / maxRevenue} />
              <p className="mt-1 text-[11px] text-brand-muted">
                {row.uniqueCustomerCount} customer{row.uniqueCustomerCount === 1 ? "" : "s"} · {formatCents(row.discountCents)} given
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CodeTable({
  rows,
  onOpen,
}: {
  rows: DiscountCodeReportRow[];
  onOpen: (row: DiscountCodeReportRow) => void;
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-brand-dark/10 bg-white shadow-sm">
      <div className="border-b border-brand-dark/10 px-5 py-4 sm:px-6">
        <h3 className="flex items-center gap-2 text-base font-semibold text-brand-dark">
          <Tag className="h-4 w-4 text-brand-primary" aria-hidden />
          By code
        </h3>
        <p className="mt-1 text-xs text-brand-muted">Click a code to see who used it. Active unused codes are listed at $0.</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-brand-muted">No discount codes in catalog and none on bookings in this range.</p>
      ) : (
        <>
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-brand-dark/10 bg-brand-bg/40">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-brand-muted">Code</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-brand-muted">Connected to</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-brand-muted">Conversions</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-brand-muted">Customers</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-brand-muted">Discount given</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-brand-muted">Net revenue</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-brand-muted">Share</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-brand-muted">Hold uses</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.code} className="border-b border-brand-dark/5 hover:bg-brand-bg/40">
                    <td className="px-4 py-3.5">
                      <button
                        type="button"
                        onClick={() => onOpen(row)}
                        className="rounded-full bg-brand-dark px-2.5 py-1 font-mono text-xs font-semibold text-white hover:bg-brand-dark/90"
                      >
                        {row.code}
                      </button>
                    </td>
                    <td className="px-4 py-3.5 text-brand-dark">{assignedLabel(row)}</td>
                    <td className="px-4 py-3.5 text-right font-semibold text-brand-dark">{row.conversionCount}</td>
                    <td className="px-4 py-3.5 text-right text-brand-muted">{row.uniqueCustomerCount}</td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">{formatCents(row.discountCents)}</td>
                    <td className="px-4 py-3.5 text-right font-bold whitespace-nowrap">{formatCents(row.netRevenueCents)}</td>
                    <td className="min-w-[120px] px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <PromoShareBar share={row.shareOfRevenue} />
                        <span className="w-10 shrink-0 text-right text-[11px] text-brand-muted">{formatPct(row.shareOfRevenue)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right text-brand-muted">
                      {row.usedCount == null ? "—" : row.maxRedemptions != null ? `${row.usedCount} / ${row.maxRedemptions}` : String(row.usedCount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="lg:hidden divide-y divide-brand-dark/5">
            {rows.map((row) => (
              <button
                key={row.code}
                type="button"
                onClick={() => onOpen(row)}
                className="w-full space-y-2 px-5 py-4 text-left hover:bg-brand-bg/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-brand-dark px-2.5 py-1 font-mono text-xs font-semibold text-white">{row.code}</span>
                  <span className="text-sm font-bold text-brand-dark">{formatCents(row.netRevenueCents)}</span>
                </div>
                <p className="text-xs text-brand-muted">{assignedLabel(row)}</p>
                <PromoShareBar share={row.shareOfRevenue} />
                <p className="text-xs text-brand-muted">
                  {row.conversionCount} conversion{row.conversionCount === 1 ? "" : "s"} · {formatCents(row.discountCents)} given
                </p>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
