"use client";

import { useEffect, useState, useCallback } from "react";
import { Mail, FileText, Send } from "lucide-react";
import { cn } from "@/lib/utils";

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

  const fetchPreview = useCallback(async (templateId: string) => {
    setPreviewLoading(true);
    setPreviewHtml("");
    try {
      const res = await fetch(`/api/admin/email-preview?templateId=${encodeURIComponent(templateId)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load preview");
      const html = await res.text();
      setPreviewHtml(html);
    } catch (e) {
      setPreviewHtml("<p style='padding:16px;color:#c00'>Failed to load preview.</p>");
    } finally {
      setPreviewLoading(false);
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
  }, [fetchTemplates, fetchLog]);

  useEffect(() => {
    if (selectedId) fetchPreview(selectedId);
  }, [selectedId, fetchPreview]);

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
        <p className="mt-1 text-sm text-brand-muted">Templates we send and a log of emails sent.</p>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      {/* Two columns: template list | HTML preview */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
        <div className="lg:col-span-1">
          <div className="rounded-2xl border-2 border-brand-dark/10 bg-white p-4 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-brand-muted mb-4">
              <FileText className="h-4 w-4" />
              Email templates
            </h2>
            {templatesLoading ? (
              <p className="text-sm text-brand-muted">Loading…</p>
            ) : templates.length === 0 ? (
              <p className="text-sm text-brand-muted">No templates.</p>
            ) : (
              <ul className="space-y-1">
                {templates.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className={cn(
                        "w-full rounded-xl px-4 py-3 text-left transition-all",
                        selectedId === t.id
                          ? "bg-brand-primary/15 text-brand-dark ring-2 ring-brand-primary/40"
                          : "hover:bg-brand-bg/80 text-brand-muted hover:text-brand-dark"
                      )}
                    >
                      <span className="block font-medium text-brand-dark">{t.name}</span>
                      <span className="block text-xs text-brand-muted mt-0.5">{t.description}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-2xl border-2 border-brand-dark/10 bg-white overflow-hidden shadow-sm">
            <div className="border-b border-brand-dark/10 px-4 py-3 flex items-center justify-between bg-brand-bg/30">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-brand-muted">
                <Mail className="h-4 w-4" />
                HTML preview
                {selectedTemplate && (
                  <span className="font-normal normal-case text-brand-dark">— {selectedTemplate.name}</span>
                )}
              </h2>
              {previewLoading && (
                <span className="text-xs text-brand-muted">Loading…</span>
              )}
            </div>
            <div className="min-h-[360px] bg-brand-bg/20 flex items-stretch justify-center p-4">
              <div className="w-full max-w-[560px] bg-white rounded-xl shadow-lg overflow-hidden border border-brand-dark/10">
                {previewHtml ? (
                  <iframe
                    title="Email preview"
                    srcDoc={previewHtml}
                    className="w-full min-h-[420px] border-0"
                    sandbox="allow-same-origin"
                  />
                ) : (
                  <div className="min-h-[420px] flex items-center justify-center text-brand-muted text-sm">
                    {previewLoading ? "Loading preview…" : "Select a template to preview."}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
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
