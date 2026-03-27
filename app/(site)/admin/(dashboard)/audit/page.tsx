"use client";

import { useEffect, useState, useCallback } from "react";
import { AdminSessionRedirectError, throwIfAdminApiError } from "@/lib/admin-auth-client";

type Entry = { id: string; action: string; payload: unknown; createdAt: string | null };

type AuditMeta = {
  maxPerPage?: number;
  fetchCap?: number;
  truncated?: boolean;
  sourceFetchCapped?: boolean;
};

export default function AdminAuditPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [meta, setMeta] = useState<AuditMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookingIdFilter, setBookingIdFilter] = useState("");

  const load = useCallback(async (bookingId: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (bookingId.trim()) qs.set("bookingId", bookingId.trim());
      const url = qs.toString() ? `/api/admin/audit-log?${qs}` : "/api/admin/audit-log";
      const res = await fetch(url, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throwIfAdminApiError(res, data);
      setEntries(Array.isArray(data.entries) ? data.entries : []);
      setMeta({
        maxPerPage: typeof data.maxPerPage === "number" ? data.maxPerPage : undefined,
        fetchCap: typeof data.fetchCap === "number" ? data.fetchCap : undefined,
        truncated: data.truncated === true,
        sourceFetchCapped: data.sourceFetchCapped === true,
      });
    } catch (e) {
      if (e instanceof AdminSessionRedirectError) return;
      setError(e instanceof Error ? e.message : "Failed to load");
      setEntries([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("");
  }, [load]);

  const sampleWarning = meta && (meta.truncated || meta.sourceFetchCapped);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">Audit log</h1>
        <p className="mt-1 text-sm text-brand-muted">
          Recent admin actions
          {meta?.maxPerPage != null && (
            <>
              {" "}
              (up to {meta.maxPerPage} rows after filters
              {meta.fetchCap != null ? `; newest ${meta.fetchCap} source docs fetched` : ""}).
            </>
          )}
          . Optional booking filter.
        </p>
      </div>
      {sampleWarning && (
        <div
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          <p className="font-semibold">Sampled results — not a complete history</p>
          <p className="mt-1 text-amber-900/95">
            {meta?.sourceFetchCapped && meta.fetchCap != null && (
              <span>
                Loaded at most the newest {meta.fetchCap} audit documents from Firestore before applying filters (
                <code className="rounded bg-amber-100/80 px-1 text-xs">sourceFetchCapped</code>).
              </span>
            )}
            {meta?.sourceFetchCapped && meta?.truncated && " "}
            {meta?.truncated && meta?.maxPerPage != null && (
              <span>
                After filters, only the first {meta.maxPerPage} rows are shown (
                <code className="rounded bg-amber-100/80 px-1 text-xs">truncated</code>;{" "}
                <code className="rounded bg-amber-100/80 px-1 text-xs">maxPerPage</code>).
              </span>
            )}
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-brand-dark">
          Filter by booking ID
          <input
            type="text"
            value={bookingIdFilter}
            onChange={(e) => setBookingIdFilter(e.target.value)}
            className="mt-1 block w-full min-w-[220px] rounded-lg border border-brand-dark/15 px-3 py-2 text-sm"
            placeholder="Optional"
          />
        </label>
        <button
          type="button"
          onClick={() => void load(bookingIdFilter)}
          className="rounded-lg bg-brand-dark text-white px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          Refresh
        </button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {loading ? (
        <p className="text-sm text-brand-muted">Loading…</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {entries.map((e) => (
            <li key={e.id} className="rounded-xl border border-brand-dark/10 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap justify-between gap-2 text-xs text-brand-muted">
                <span className="font-mono">{e.createdAt ?? "—"}</span>
                <span className="font-semibold text-brand-dark">{e.action}</span>
              </div>
              <pre className="mt-2 text-xs overflow-x-auto bg-brand-bg/40 rounded-lg p-2 max-h-40">
                {JSON.stringify(e.payload, null, 2)}
              </pre>
            </li>
          ))}
          {entries.length === 0 && <li className="text-brand-muted">No entries.</li>}
        </ul>
      )}
    </div>
  );
}
