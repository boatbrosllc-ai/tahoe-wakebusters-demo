"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Send, Copy, ExternalLink, FileText, Search, CheckCircle2, Clock, User, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAdminDateTime } from "@/lib/format-firestore-timestamp";
import { isWalkInWaiverRequest, waiverSigningChannelLabel } from "@/lib/waiver/signing-channel-label";

type RequestItem = {
  id: string;
  bookingId: string;
  status: string;
  signerName?: string;
  signerEmail?: string;
  signingUrl: string;
  signingChannel?: string;
  sent?: { initialSentAt?: unknown; lastSentAt?: unknown; reminder1SentAt?: unknown };
  signed?: { signedAt?: unknown };
  createdAt: unknown;
  bookingSummary?: { tripDate: string; experienceName: string; startTime?: string; endTime?: string; partySize?: number; signedCount?: number };
  templateSnapshot?: { title?: string };
};

type RequestDetail = {
  id: string;
  bookingId: string;
  status: string;
  signerName?: string;
  signerEmail?: string;
  signerPhone?: string;
  signerDob?: string;
  signingUrl: string;
  signingChannel?: string;
  sent?: { initialSentAt?: unknown; lastSentAt?: unknown; reminder1SentAt?: unknown };
  signed?: {
    signedAt?: unknown;
    signatureStoragePath?: string | null;
    signedPayload?: {
      signerName: string;
      signerEmail: string;
      signerPhone: string;
      signerAddress?: string | null;
      signerDob: string | null;
      bookingDate?: string | null;
      initials: Record<string, string>;
      signatureDataUrl?: string;
      typedName?: string;
      termsAcceptedAtIso?: string;
      termsContentHash?: string;
    };
    pdfStoragePath?: string | null;
    htmlStoragePath?: string | null;
  };
  bookingSummary?: { experienceName?: string; tripDate?: string; startTime?: string; endTime?: string };
  templateSnapshot?: { title?: string };
  qrLinkId?: string;
};

/** Invite email sent time, or walk-in explanation when no email was sent. */
function formatInviteSentLabel(detail: RequestDetail): string {
  const last = detail.sent?.lastSentAt;
  const initial = detail.sent?.initialSentAt;
  if (isWalkInWaiverRequest(detail) && last == null && initial == null) {
    return "Not applicable (walk-in / QR — no invite email)";
  }
  return formatAdminDateTime(last ?? initial);
}

