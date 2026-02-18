"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type RequestItem = {
  id: string;
  bookingId: string;
  status: string;
  signerName?: string;
  signerEmail?: string;
  signingUrl: string;
  sent?: { initialSentAt?: unknown; lastSentAt?: unknown; reminder1SentAt?: unknown };
  signed?: { signedAt?: unknown };
  createdAt: unknown;
};

function formatDate(v: unknown): string {
  if (!v) return "—";
  if (typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  if (typeof (v as { seconds?: number }).seconds === "number") {
    return new Date((v as { seconds: number }).seconds * 1000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  return "—";
}

export default function WaiverRequestsPage() {
  const [list, setList] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (search.trim()) params.set("search", search.trim());
    const qs = params.toString();
    fetch(`/api/admin/waiver-requests${qs ? `?${qs}` : ""}`, { credentials: "include" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        return data.requests ?? [];
      })
      .then(setList)
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [statusFilter, search]);

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {});
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark">Waiver requests</h1>
          <p className="mt-1 text-sm text-brand-muted">
            Track sent, pending, and signed waivers. Resend or copy signing link.
          </p>
        </div>
        <Link href="/admin/waivers/templates">
          <Button variant="outline">Templates</Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-brand-dark/20 px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="signed">Signed</option>
          <option value="expired">Expired</option>
          <option value="void">Void</option>
        </select>
        <input
          type="search"
          placeholder="Search guest or booking ID"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-brand-dark/20 px-3 py-2 text-sm w-48"
        />
      </div>

      {loading && <p className="text-brand-muted">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}
      {!loading && !error && (
        <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 overflow-hidden">
          {list.length === 0 ? (
            <div className="p-8 text-center text-brand-muted">
              No requests match your filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-dark/10 bg-brand-bg/30">
                    <th className="text-left p-3 font-medium text-brand-dark">Guest</th>
                    <th className="text-left p-3 font-medium text-brand-dark">Booking</th>
                    <th className="text-left p-3 font-medium text-brand-dark">Status</th>
                    <th className="text-left p-3 font-medium text-brand-dark">Sent</th>
                    <th className="text-left p-3 font-medium text-brand-dark">Signed</th>
                    <th className="text-right p-3 font-medium text-brand-dark">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id} className="border-b border-brand-dark/5 hover:bg-brand-primary/5">
                      <td className="p-3">
                        <p className="font-medium text-brand-dark">{r.signerName ?? "—"}</p>
                        <p className="text-brand-muted text-xs">{r.signerEmail ?? ""}</p>
                      </td>
                      <td className="p-3 text-brand-muted font-mono text-xs">{r.bookingId}</td>
                      <td className="p-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            r.status === "signed"
                              ? "bg-green-100 text-green-800"
                              : r.status === "pending"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="p-3 text-brand-muted">{formatDate(r.sent?.lastSentAt ?? r.sent?.initialSentAt)}</td>
                      <td className="p-3 text-brand-muted">{r.status === "signed" ? formatDate(r.signed?.signedAt) : "—"}</td>
                      <td className="p-3 text-right">
                        <Link href={`/admin/waivers/requests/${r.id}`}>
                          <Button variant="ghost" size="sm">View</Button>
                        </Link>
                        {r.status === "signed" && (
                          <a
                            href={`/api/waiver/pdf/${r.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-1 text-brand-primary hover:underline text-sm"
                          >
                            PDF
                          </a>
                        )}
                        {r.status === "pending" && (
                          <button
                            type="button"
                            onClick={() => copyLink(r.signingUrl)}
                            className="ml-1 text-brand-primary hover:underline text-sm"
                          >
                            Copy link
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
