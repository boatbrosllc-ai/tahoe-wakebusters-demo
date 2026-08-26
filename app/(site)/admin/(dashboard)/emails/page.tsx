"use client";

import { useEffect, useState, useCallback } from "react";
import { Send, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ConfirmationEmailCopyEditor,
  type ConfirmationCopyDraft,
} from "@/components/admin/ConfirmationEmailCopyEditor";

type EmailTemplateMeta = {
  id: string;
  name: string;
  description: string;
  subject: string;
};

type EmailLogEntry = {
  id: string;
  to: string;
  toName: string | null;
  templateId: string;
  subject: string;
  bookingId: string | null;
  sentAt: string | null;
  channel?: string;
  audience?: string;
  deliveryState?: string | null;
};

export default function AdminEmailsPage() {
  const [templates, setTemplates] = useState<EmailTemplateMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [log, setLog] = useState<EmailLogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(true);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyDraft, setCopyDraft] = useState<ConfirmationCopyDraft | null>(null);
  const [outboxStats, setOutboxStats] = useState<{
    pending: number;
    deadLetter: number;
    stuckClaims: number;
    byType?: {
      booking_confirmation: { pending: number; deadLetter: number; stuckClaims: number };
      final_charge_success: { pending: number; deadLetter: number; stuckClaims: number };
      discount_limit_exceeded_notification?: { pending: number; deadLetter: number; stuckClaims: number };
    };
    reminderRetryQueue?: Record<
      string,
      { pending: number; sent: number; deadLetter: number; skipped: number; lastErrorSnippet?: string }
    >;
    staleClaimCountsByTemplate?: Record<string, number>;
    reminderRetryDeadLetterTotal?: number;
  } | null>(null);
  const [outboxStatsLoading, setOutboxStatsLoading] = useState(true);

  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const res = await fetch("/api/admin/email-templates", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load templates");
      const data = await res.json();
      setTemplates(data);
      if (data.length > 0 && !selectedId) setSelectedId(data[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setTemplatesLoading(false);
    }
  }, [selectedId]);

  const fetchPreview = useCallback(async (templateId: string, draft?: ConfirmationCopyDraft | null) => {
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/admin/email-preview", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId,
          experienceTitle: draft?.experienceTitle,
          logistics: draft?.logistics,
        }),
      });
      if (!res.ok) throw new Error("Failed to load preview");
      const html = await res.text();
      setPreviewHtml(html);
    } catch {
      setPreviewHtml("<p style='padding:16px;color:#c00'>Failed to load preview.</p>");
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const fetchOutboxStats = useCallback(async () => {
    setOutboxStatsLoading(true);
    try {
      const res = await fetch("/api/admin/notification-outbox-stats", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load outbox stats");
      const data = await res.json();
      setOutboxStats({
        pending: typeof data.pending === "number" ? data.pending : 0,
        deadLetter: typeof data.deadLetter === "number" ? data.deadLetter : 0,
        stuckClaims: typeof data.stuckClaims === "number" ? data.stuckClaims : 0,
        byType: data.byType,
        reminderRetryQueue: data.reminderRetryQueue,
        staleClaimCountsByTemplate: data.staleClaimCountsByTemplate,
        reminderRetryDeadLetterTotal:
          typeof data.reminderRetryDeadLetterTotal === "number" ? data.reminderRetryDeadLetterTotal : undefined,
      });
    } catch {
      setOutboxStats(null);
    } finally {
      setOutboxStatsLoading(false);
    }
  }, []);

  const fetchLog = useCallback(async () => {
    setLogLoading(true);
    try {
      const res = await fetch("/api/admin/email-log?limit=200", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load email log");
      const data = await res.json();
      setLog(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLogLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
    fetchLog();
    fetchOutboxStats();
  }, [fetchTemplates, fetchLog, fetchOutboxStats]);

  useEffect(() => {
    if (!selectedId) return;
    const handle = window.setTimeout(() => {
      void fetchPreview(selectedId, copyDraft);
    }, 350);
    return () => window.clearTimeout(handle);
  }, [selectedId, copyDraft, fetchPreview]);

  function formatSentAt(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  const selectedTemplate = templates.find((t) => t.id === selectedId);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">Email notifications</h1>
        <p className="mt-1 text-sm text-brand-muted">
          Edit pickup and reminder copy per listing, preview templates, and review send logs.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      <div className="grid min-h-[28rem] grid-cols-1 items-stretch gap-6 xl:grid-cols-2">
        <div className="min-h-[28rem] min-w-0">
          <ConfirmationEmailCopyEditor onDraftChange={setCopyDraft} />
        </div>
        <div className="flex min-h-[28rem] min-w-0 flex-col overflow-hidden rounded-3xl border border-brand-dark/10 bg-white shadow-sm">
          <div className="shrink-0 border-b border-brand-dark/10 px-4 py-3 sm:px-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-muted">Preview</p>
                <p className="text-sm font-semibold text-brand-dark">
                  {selectedTemplate?.name ?? "Email"}
                  {copyDraft?.experienceTitle ? (
                    <span className="font-normal text-brand-muted"> · {copyDraft.experienceTitle}</span>
                  ) : null}
                </p>
              </div>
              {previewLoading ? <span className="text-xs text-brand-muted">Updating…</span> : null}
            </div>
            {templatesLoading ? (
              <p className="mt-3 text-xs text-brand-muted">Loading templates…</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-semibold transition-all",
                      selectedId === t.id
                        ? "bg-brand-dark text-white"
                        : "bg-brand-bg text-brand-muted hover:bg-brand-dark/10 hover:text-brand-dark"
                    )}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="min-h-0 flex-1 bg-brand-bg/20 p-4">
            <div className="mx-auto w-full max-w-[560px] overflow-hidden rounded-xl border border-brand-dark/10 bg-white shadow-lg">
              {previewHtml ? (
                <iframe
                  title="Email preview"
                  srcDoc={previewHtml}
                  className="w-full min-h-[420px] border-0"
                  sandbox="allow-same-origin"
                />
              ) : (
                <div className="flex min-h-[420px] items-center justify-center text-sm text-brand-muted">
                  {previewLoading ? "Loading preview…" : "Select a template to preview."}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border-2 border-brand-dark/10 bg-white p-4 shadow-sm space-y-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-brand-muted mb-3">
          <Inbox className="h-4 w-4" />
          Notification pipelines (Firestore)
        </h2>
        {outboxStatsLoading ? (
          <p className="text-sm text-brand-muted">Loading…</p>
        ) : outboxStats ? (
          <>
            <div>
              <p className="text-xs font-medium text-brand-muted uppercase tracking-wide mb-2">Outbox by type</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                <div className="rounded-xl border border-brand-dark/10 p-3 bg-brand-bg/30">
                  <p className="font-medium text-brand-dark">Booking confirmation</p>
                  <div className="mt-2 grid grid-cols-3 gap-2 tabular-nums">
                    <span>
                      <span className="block text-xs text-brand-muted">Pending</span>
                      {outboxStats.byType?.booking_confirmation?.pending ?? outboxStats.pending}
                    </span>
                    <span>
                      <span className="block text-xs text-brand-muted">Dead letter</span>
                      {outboxStats.byType?.booking_confirmation?.deadLetter ?? outboxStats.deadLetter}
                    </span>
                    <span>
                      <span className="block text-xs text-brand-muted">Stuck</span>
                      {outboxStats.byType?.booking_confirmation?.stuckClaims ?? outboxStats.stuckClaims}
                    </span>
                  </div>
                </div>
                <div className="rounded-xl border border-brand-dark/10 p-3 bg-brand-bg/30">
                  <p className="font-medium text-brand-dark">Final charge success (receipt)</p>
                  <div className="mt-2 grid grid-cols-3 gap-2 tabular-nums">
                    <span>
                      <span className="block text-xs text-brand-muted">Pending</span>
                      {outboxStats.byType?.final_charge_success?.pending ?? "—"}
                    </span>
                    <span>
                      <span className="block text-xs text-brand-muted">Dead letter</span>
                      {outboxStats.byType?.final_charge_success?.deadLetter ?? "—"}
                    </span>
                    <span>
                      <span className="block text-xs text-brand-muted">Stuck</span>
                      {outboxStats.byType?.final_charge_success?.stuckClaims ?? "—"}
                    </span>
                  </div>
                </div>
                <div className="rounded-xl border border-brand-dark/10 p-3 bg-brand-bg/30">
                  <p className="font-medium text-brand-dark">Discount limit notifications</p>
                  <div className="mt-2 grid grid-cols-3 gap-2 tabular-nums">
                    <span>
                      <span className="block text-xs text-brand-muted">Pending</span>
                      {outboxStats.byType?.discount_limit_exceeded_notification?.pending ?? "—"}
                    </span>
                    <span>
                      <span className="block text-xs text-brand-muted">Dead letter</span>
                      {outboxStats.byType?.discount_limit_exceeded_notification?.deadLetter ?? "—"}
                    </span>
                    <span>
                      <span className="block text-xs text-brand-muted">Stuck</span>
                      {outboxStats.byType?.discount_limit_exceeded_notification?.stuckClaims ?? "—"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {typeof outboxStats.reminderRetryDeadLetterTotal === "number" && (
              <p className="text-sm text-brand-dark">
                <strong>Reminder retries dead-lettered (all templates, count):</strong>{" "}
                <span className="tabular-nums font-mono">{outboxStats.reminderRetryDeadLetterTotal}</span>
              </p>
            )}

            {outboxStats.reminderRetryQueue && Object.keys(outboxStats.reminderRetryQueue).length > 0 && (
              <div>
                <p className="text-xs font-medium text-brand-muted uppercase tracking-wide mb-2">
                  Reminder / pay-link retry queue (by template)
                </p>
                <div className="overflow-x-auto rounded-xl border border-brand-dark/10">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead>
                      <tr className="border-b border-brand-dark/10 bg-brand-bg/50 text-left">
                        <th className="py-2 px-3 font-semibold text-brand-dark">Template</th>
                        <th className="py-2 px-3 font-semibold text-brand-dark">Pending</th>
                        <th className="py-2 px-3 font-semibold text-brand-dark">Sent</th>
                        <th className="py-2 px-3 font-semibold text-brand-dark">Dead letter</th>
                        <th className="py-2 px-3 font-semibold text-brand-dark">Skipped</th>
                        <th className="py-2 px-3 font-semibold text-brand-dark">Last error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(outboxStats.reminderRetryQueue).map(([key, row]) => (
                        <tr key={key} className="border-b border-brand-dark/5">
                          <td className="py-2 px-3 font-mono text-xs text-brand-dark">{key}</td>
                          <td className="py-2 px-3 tabular-nums">{row.pending}</td>
                          <td className="py-2 px-3 tabular-nums">{row.sent}</td>
                          <td className="py-2 px-3 tabular-nums">{row.deadLetter}</td>
                          <td className="py-2 px-3 tabular-nums">{row.skipped}</td>
                          <td className="py-2 px-3 text-xs text-brand-muted max-w-[280px] truncate" title={row.lastErrorSnippet}>
                            {row.lastErrorSnippet ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {outboxStats.staleClaimCountsByTemplate && Object.keys(outboxStats.staleClaimCountsByTemplate).length > 0 && (
              <div>
                <p className="text-xs font-medium text-brand-muted uppercase tracking-wide mb-2">
                  Stale send claims (expired lease, by template key)
                </p>
                <ul className="flex flex-wrap gap-2 text-sm">
                  {Object.entries(outboxStats.staleClaimCountsByTemplate).map(([k, n]) => (
                    <li key={k} className="rounded-lg bg-amber-50 border border-amber-200 px-2 py-1">
                      <span className="font-mono text-xs">{k}</span>: {n}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-brand-muted">Could not load outbox stats.</p>
        )}
      </div>

      {/* Sent emails log */}
      <div className="rounded-2xl border-2 border-brand-dark/10 bg-white overflow-hidden shadow-sm">
        <div className="border-b border-brand-dark/10 px-4 py-3 flex items-center gap-2 bg-brand-bg/30">
          <Send className="h-4 w-4 text-brand-muted" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-muted">Emails sent</h2>
        </div>
        <div className="overflow-x-auto">
          {logLoading ? (
            <div className="p-8 text-center text-sm text-brand-muted">Loading…</div>
          ) : log.length === 0 ? (
            <div className="p-8 text-center text-sm text-brand-muted">No emails sent yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-dark/10 bg-brand-bg/50">
                  <th className="text-left py-3 px-4 font-semibold text-brand-dark">To</th>
                  <th className="text-left py-3 px-4 font-semibold text-brand-dark">Audience</th>
                  <th className="text-left py-3 px-4 font-semibold text-brand-dark">Channel</th>
                  <th className="text-left py-3 px-4 font-semibold text-brand-dark">Template</th>
                  <th className="text-left py-3 px-4 font-semibold text-brand-dark">Subject</th>
                  <th className="text-left py-3 px-4 font-semibold text-brand-dark">Booking</th>
                  <th className="text-left py-3 px-4 font-semibold text-brand-dark">Sent at</th>
                </tr>
              </thead>
              <tbody>
                {log.map((entry) => (
                  <tr key={entry.id} className="border-b border-brand-dark/5 hover:bg-brand-bg/30">
                    <td className="py-3 px-4">
                      <span className="font-medium text-brand-dark">{entry.toName || entry.to}</span>
                      {entry.toName && (
                        <span className="block text-xs text-brand-muted">{entry.to}</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={cn(
                          "inline-flex rounded px-2 py-0.5 text-xs font-medium",
                          entry.audience === "staff" ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-700"
                        )}
                      >
                        {entry.audience === "staff" ? "Staff" : "Customer"}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={cn(
                          "inline-flex rounded px-2 py-0.5 text-xs font-medium",
                          (entry.channel ?? "email") === "sms"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-sky-100 text-sky-800"
                        )}
                      >
                        {(entry.channel ?? "email") === "sms" ? "SMS" : "Email"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-brand-muted">{entry.templateId}</td>
                    <td className="py-3 px-4 text-brand-dark max-w-[200px] truncate" title={entry.subject}>
                      {entry.subject}
                    </td>
                    <td className="py-3 px-4 text-brand-muted">
                      {entry.bookingId ? (
                        <a
                          href={`/admin/bookings?highlight=${entry.bookingId}`}
                          className="text-brand-primary hover:underline"
                        >
                          {entry.bookingId.slice(0, 8)}…
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-3 px-4 text-brand-muted whitespace-nowrap">
                      {formatSentAt(entry.sentAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
