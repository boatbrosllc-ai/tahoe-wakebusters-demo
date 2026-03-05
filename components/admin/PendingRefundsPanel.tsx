"use client";

import { useEffect, useState } from "react";

type PendingRefundRow = {
  id: string;
  bookingId?: string;
  holdId?: string;
  duplicatePaymentIntentId?: string;
  reason: string;
  status: string;
  createdAt: string | null;
};

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

function formatReason(reason: string) {
  return reason
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function PendingRefundsPanel() {
  const [refunds, setRefunds] = useState<PendingRefundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/pending-refunds", { credentials: "include" })
      .then((res) => res.json().catch(() => ({})))
      .then((data) => {
        if (data.error) {
          setError(data.error + (data.hint ? ` ${data.hint}` : ""));
          return;
        }
        setRefunds(Array.isArray(data.refunds) ? data.refunds : []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-brand-dark border-b border-brand-dark/10 pb-3 mb-4">
          Pending refunds
        </h2>
        <div className="py-6 text-center text-brand-muted text-sm">Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-brand-dark border-b border-brand-dark/10 pb-3 mb-4">
          Pending refunds
        </h2>
        <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-red-700 text-sm">{error}</div>
      </div>
    );
  }

  const count = refunds.length;
  return (
    <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 overflow-hidden">
      <h2 className="px-4 py-4 sm:px-6 border-b border-brand-dark/10 text-lg font-semibold text-brand-dark flex items-center gap-2">
        Pending refunds
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            count > 0 ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-800"
          }`}
        >
          {count}
        </span>
      </h2>
      {count === 0 ? (
        <div className="p-6 text-center text-brand-muted text-sm">No pending refunds</div>
      ) : (
        <>
          <div className="hidden md:block overflow-x-auto -mx-px">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-brand-dark/10 bg-brand-bg/50">
                  <th className="px-3 py-3 sm:px-4 sm:py-4 text-left font-medium text-brand-dark">Date</th>
                  <th className="px-3 py-3 sm:px-4 sm:py-4 text-left font-medium text-brand-dark">Reason</th>
                  <th className="px-3 py-3 sm:px-4 sm:py-4 text-left font-medium text-brand-dark">
                    Booking / Hold ID
                  </th>
                  <th className="px-3 py-3 sm:px-4 sm:py-4 text-left font-medium text-brand-dark">
                    Payment Intent ID
                  </th>
                </tr>
              </thead>
              <tbody>
                {refunds.map((r) => (
                  <tr key={r.id} className="border-b border-brand-dark/5 hover:bg-brand-bg/30">
                    <td className="px-3 py-3 sm:px-4 sm:py-4 text-brand-muted whitespace-nowrap">
                      {formatDate(r.createdAt)}
                    </td>
                    <td className="px-3 py-3 sm:px-4 sm:py-4 text-brand-dark">{formatReason(r.reason)}</td>
                    <td className="px-3 py-3 sm:px-4 sm:py-4 text-brand-dark break-all">
                      {r.bookingId ?? r.holdId ?? "—"}
                    </td>
                    <td className="px-3 py-3 sm:px-4 sm:py-4 text-brand-dark break-all font-mono text-xs">
                      {r.duplicatePaymentIntentId ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden divide-y divide-brand-dark/5">
            {refunds.map((r) => (
              <div key={r.id} className="px-4 py-3 space-y-1">
                <p className="text-xs text-brand-muted">{formatDate(r.createdAt)}</p>
                <p className="font-semibold text-brand-dark text-sm">{formatReason(r.reason)}</p>
                <p className="text-xs text-brand-muted">
                  {r.bookingId ?? r.holdId ?? "—"}
                </p>
                <p className="text-xs text-brand-muted break-all font-mono">
                  {r.duplicatePaymentIntentId ?? "—"}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
