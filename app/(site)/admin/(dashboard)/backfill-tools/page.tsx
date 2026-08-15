"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { throwIfAdminApiError } from "@/lib/admin-auth-client";

type BackfillPreviewRow = {
  bookingId: string;
  experienceId?: string;
  slotId?: string;
  beforeBoatId?: string | null;
  inferredBoatId?: string;
  outcome: string;
  error?: string;
};

type BoatBackfillPreview = {
  dryRun: boolean;
  totalWithMissingBoatId: number;
  results: BackfillPreviewRow[];
  hint?: string;
};

export default function AdminBackfillToolsPage() {
  const [loading, setLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BoatBackfillPreview | null>(null);
  const [applyConfirmOpen, setApplyConfirmOpen] = useState(false);
  const [confirmPhrase, setConfirmPhrase] = useState("");

  const runPreview = useCallback(async () => {
    setError(null);
    setPreview(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/backfill-booking-boat-ids", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throwIfAdminApiError(res, data, "Preview failed");
      setPreview(data as BoatBackfillPreview);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const runApply = useCallback(async () => {
    setError(null);
    setApplyLoading(true);
    try {
      const res = await fetch("/api/admin/backfill-booking-boat-ids", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applyUpdates: true, confirmPhrase: confirmPhrase.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throwIfAdminApiError(res, data, "Apply failed");
      setPreview(data as BoatBackfillPreview);
      setApplyConfirmOpen(false);
      setConfirmPhrase("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setApplyLoading(false);
    }
  }, [confirmPhrase]);

  const updatedCount =
    preview?.results?.filter((r) => r.outcome === "updated").length ?? 0;

  return (
    <div className="max-w-3xl space-y-6 sm:space-y-8">
      <div>
        <Link href="/admin" className="text-sm text-brand-primary hover:underline">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-brand-dark sm:text-3xl">Backfill tools</h1>
        <p className="mt-2 text-sm text-brand-muted">
          Destructive maintenance APIs with previews. The booking <code className="bg-brand-bg px-1 rounded text-xs">boatId</code>{" "}
          backfill inspects the last 500 slot-taken bookings missing <code className="bg-brand-bg px-1 rounded text-xs">boatId</code> and
          infers a listing boat from slot documents where possible. Use{" "}
          <strong>dry run</strong> first; apply sends <code className="bg-brand-bg px-1 rounded text-xs">POST</code> with{" "}
          <code className="bg-brand-bg px-1 rounded text-xs">{`{ "applyUpdates": true }`}</code> (equivalent to{" "}
          <code className="bg-brand-bg px-1 rounded text-xs">{`{ "dryRun": false }`}</code> per API).
        </p>
      </div>

      <section className="rounded-2xl border border-brand-dark/10 bg-white p-4 sm:p-6 shadow-soft space-y-4">
        <h2 className="text-lg font-semibold text-brand-dark">Backfill booking boat IDs</h2>
        <p className="text-sm text-brand-muted">
          Writes <code className="bg-brand-bg px-1 rounded text-xs">boatId</code> on booking documents when inference succeeds. Skips rows
          without a resolvable listing boat.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void runPreview()} disabled={loading || applyLoading}>
            {loading ? "Loading preview…" : "Run dry run (preview)"}
          </Button>
          {preview != null && (
            <Button
              type="button"
              className="bg-red-600 hover:bg-red-700 text-white border-0"
              onClick={() => setApplyConfirmOpen(true)}
              disabled={applyLoading || preview.dryRun === false}
            >
              Apply updates…
            </Button>
          )}
        </div>
        {applyConfirmOpen && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 space-y-3">
            <p className="font-medium">Apply boatId backfill to Firestore?</p>
            <p>This updates booking documents. Ensure you reviewed the preview outcomes.</p>
            <div>
              <label htmlFor="backfill-confirm-phrase" className="block text-xs font-medium">
                Confirm phrase (BACKFILL_CONFIRM_PHRASE or SEED_CONFIRM_PHRASE)
              </label>
              <input
                id="backfill-confirm-phrase"
                type="password"
                value={confirmPhrase}
                onChange={(e) => setConfirmPhrase(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm"
                autoComplete="off"
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setApplyConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-red-600 hover:bg-red-700"
                disabled={applyLoading || !confirmPhrase.trim()}
                onClick={() => void runApply()}
              >
                {applyLoading ? "Applying…" : "Yes, apply updates"}
              </Button>
            </div>
          </div>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
        {preview && (
          <div className="text-sm space-y-2 border-t border-brand-dark/10 pt-4">
            <p>
              <span className="font-medium text-brand-dark">Dry run:</span> {preview.dryRun ? "yes" : "no"} ·{" "}
              <span className="font-medium text-brand-dark">Missing boatId in sample:</span> {preview.totalWithMissingBoatId}
              {!preview.dryRun && (
                <>
                  {" "}
                  · <span className="font-medium text-brand-dark">Updated:</span> {updatedCount}
                </>
              )}
            </p>
            {preview.hint && <p className="text-xs text-brand-muted">{preview.hint}</p>}
            <ul className="max-h-64 overflow-y-auto text-xs font-mono border border-brand-dark/10 rounded-lg divide-y divide-brand-dark/10">
              {preview.results?.slice(0, 80).map((r) => (
                <li key={r.bookingId} className="px-2 py-1.5">
                  {r.bookingId} · {r.outcome}
                  {r.inferredBoatId ? ` → ${r.inferredBoatId}` : ""}
                  {r.error ? ` · ${r.error}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
