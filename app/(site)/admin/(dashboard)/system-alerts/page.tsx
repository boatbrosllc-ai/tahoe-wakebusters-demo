"use client";

import { useEffect, useState, useCallback } from "react";
import { AdminSessionRedirectError, throwIfAdminApiError } from "@/lib/admin-auth-client";

type OutboxDead = { id: string; bookingId: string; type: string; lastError: string | null; attemptCount: number };
type RemFail = {
  id: string;
  bookingId: string;
  templateKey: string;
  status: string;
  lastError: string | null;
  attemptCount: number;
};
type OpAlert = { id: string; type?: string; bookingId?: string; createdAt: string | null; [k: string]: unknown };

type NotificationMeta = {
  maxFetchedPerSource?: number;
  deadLetterSampleCapped?: boolean;
  reminderSampleCapped?: boolean;
};

type OpsMeta = {
  maxPerPage?: number;
  fetchCap?: number;
  truncated?: boolean;
  sourceFetchCapped?: boolean;
};

export default function AdminSystemAlertsPage() {
  const [outbox, setOutbox] = useState<OutboxDead[]>([]);
  const [reminders, setReminders] = useState<RemFail[]>([]);
  const [notifMeta, setNotifMeta] = useState<NotificationMeta | null>(null);
  const [ops, setOps] = useState<OpAlert[]>([]);
  const [opsMeta, setOpsMeta] = useState<OpsMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, b] = await Promise.all([
        fetch("/api/admin/notification-status?limit=80", { credentials: "include" }),
        fetch("/api/admin/operational-alerts", { credentials: "include" }),
      ]);
      const na = await a.json().catch(() => ({}));
      if (!a.ok) throwIfAdminApiError(a, na);
      setOutbox(Array.isArray(na.notificationOutboxDeadLetters) ? na.notificationOutboxDeadLetters : []);
      setReminders(Array.isArray(na.reminderRetryFailures) ? na.reminderRetryFailures : []);
      setNotifMeta({
        maxFetchedPerSource: typeof na.maxFetchedPerSource === "number" ? na.maxFetchedPerSource : undefined,
        deadLetterSampleCapped: na.deadLetterSampleCapped === true,
        reminderSampleCapped: na.reminderSampleCapped === true,
      });

      const ob = await b.json().catch(() => ({}));
      if (!b.ok) throwIfAdminApiError(b, ob);
      setOps(Array.isArray(ob.alerts) ? ob.alerts : []);
      setOpsMeta({
        maxPerPage: typeof ob.maxPerPage === "number" ? ob.maxPerPage : undefined,
        fetchCap: typeof ob.fetchCap === "number" ? ob.fetchCap : undefined,
        truncated: ob.truncated === true,
        sourceFetchCapped: ob.sourceFetchCapped === true,
      });
    } catch (e) {
      if (e instanceof AdminSessionRedirectError) return;
      setError(e instanceof Error ? e.message : "Failed to load");
      setNotifMeta(null);
      setOpsMeta(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const notifSampled =
    notifMeta?.deadLetterSampleCapped ||
    notifMeta?.reminderSampleCapped ||
    false;
  const opsSampled = opsMeta?.truncated || opsMeta?.sourceFetchCapped;

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">System alerts</h1>
        <p className="mt-1 text-sm text-brand-muted">
          Dead-lettered notification outbox jobs, failed reminder retries, and recent operational alerts.
        </p>
      </div>
      <button
        type="button"
        onClick={() => void load()}
        className="rounded-lg bg-brand-dark text-white px-4 py-2 text-sm font-medium hover:opacity-90"
      >
        Refresh
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {notifSampled && notifMeta && (
        <div
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          <p className="font-semibold">Notification samples may be incomplete</p>
          <p className="mt-1 text-amber-900/95">
            Each list loads at most {notifMeta.maxFetchedPerSource ?? "N"} documents per Firestore query.
            {notifMeta.deadLetterSampleCapped && " Dead-letter outbox likely has additional rows."}
            {notifMeta.reminderSampleCapped && " Reminder retry queue likely has additional rows."} Treat these sections
            as samples, not exhaustive queues.
          </p>
        </div>
      )}
      {opsSampled && opsMeta && (
        <div
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          <p className="font-semibold">Operational alerts are capped</p>
          <p className="mt-1 text-amber-900/95">
            {opsMeta.sourceFetchCapped && opsMeta.fetchCap != null && (
              <span>
                Fetched at most the newest {opsMeta.fetchCap} alert documents (
                <code className="rounded bg-amber-100/80 px-1 text-xs">sourceFetchCapped</code>).
              </span>
            )}
            {opsMeta.sourceFetchCapped && opsMeta.truncated && " "}
            {opsMeta.truncated && opsMeta.maxPerPage != null && (
              <span>
                After filters, only the first {opsMeta.maxPerPage} rows are shown (
                <code className="rounded bg-amber-100/80 px-1 text-xs">truncated</code> /{" "}
                <code className="rounded bg-amber-100/80 px-1 text-xs">maxPerPage</code>).
              </span>
            )}
          </p>
        </div>
      )}
      {loading ? (
        <p className="text-sm text-brand-muted">Loading…</p>
      ) : (
        <>
          <section>
            <h2 className="text-lg font-semibold text-brand-dark mb-2">Notification outbox (dead letter)</h2>
            <ul className="space-y-2 text-sm">
              {outbox.map((row) => (
                <li key={row.id} className="rounded-lg border border-brand-dark/10 p-3 bg-white">
                  <span className="font-mono text-xs text-brand-muted">{row.type}</span>
                  <div>
                    Booking{" "}
                    <a href={`/admin/bookings`} className="text-brand-primary underline font-mono text-xs">
                      {row.bookingId}
                    </a>
                  </div>
                  {row.lastError && <p className="text-xs text-red-700 mt-1">{row.lastError}</p>}
                </li>
              ))}
              {outbox.length === 0 && <li className="text-brand-muted">None in sample.</li>}
            </ul>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-brand-dark mb-2">Reminder retry queue (failed / dead letter)</h2>
            <ul className="space-y-2 text-sm">
              {reminders.map((row) => (
                <li key={row.id} className="rounded-lg border border-brand-dark/10 p-3 bg-white">
                  <span className="font-mono text-xs">{row.templateKey}</span> ·{" "}
                  <span className="text-xs text-brand-muted">{row.status}</span>
                  <div className="font-mono text-xs mt-1">{row.bookingId}</div>
                  {row.lastError && <p className="text-xs text-red-700 mt-1">{row.lastError}</p>}
                </li>
              ))}
              {reminders.length === 0 && <li className="text-brand-muted">None in sample.</li>}
            </ul>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-brand-dark mb-2">Operational alerts (recent)</h2>
            <ul className="space-y-2 text-sm max-h-[480px] overflow-y-auto">
              {ops.map((row) => (
                <li key={row.id} className="rounded-lg border border-brand-dark/10 p-3 bg-amber-50/50">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="font-semibold">{String(row.type ?? "—")}</span>
                    <span className="text-brand-muted">{row.createdAt ?? ""}</span>
                    {row.bookingId != null && <span className="font-mono">booking {String(row.bookingId)}</span>}
                  </div>
                </li>
              ))}
              {ops.length === 0 && <li className="text-brand-muted">None in sample.</li>}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