function daysUntil(tripDateStr: string): number | null {
  if (!tripDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(tripDateStr)) return null;
  const trip = new Date(tripDateStr + "T12:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  trip.setHours(0, 0, 0, 0);
  return Math.ceil((trip.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

export default function WaiverRequestsPage() {
  const [list, setList] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** When API returns 503, optional hint (e.g. Firebase setup steps). */
  const [errorHint, setErrorHint] = useState<string | null>(null);
  /** When API returns 503, optional firebaseStatus.summary (specific reason, e.g. key truncated on Netlify). */
  const [errorFirebaseSummary, setErrorFirebaseSummary] = useState<string | null>(null);
  /** Actual error message from server (errorDetail) so we can show the real cause. */
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [viewModalRequestId, setViewModalRequestId] = useState<string | null>(null);
  const [viewDetail, setViewDetail] = useState<RequestDetail | null>(null);
  const [viewDetailLoading, setViewDetailLoading] = useState(false);
  const [regeneratePdfBusyId, setRegeneratePdfBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!viewModalRequestId) {
      setViewDetail(null);
      return;
    }
    setViewDetailLoading(true);
    setViewDetail(null);
    fetch(`/api/admin/waiver-requests/${viewModalRequestId}`, { credentials: "include" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        return data as RequestDetail;
      })
      .then(setViewDetail)
      .catch(() => setViewDetail(null))
      .finally(() => setViewDetailLoading(false));
  }, [viewModalRequestId]);

  // Debounce search so we don't refetch on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchList = useCallback(() => {
    setLoading(true);
    setError(null);
    setErrorHint(null);
    setErrorFirebaseSummary(null);
    setErrorDetail(null);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (debouncedSearch) params.set("search", debouncedSearch);
    const qs = params.toString();
    fetch(`/api/admin/waiver-requests${qs ? `?${qs}` : ""}`, { credentials: "include" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (data.firebaseStatus && typeof data.firebaseStatus.summary === "string") {
            setErrorFirebaseSummary(data.firebaseStatus.summary.trim());
          }
          if (typeof data.hint === "string" && data.hint.trim()) setErrorHint(data.hint.trim());
          if (typeof data.errorDetail === "string" && data.errorDetail.trim()) {
            setErrorDetail(data.errorDetail.trim());
          }
          throw new Error(data.error ?? "Failed to load");
        }
        return data.requests ?? [];
      })
      .then(setList)
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [statusFilter, debouncedSearch]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const copyLink = (requestId: string, url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(requestId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const regeneratePdf = async (requestId: string) => {
    setRegeneratePdfBusyId(requestId);
    try {
      const res = await fetch(`/api/admin/waiver-requests/${requestId}/regenerate-pdf`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const combined = [data.error, data.hint].filter(Boolean).join(" — ") || "PDF generation failed";
        throw new Error(combined);
      }
      const detailRes = await fetch(`/api/admin/waiver-requests/${requestId}`, { credentials: "include" });
      const detailJson = await detailRes.json().catch(() => ({}));
      if (detailRes.ok) setViewDetail(detailJson as RequestDetail);
      fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF generation failed");
    } finally {
      setRegeneratePdfBusyId(null);
    }
  };

  const sendReminder = async (requestId: string) => {
    setSendingId(requestId);
    try {
      const res = await fetch(`/api/admin/waiver-requests/${requestId}/send`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to send");
      fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSendingId(null);
    }
  };

  const pendingCount = list.filter((r) => r.status === "pending").length;
  const signedCount = list.filter((r) => r.status === "signed").length;
  const needsAttentionCount = list.filter(
    (r) =>
      r.status === "pending" &&
      r.bookingSummary?.tripDate &&
      (daysUntil(r.bookingSummary.tripDate) ?? 99) >= 0 &&
      (daysUntil(r.bookingSummary.tripDate) ?? 99) <= 7
  ).length;

  const statusPills = [
    { value: "", label: "All" },
    { value: "pending", label: "Pending" },
    { value: "signed", label: "Signed" },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-primary/10 via-brand-bg to-brand-dark/5 border border-brand-dark/10 px-6 py-6 sm:px-8 sm:py-7">
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-brand-dark sm:text-3xl">
              Waiver tracking
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-brand-muted sm:text-base">
              See every waiver sent, who has signed, and send reminders for upcoming trips—all in one place.
            </p>
          </div>
          <Link
            href="/admin/waivers/templates"
            className="shrink-0"
          >
            <Button variant="outline" size="sm" className="gap-2 border-brand-dark/20 bg-white/80 shadow-sm hover:bg-white">
              <FileText className="h-4 w-4" aria-hidden />
              Templates
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      {!loading && !error && list.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div
            className={cn(
              "rounded-xl border px-4 py-3.5 transition-colors",
              statusFilter === "pending"
                ? "border-brand-primary/40 bg-brand-primary/10"
                : "border-brand-dark/10 bg-white shadow-sm"
            )}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                <Clock className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <p className="text-2xl font-bold text-brand-dark">{pendingCount}</p>
                <p className="text-xs font-medium uppercase tracking-wide text-brand-muted">Pending</p>
                {needsAttentionCount > 0 && (
                  <p className="mt-0.5 text-xs font-medium text-amber-600">
                    {needsAttentionCount} need attention
                  </p>
                )}
              </div>
            </div>
          </div>
          <div
            className={cn(
              "rounded-xl border px-4 py-3.5 transition-colors",
              statusFilter === "signed"
                ? "border-green-300 bg-green-50"
                : "border-brand-dark/10 bg-white shadow-sm"
            )}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600">
                <CheckCircle2 className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <p className="text-2xl font-bold text-brand-dark">{signedCount}</p>
                <p className="text-xs font-medium uppercase tracking-wide text-brand-muted">Signed</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-brand-dark/10 bg-white px-4 py-3.5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-primary/15 text-brand-primary">
                <User className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <p className="text-2xl font-bold text-brand-dark">{list.length}</p>
                <p className="text-xs font-medium uppercase tracking-wide text-brand-muted">Total</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {statusPills.map((pill) => (
            <button
              key={pill.value}
              type="button"
              onClick={() => setStatusFilter(pill.value)}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition-all",
                statusFilter === pill.value
                  ? "bg-brand-primary text-white shadow-sm"
                  : "bg-white text-brand-muted border border-brand-dark/15 hover:border-brand-dark/30 hover:text-brand-dark"
              )}
            >
              {pill.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" aria-hidden />
          <input
            type="search"
            placeholder="Search guest or booking…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-brand-dark/15 bg-white py-2.5 pl-10 pr-4 text-sm text-brand-dark placeholder:text-brand-muted focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20 sm:w-56"
            aria-label="Search guest or booking ID"
          />
        </div>
      </div>

      {/* Content */}
      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-brand-dark/10 bg-white p-5 shadow-sm animate-pulse"
            >
              <div className="flex gap-3">
                <div className="h-12 w-12 shrink-0 rounded-full bg-brand-dark/10" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-20 rounded bg-brand-dark/10" />
                  <div className="h-3 w-32 rounded bg-brand-dark/5" />
                  <div className="h-3 w-24 rounded bg-brand-dark/5" />
                </div>
              </div>
              <div className="mt-4 h-8 w-full rounded-lg bg-brand-dark/5" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
          <p className="font-medium">{error}</p>
          {errorDetail && errorDetail !== error && (
            <p className="mt-2 rounded-lg bg-amber-100/80 px-3 py-2 text-amber-900 text-xs font-mono break-words" title="Actual error from server">
              {errorDetail}
            </p>
          )}
          {errorFirebaseSummary && !errorDetail && (
            <p className="mt-2 rounded-lg bg-amber-100/80 px-3 py-2 text-amber-900 font-medium">
              {errorFirebaseSummary}
            </p>
          )}
          {errorHint && !errorFirebaseSummary && !errorDetail && (
            <p className="mt-2 text-amber-800/90 whitespace-pre-line text-xs">{errorHint}</p>
          )}
          <p className="mt-3 text-xs text-amber-700">
            Waiver tracking uses the same Firebase/Firestore as bookings and experiences. If those work, the same env vars should work here. On <strong>Netlify</strong>: do not set <code className="rounded bg-amber-100 px-1 py-0.5">FIREBASE_SERVICE_ACCOUNT_JSON_PATH</code>. Use <code className="rounded bg-amber-100 px-1 py-0.5">FIREBASE_PROJECT_ID</code>, <code className="rounded bg-amber-100 px-1 py-0.5">FIREBASE_CLIENT_EMAIL</code>, and <code className="rounded bg-amber-100 px-1 py-0.5">FIREBASE_PRIVATE_KEY</code> (one line, <code className="rounded bg-amber-100 px-1 py-0.5">\n</code> for newlines). Redeploy after changing env.
          </p>
        </div>
      )}

      {!loading && !error && list.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-brand-dark/10 bg-white py-16 px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-bg text-brand-muted">
            <CalendarDays className="h-8 w-8" aria-hidden />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-brand-dark">No waivers match</h2>
          <p className="mt-1 max-w-sm text-sm text-brand-muted">
            {statusFilter || search.trim()
              ? "Try changing filters or search. Waivers appear here when guests book and a template is active."
              : "Waivers will appear here when guests book and you have an active template."}
          </p>
        </div>
      )}

      {!loading && !error && list.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((r) => {
            const days = r.bookingSummary?.tripDate ? daysUntil(r.bookingSummary.tripDate) : null;
            const isUpcoming = days != null && days >= 0 && days <= 7;
            const initial = (r.signerName ?? "G").trim().charAt(0).toUpperCase();
            return (
              <article
                key={r.id}
                className={cn(
                  "flex flex-col rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md",
                  r.status === "signed"
                    ? "border-green-200/60"
                    : isUpcoming
                      ? "border-amber-200/60"
                      : "border-brand-dark/10"
                )}
              >
                <div className="flex flex-1 flex-col p-4 sm:p-5">
                  <div className="flex gap-3">
                    <div
                      className={cn(
                        "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-semibold",
                        r.status === "signed"
                          ? "bg-green-100 text-green-800"
                          : "bg-brand-primary/15 text-brand-primary"
                      )}
                    >
                      {initial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-brand-dark truncate">
                        {r.signerName ?? "Guest"}
                      </p>
                      <p className="truncate text-sm text-brand-muted">{r.signerEmail ?? ""}</p>
                      {r.templateSnapshot?.title && (
                        <p className="truncate text-xs text-brand-muted mt-0.5">{r.templateSnapshot.title}</p>
                      )}
                      {r.bookingSummary && (
                        <p className="mt-1 truncate text-sm text-brand-dark">
                          {r.bookingSummary.experienceName}
                          {r.bookingSummary.tripDate && (
                            <span className="text-brand-muted">
                              {" "}
                              · {r.bookingSummary.tripDate}
                              {r.bookingSummary.startTime != null && ` ${r.bookingSummary.startTime}`}
                            </span>
                          )}
                          {r.bookingSummary.partySize != null && r.bookingSummary.signedCount != null && (
                            <span className="text-brand-muted"> · {r.bookingSummary.signedCount} of {r.bookingSummary.partySize} signed</span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                        r.status === "signed"
                          ? "bg-green-100 text-green-800"
                          : r.status === "pending"
                            ? "bg-sky-100 text-sky-800"
                            : "bg-gray-100 text-gray-600"
                      )}
                    >
                      {r.status === "signed" ? (
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <Clock className="h-3.5 w-3.5" aria-hidden />
                      )}
                      {r.status === "signed" ? "Signed" : "Pending"}
                    </span>
                    {days != null && r.status === "pending" && (
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-medium",
                          isUpcoming ? "bg-amber-100 text-amber-800" : "bg-brand-bg text-brand-muted"
                        )}
                      >
                        {days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days} days until trip`}
                      </span>
                    )}
                    <span className="rounded-full px-2.5 py-1 text-xs font-medium bg-brand-bg text-brand-muted">
                      {waiverSigningChannelLabel(r.signingChannel, r.bookingId)}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-brand-muted">
                    {isWalkInWaiverRequest(r) && r.sent?.lastSentAt == null && r.sent?.initialSentAt == null ? (
                      <span>No invite email (walk-in / QR)</span>
                    ) : (
                      <span>Sent: {formatAdminDateTime(r.sent?.lastSentAt ?? r.sent?.initialSentAt)}</span>
                    )}
                    {r.status === "signed" && (
                      <span>· Signed: {formatAdminDateTime(r.signed?.signedAt)}</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-brand-dark/5 p-4 pt-3 sm:p-5 sm:pt-4">
                  <Button
                    variant="default"
                    size="sm"
                    className="gap-1.5 bg-brand-primary hover:bg-brand-primary/90"
                    onClick={() => setViewModalRequestId(r.id)}
                  >
                    View details
                  </Button>
                  {r.status === "signed" && (
                    <a
                      href={`/api/waiver/pdf/${r.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Opens stored PDF or HTML signed waiver"
                    >
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <ExternalLink className="h-3.5 w-3.5" /> Signed copy
                      </Button>
                    </a>
                  )}
                  {r.status === "pending" && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={sendingId === r.id}
                        onClick={() => sendReminder(r.id)}
                      >
                        <Send className="h-3.5 w-3.5" />
                        {sendingId === r.id ? "Sending…" : "Remind"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-brand-muted"
                        onClick={() => copyLink(r.id, r.signingUrl)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {copiedId === r.id ? "Copied" : "Copy link"}
                      </Button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Dialog
        fullScreenOnMobile
        open={viewModalRequestId !== null}
        onOpenChange={(open) => {
          if (!open) setViewModalRequestId(null);
        }}
        title="Waiver request"
        description={
          viewDetail
            ? `${viewDetail.signerName ?? "—"} · ${viewDetail.bookingSummary?.experienceName ?? viewDetail.bookingId}`
            : viewModalRequestId ?? undefined
        }
        className="max-w-2xl"
      >
        <div className="overflow-y-auto space-y-5 pr-2 -mr-2">
          {viewDetailLoading && (
            <p className="py-8 text-center text-brand-muted">Loading…</p>
          )}
          {!viewDetailLoading && viewDetail && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    viewDetail.status === "signed"
                      ? "bg-green-100 text-green-800"
                      : viewDetail.status === "pending"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {viewDetail.status}
                </span>
                <span className="text-brand-muted font-mono text-xs">{viewDetail.id}</span>
              </div>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-muted mb-2">Waiver</h3>
                <p className="text-sm font-medium text-brand-dark">{viewDetail.templateSnapshot?.title ?? "—"}</p>
                <p className="text-xs text-brand-muted mt-1">
                  {waiverSigningChannelLabel(viewDetail.signingChannel, viewDetail.bookingId)}
                </p>
                {viewDetail.qrLinkId ? (
                  <p className="text-xs font-mono text-brand-muted mt-1 break-all">QR link: {viewDetail.qrLinkId}</p>
                ) : null}
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-muted mb-2">Dates</h3>
                <dl className="grid gap-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-brand-muted shrink-0">Invite sent</dt>
                    <dd className="text-brand-dark text-right min-w-0">
                      {formatInviteSentLabel(viewDetail)}
                      {!isWalkInWaiverRequest(viewDetail) &&
                        viewDetail.sent?.lastSentAt != null &&
                        viewDetail.sent?.initialSentAt != null && (
                        <span className="text-brand-muted text-xs block">
                          Initial: {formatAdminDateTime(viewDetail.sent.initialSentAt)}
                        </span>
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-brand-muted shrink-0">Signed at</dt>
                    <dd className="text-brand-dark text-right font-medium">
                      {viewDetail.status === "signed" ? formatAdminDateTime(viewDetail.signed?.signedAt) : "—"}
                    </dd>
                  </div>
                  {viewDetail.status === "signed" && viewDetail.signed?.signedPayload?.termsAcceptedAtIso && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-brand-muted shrink-0">Terms accepted</dt>
                      <dd className="text-brand-dark text-right">
                        {formatAdminDateTime(viewDetail.signed.signedPayload.termsAcceptedAtIso)}
                      </dd>
                    </div>
                  )}
                </dl>
              </section>

              {(viewDetail.bookingSummary || viewDetail.signed?.signedPayload?.bookingDate) && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-muted mb-2">Booking</h3>
                  <p className="text-sm text-brand-dark">{viewDetail.bookingSummary?.experienceName ?? "—"}</p>
                  <p className="text-sm text-brand-muted">
                    {viewDetail.bookingSummary?.tripDate ?? viewDetail.signed?.signedPayload?.bookingDate ?? "—"}
                    {viewDetail.bookingSummary &&
                      [viewDetail.bookingSummary.startTime, viewDetail.bookingSummary.endTime].filter(Boolean).length > 0 &&
                      ` · ${[viewDetail.bookingSummary.startTime, viewDetail.bookingSummary.endTime].filter(Boolean).join(" – ")}`}
                  </p>
                  <p className="text-brand-muted font-mono text-xs mt-1">{viewDetail.bookingId}</p>
                </section>
              )}

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-muted mb-2">Signer</h3>
                <dl className="grid gap-1.5 text-sm">
                  <div><dt className="text-brand-muted inline">Name: </dt><dd className="inline text-brand-dark">{viewDetail.signerName ?? viewDetail.signed?.signedPayload?.signerName ?? "—"}</dd></div>
                  <div><dt className="text-brand-muted inline">Email: </dt><dd className="inline text-brand-dark">{viewDetail.signerEmail ?? viewDetail.signed?.signedPayload?.signerEmail ?? "—"}</dd></div>
                  <div><dt className="text-brand-muted inline">Phone: </dt><dd className="inline text-brand-dark">{viewDetail.signerPhone ?? viewDetail.signed?.signedPayload?.signerPhone ?? "—"}</dd></div>
                  {(viewDetail.signerDob ?? viewDetail.signed?.signedPayload?.signerDob) != null &&
                    String(viewDetail.signerDob ?? viewDetail.signed?.signedPayload?.signerDob).length > 0 && (
                    <div><dt className="text-brand-muted inline">DOB: </dt><dd className="inline text-brand-dark">{viewDetail.signerDob ?? viewDetail.signed?.signedPayload?.signerDob ?? "—"}</dd></div>
                  )}
                  {viewDetail.signed?.signedPayload?.signerAddress?.trim() ? (
                    <div><dt className="text-brand-muted inline">Address: </dt><dd className="inline text-brand-dark">{viewDetail.signed.signedPayload.signerAddress}</dd></div>
                  ) : null}
                  {viewDetail.signed?.signedPayload?.bookingDate?.trim() ? (
                    <div><dt className="text-brand-muted inline">Booking date: </dt><dd className="inline text-brand-dark">{viewDetail.signed.signedPayload.bookingDate}</dd></div>
                  ) : null}
                </dl>
              </section>

              {viewDetail.status === "signed" && viewDetail.signed?.signedPayload && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-muted mb-2">Signature</h3>
                  <div className="rounded-xl border border-brand-dark/10 bg-white p-4">
                    {viewDetail.signed.signatureStoragePath ? (
                      <div className="mb-3">
                        <p className="text-xs text-brand-muted mb-1">Drawn signature</p>
                        <img
                          src={`/api/admin/waiver-requests/${viewDetail.id}/signature-image`}
                          alt="Guest signature"
                          className="max-h-32 w-auto border border-brand-dark/10 rounded bg-white"
                        />
                      </div>
                    ) : null}
                    {viewDetail.signed.signedPayload.signatureDataUrl ? (
                      <div className="mb-3">
                        <p className="text-xs text-brand-muted mb-1">Signed signature</p>
                        <img
                          src={viewDetail.signed.signedPayload.signatureDataUrl}
                          alt="Guest signature"
                          className="max-h-24 w-auto border border-brand-dark/10 rounded"
                        />
                      </div>
                    ) : null}
                    {viewDetail.signed.signedPayload.typedName && (
                      <p className="text-sm"><span className="text-brand-muted">Printed name: </span><span className="text-brand-dark font-medium">{viewDetail.signed.signedPayload.typedName}</span></p>
                    )}
                    {Object.keys(viewDetail.signed.signedPayload.initials ?? {}).length > 0 && (
                      <div className="mt-3 pt-3 border-t border-brand-dark/10">
                        <p className="text-xs text-brand-muted mb-2">Initials</p>
                        <ul className="space-y-1 text-sm">
                          {Object.entries(viewDetail.signed.signedPayload.initials).map(([key, val]) => (
                            <li key={key} className="flex justify-between gap-2">
                              <span className="text-brand-muted truncate">{key}</span>
                              <span className="text-brand-dark font-medium uppercase shrink-0">{val}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </section>
              )}

              <div className="flex flex-wrap gap-2 pt-2 border-t border-brand-dark/10">
                <Link href={`/admin/waivers/requests/${viewDetail.id}`}>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <ExternalLink className="h-3.5 w-3.5" /> Open full page
                  </Button>
                </Link>
                {viewDetail.status === "pending" && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={sendingId === viewDetail.id}
                      onClick={() => {
                        sendReminder(viewDetail.id);
                      }}
                    >
                      <Send className="h-3.5 w-3.5" />
                      {sendingId === viewDetail.id ? "Sending…" : "Send reminder"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => copyLink(viewDetail.id, viewDetail.signingUrl)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {copiedId === viewDetail.id ? "Copied" : "Copy link"}
                    </Button>
                  </>
                )}
                {viewDetail.status === "signed" &&
                  viewDetail.signed &&
                  (viewDetail.signed.pdfStoragePath || viewDetail.signed.htmlStoragePath) && (
                    <a href={`/api/waiver/pdf/${viewDetail.id}`} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <ExternalLink className="h-3.5 w-3.5" />{" "}
                        {viewDetail.signed.pdfStoragePath ? "View PDF" : "Download waiver (HTML)"}
                      </Button>
                    </a>
                  )}
                {viewDetail.status === "signed" &&
                  viewDetail.signed?.htmlStoragePath &&
                  !viewDetail.signed.pdfStoragePath && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="gap-1.5"
                      disabled={regeneratePdfBusyId === viewDetail.id}
                      onClick={() => regeneratePdf(viewDetail.id)}
                    >
                      <FileText className="h-3.5 w-3.5" />{" "}
                      {regeneratePdfBusyId === viewDetail.id ? "Generating…" : "Generate PDF"}
                    </Button>
                  )}
                {viewDetail.status === "signed" &&
                  viewDetail.signed?.htmlStoragePath &&
                  !viewDetail.signed?.pdfStoragePath && (
                  <p className="w-full text-xs text-brand-muted border-t border-brand-dark/10 pt-3 mt-1">
                    Use <strong>Download waiver (HTML)</strong> for the full signed document (terms + signature). PDF
                    can be wired up later.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </Dialog>
    </div>
  );
}
