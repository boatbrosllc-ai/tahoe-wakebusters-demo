"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Inbox,
  Link2,
  Mail,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminSessionRedirectError, throwIfAdminApiError } from "@/lib/admin-auth-client";
import type { MarketplaceEventStatus } from "@/lib/integrations/marketplaces/types";
import { Dialog } from "@/components/ui/dialog";
import { MarketplaceEmailDetails } from "@/components/admin/MarketplaceEmailDetails";
import { formatBookingDateTimeFromIso } from "@/lib/booking/format-booking-datetime";
import { formatMarketplaceUsd } from "@/lib/integrations/marketplaces/event-display";
import { GMAIL_ACCOUNT_EMAIL } from "@/lib/integrations/gmail/constants";

type ProviderStatus = { id: string; label: string; status: string };
type SyncEvent = {
  id: string;
  provider?: string;
  eventType?: string;
  externalBookingId?: string;
  status?: string;
  detail?: string;
  bookingId?: string;
  listingName?: string;
  subject?: string;
  createdAt?: string | null;
  customerName?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  durationHours?: number | null;
  passengerCount?: number | null;
  totalCents?: number | null;
};
type EventInspection = {
  id: string;
  status?: string | null;
  detail?: string | null;
  subject?: string | null;
  bookingId?: string | null;
  inspectError?: string | null;
  incoming: {
    provider: string;
    externalBookingId: string;
    listingName: string | null;
    customerName: string | null;
    customerEmail: string | null;
    partySize: number | null;
    experienceTitle: string | null;
    experienceSlug: string | null;
    boatName: string | null;
    boatId: string | null;
    boatResolved: boolean;
    startAt: string | null;
    endAt: string | null;
    durationHours: number | null;
    slotId: string | null;
    totalCents: number | null;
    details: Record<string, string> | null;
    emailExcerpt: string | null;
  };
  overlaps: Array<{
    kind: "block" | "booking" | "hold";
    id: string;
    title: string;
    subtitle: string | null;
    startAt: string;
    endAt: string;
    boatName: string | null;
    boatId: string | null;
    sameGuestPlaceholder?: boolean;
  }>;
};
type StatusResponse = {
  gmailAccount?: string;
  gmailStatus?: string;
  watchStatus?: string;
  watchExpires?: string | null;
  lastGmailNotification?: string | null;
  lastSuccessfulSync?: string | null;
  lastRenewed?: string | null;
  providers?: ProviderStatus[];
  events?: SyncEvent[];
  error?: string;
};
type InboxSyncModalState = {
  days: 7 | 30;
  phase: "reading" | "done" | "error";
  processed?: number;
  skipped?: number;
  failed?: number;
  parseFailed?: number;
  unmapped?: number;
  deadLettered?: number;
  messageCount?: number;
  payoutsFilled?: number;
  error?: string;
};

const RETRYABLE_EVENT_STATUSES: ReadonlySet<MarketplaceEventStatus> = new Set<MarketplaceEventStatus>([
  "unmapped",
  "needs_review",
  "parse_failed",
  "sync_failed",
]);

type MappingRow = {
  id?: string;
  provider: string;
  matchType: string;
  matchValue: string;
  experienceSlug?: string;
  durationHours?: number;
  autoMapped?: boolean;
};

const PROVIDER_META: Record<string, { label: string; blurb: string; tone: string }> = {
  boatsetter: {
    label: "Boatsetter",
    blurb: "Booking and cancel emails from Boatsetter",
    tone: "bg-blue-500 text-white ring-blue-700",
  },
  getmyboat: {
    label: "Getmyboat",
    blurb: "Inbox booking messages from Getmyboat",
    tone: "bg-orange-500 text-white ring-orange-700",
  },
  viator: {
    label: "Viator",
    blurb: "Tour booking emails from Viator",
    tone: "bg-pink-500 text-white ring-pink-700",
  },
};

function fmtRange(start?: string | null, end?: string | null): string | null {
  if (!start) return null;
  const left = formatBookingDateTimeFromIso(start);
  if (!end) return left;
  return `${left} – ${formatBookingDateTimeFromIso(end)}`;
}

function fmt(iso?: string | null): string {
  if (!iso) return "Never";
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return iso;
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function eventLabel(ev: SyncEvent): string {
  const t = ev.eventType ?? "";
  if (t === "booking_created") return "New booking";
  if (t === "booking_updated") return "Updated booking";
  if (t === "booking_cancelled") return "Cancelled";
  if (t === "informational") return "Reminder";
  return ev.detail || t || "Email";
}

function statusTone(status?: string): { label: string; className: string } {
  const s = (status ?? "").toLowerCase();
  if (s === "success") {
    return { label: "Synced", className: "bg-emerald-50 text-emerald-800 ring-emerald-200" };
  }
  if (s === "unmapped") {
    return { label: "Needs mapping", className: "bg-amber-50 text-amber-900 ring-amber-200" };
  }
  if (s === "needs_review") {
    return { label: "Needs review", className: "bg-orange-50 text-orange-900 ring-orange-200" };
  }
  if (s === "parse_failed" || s === "sync_failed") {
    return { label: "Failed", className: "bg-red-50 text-red-800 ring-red-200" };
  }
  if (s === "ignored") {
    return { label: "Ignored", className: "bg-brand-dark/5 text-brand-muted ring-brand-dark/10" };
  }
  return { label: status || "—", className: "bg-brand-dark/5 text-brand-dark ring-brand-dark/10" };
}

function providerName(id?: string): string {
  if (!id) return "Unknown";
  return PROVIDER_META[id]?.label ?? id;
}

export default function AdminIntegrationsPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [mapProvider, setMapProvider] = useState("boatsetter");
  const [mapType, setMapType] = useState<"listing_name" | "product_code" | "listing_id">("listing_name");
  const [mapValue, setMapValue] = useState("");
  const [mapSlug, setMapSlug] = useState("watersports");
  const [mapDuration, setMapDuration] = useState("");
  const [mapDurationError, setMapDurationError] = useState<string | null>(null);
  const [retryId, setRetryId] = useState<string | null>(null);
  const [syncModal, setSyncModal] = useState<InboxSyncModalState | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EventInspection | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setLoading(true);
    setError(null);
    try {
      const [statusRes, mapRes] = await Promise.all([
        fetch("/api/admin/integrations/gmail/status", { credentials: "include" }),
        fetch("/api/admin/integrations/marketplace", { credentials: "include" }),
      ]);
      const data = (await statusRes.json().catch(() => ({}))) as StatusResponse;
      if (!statusRes.ok) throwIfAdminApiError(statusRes, data);
      setStatus(data);
      if (mapRes.ok) {
        const mapData = (await mapRes.json().catch(() => ({}))) as { mappings?: MappingRow[] };
        setMappings(Array.isArray(mapData.mappings) ? mapData.mappings : []);
      }
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmail = params.get("gmail");
    if (gmail === "connected") {
      setBanner({ type: "success", text: "Gmail is connected. Marketplace emails can now become bookings." });
    } else if (gmail === "error") {
      const reason = params.get("reason")?.trim();
      setBanner({
        type: "error",
        text: reason ? `Could not connect Gmail: ${reason}` : "Could not connect Gmail. Try Connect Gmail again.",
      });
    }
    if (gmail) window.history.replaceState({}, "", "/admin/integrations");
  }, []);

  async function startInboxSync(days: 7 | 30) {
    setBusy(days === 7 ? "sync7" : "sync30");
    setError(null);
    setSyncModal({ days, phase: "reading" });
    try {
      const res = await fetch("/api/admin/integrations/gmail/sync", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        processed?: number;
        skipped?: number;
        failed?: number;
        parseFailed?: number;
        unmapped?: number;
        deadLettered?: number;
        messageIds?: string[];
        payoutsFilled?: number;
      };
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      await load({ quiet: true });
      setSyncModal({
        days,
        phase: "done",
        processed: data.processed ?? 0,
        skipped: data.skipped ?? 0,
        failed: data.failed ?? 0,
        parseFailed: data.parseFailed ?? 0,
        unmapped: data.unmapped ?? 0,
        deadLettered: data.deadLettered ?? 0,
        messageCount: Array.isArray(data.messageIds) ? data.messageIds.length : undefined,
        payoutsFilled: data.payoutsFilled ?? 0,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Inbox sync failed";
      setError(message);
      setSyncModal({ days, phase: "error", error: message });
    } finally {
      setBusy(null);
    }
  }

  async function runAction(label: string, fn: () => Promise<Response>) {
    setBusy(label);
    setError(null);
    try {
      const res = await fn();
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
      if (label === "payouts") {
        const updated = Number((data as { updated?: number }).updated ?? 0);
        setBanner({
          type: "success",
          text:
            updated > 0
              ? `Filled ${updated} missing marketplace payout${updated === 1 ? "" : "s"} from saved emails.`
              : "No saved emails had a payout we could fill. Pull last 30 days, then type the amount on each $0 booking.",
        });
      }
      await load({ quiet: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  async function saveMapping() {
    let durationHours: number | undefined;
    if (mapDuration.trim()) {
      const parsed = Number(mapDuration);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setMapDurationError("Enter a positive number of hours.");
        return;
      }
      durationHours = parsed;
    }
    setMapDurationError(null);
    setBusy("map");
    try {
      const res = await fetch("/api/admin/integrations/marketplace", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: mapProvider,
          matchType: mapType,
          matchValue: mapValue,
          experienceSlug: mapSlug,
          durationHours,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Mapping failed");
      setMapOpen(false);
      setMapValue("");
      await load({ quiet: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mapping failed");
    } finally {
      setBusy(null);
    }
  }

  async function retryEvent(id: string) {
    setRetryId(id);
    try {
      const res = await fetch("/api/admin/integrations/marketplace", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: id }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        result?: {
          skipped?: boolean;
          status?: string;
          reason?: string;
          action?: string;
          bookingId?: string;
          error?: string;
        };
      };
      if (!res.ok) throwIfAdminApiError(res, data);
      if (!res.ok) throw new Error(data.error || "Retry failed");
      const result = data.result;
      if (result?.skipped) {
        throw new Error(
          result.reason === "duplicate_gmail_message"
            ? "This email is already being processed. Wait a moment and retry again."
            : (result.reason || "Retry skipped").replace(/_/g, " ")
        );
      }
      await load({ quiet: true });
      if (detailId === id) await openEventDetails(id);
      const reviewReason = result?.reason || result?.error;
      if (result?.status === "needs_review" || result?.action === "needs_review") {
        setBanner({
          type: "error",
          text: `Still needs review${reviewReason ? `: ${reviewReason.replace(/_/g, " ")}` : ""}.`,
        });
      } else if (result?.bookingId || result?.action === "create" || result?.status === "success") {
        setBanner({
          type: "success",
          text: result.bookingId
            ? "Booking is on the calendar."
            : "Retry finished.",
        });
      }
    } catch (e) {
      if (e instanceof AdminSessionRedirectError) return;
      setError(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setRetryId(null);
    }
  }

  async function openEventDetails(id: string) {
    setDetailId(id);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/integrations/marketplace/events/${encodeURIComponent(id)}`, {
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as EventInspection & { error?: string };
      if (!res.ok) throwIfAdminApiError(res, data);
      if (!res.ok) throw new Error(data.error || "Could not load booking details");
      setDetail(data);
    } catch (e) {
      if (e instanceof AdminSessionRedirectError) return;
      setDetailError(e instanceof Error ? e.message : "Could not load booking details");
    } finally {
      setDetailLoading(false);
    }
  }

  const connected = status?.gmailStatus === "Connected";
  const watchActive = status?.watchStatus === "Active";
  const events = (status?.events ?? []).filter((ev) => {
    if (ev.eventType === "informational") return false;
    const s = (ev.status ?? "").toLowerCase();
    return s !== "ignored" && s !== "informational";
  });
  const needsAttention = events.filter((ev) => {
    const s = (ev.status ?? "").toLowerCase();
    return RETRYABLE_EVENT_STATUSES.has(s as MarketplaceEventStatus);
  }).length;

  const providers = useMemo(() => {
    const ids = ["boatsetter", "getmyboat", "viator"];
    return ids.map((id) => {
      const fromApi = status?.providers?.find((p) => p.id === id);
      return {
        id,
        label: PROVIDER_META[id]?.label ?? fromApi?.label ?? id,
        blurb: PROVIDER_META[id]?.blurb ?? "",
        tone: PROVIDER_META[id]?.tone ?? "bg-brand-bg text-brand-dark ring-brand-dark/10",
        live: connected,
      };
    });
  }, [status?.providers, connected]);

  if (loading && !status) {
    return (
      <div className="space-y-6 sm:space-y-8 animate-pulse">
        <div className="h-56 rounded-3xl bg-brand-dark/90" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-2xl border border-brand-dark/10 bg-white" />
          ))}
        </div>
        <div className="h-80 rounded-3xl border border-brand-dark/10 bg-white" />
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <section className="relative overflow-hidden rounded-3xl bg-brand-dark px-5 py-6 text-white shadow-premium sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-brand-primary/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-brand-secondary/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-primary">Marketplace sync</p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Inbox bookings</h1>
            <p className="mt-2 text-sm leading-relaxed text-white/70">
              Boatsetter, Getmyboat, and Viator send booking emails to{" "}
              <span className="text-white">{status?.gmailAccount ?? GMAIL_ACCOUNT_EMAIL}</span>. Only confirmed
              bookings and cancellations become trip calendar bookings. Reminders are ignored. Nothing is written
              back to the marketplaces.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold",
                connected ? "bg-emerald-400/20 text-emerald-100 ring-1 ring-emerald-300/40" : "bg-amber-400/20 text-amber-100 ring-1 ring-amber-300/40"
              )}
            >
              {connected ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <AlertCircle className="h-3.5 w-3.5" aria-hidden />}
              {connected ? "Gmail connected" : "Gmail not connected"}
            </div>
            {connected && (
              <div
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold",
                  watchActive ? "bg-white/10 text-white/85" : "bg-amber-400/20 text-amber-100"
                )}
              >
                {watchActive ? "Watching inbox" : "Inbox watch off"}
              </div>
            )}
          </div>
        </div>

        <div className="relative mt-6 flex flex-wrap items-center gap-3 border-t border-white/10 pt-5">
          {!connected ? (
            <a
              href="/api/admin/integrations/gmail/oauth/start"
              className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-brand-primary px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-primary/90"
            >
              <Mail className="h-4 w-4" aria-hidden />
              Connect Gmail
            </a>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void startInboxSync(7)}
                disabled={!!busy}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-primary/90 disabled:opacity-50"
              >
                <Inbox className="h-4 w-4" aria-hidden />
                Pull last 7 days
              </button>
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
              >
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden />
                Refresh
              </button>
            </>
          )}
          {connected && lastSyncHint(status)}
        </div>
      </section>

      {banner && (
        <div
          className={cn(
            "flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm",
            banner.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-800"
          )}
        >
          <span>{banner.text}</span>
          <button type="button" className="font-semibold opacity-70 hover:opacity-100" onClick={() => setBanner(null)}>
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {!connected ? (
        <section className="rounded-3xl border border-brand-dark/10 bg-white p-5 shadow-sm sm:p-8">
          <h2 className="font-display text-xl font-bold text-brand-dark">Connect Gmail to turn this on</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-brand-muted">
            Click Connect Gmail above, choose{" "}
            <strong className="text-brand-dark">{status?.gmailAccount ?? GMAIL_ACCOUNT_EMAIL}</strong>, then
            Allow. After that, new marketplace emails will show up here and on the calendar.
          </p>
          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              {
                n: "1",
                title: "Connect the inbox",
                body: `Sign in as ${status?.gmailAccount ?? GMAIL_ACCOUNT_EMAIL} and allow read-only Gmail access.`,
              },
              { n: "2", title: "We watch new mail", body: "Boatsetter, Getmyboat, and Viator emails are read automatically." },
              { n: "3", title: "Calendar updates", body: "Matched listings become the operator bookings. Cancels free the slot." },
            ].map((step) => (
              <li key={step.n} className="rounded-2xl bg-brand-bg/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Step {step.n}</p>
                <p className="mt-2 font-semibold text-brand-dark">{step.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-brand-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 xl:grid-cols-6">
            <Metric
              label="Inbox"
              value={status?.gmailAccount ?? GMAIL_ACCOUNT_EMAIL}
              sub="Read-only Gmail access"
              icon={Mail}
              tone="teal"
            />
            <Metric
              label="Live watch"
              value={watchActive ? "On" : status?.watchStatus === "Expired" ? "Expired" : "Off"}
              sub={watchActive ? `Renews before ${fmt(status?.watchExpires)}` : "Use Renew watch if this stays off"}
              icon={ShieldCheck}
              tone={watchActive ? "teal" : "amber"}
            />
            <Metric
              label="Last successful sync"
              value={status?.lastSuccessfulSync ? fmt(status.lastSuccessfulSync) : "None yet"}
              sub={needsAttention > 0 ? `${needsAttention} email${needsAttention === 1 ? "" : "s"} need attention` : "No issues waiting"}
              icon={Clock}
              tone={needsAttention > 0 ? "amber" : "navy"}
            />
            {providers.map((p) => (
              <div key={p.id} className="relative overflow-hidden rounded-2xl border border-brand-dark/10 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-muted">Marketplace</p>
                    <p className="mt-2 font-display text-xl font-bold tracking-tight text-brand-dark">{p.label}</p>
                    <p className="mt-1 text-xs leading-relaxed text-brand-muted">{p.blurb}</p>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1", p.tone)}>
                    {p.live ? "Listening" : "Waiting"}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(300px,400px)]">
          <section className="overflow-hidden rounded-3xl border border-brand-dark/10 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-dark/10 px-5 py-4">
              <div>
                <h2 className="font-display text-lg font-bold text-brand-dark">Recent marketplace emails</h2>
                <p className="text-sm text-brand-muted">
                  Confirmed bookings and cancellations only. Reminders are not listed. Retry anything that needs mapping
                  or failed.
                </p>
              </div>
            </div>
            {events.length === 0 ? (
              <div className="px-5 py-14 text-center">
                <Inbox className="mx-auto h-8 w-8 text-brand-primary/70" aria-hidden />
                <p className="mt-3 font-semibold text-brand-dark">No marketplace emails yet</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-brand-muted">
                  Pull the last 7 days to import existing Boatsetter, Getmyboat, and Viator messages, or wait for the
                  next new booking email.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-sm">
                  <thead>
                    <tr className="border-b border-brand-dark/10 text-left text-[11px] font-semibold uppercase tracking-wider text-brand-muted">
                      <th className="px-5 py-3">When</th>
                      <th className="px-3 py-3">Source</th>
                      <th className="px-3 py-3">Guest</th>
                      <th className="px-3 py-3 text-right">Amount</th>
                      <th className="px-3 py-3">What happened</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-5 py-3 text-right"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((ev) => {
                      const tone = statusTone(ev.status);
                      const canRetry = RETRYABLE_EVENT_STATUSES.has(ev.status as MarketplaceEventStatus);
                      const tripRange = fmtRange(ev.startAt, ev.endAt);
                      return (
                        <tr key={ev.id} className="border-b border-brand-dark/5 last:border-0">
                          <td className="whitespace-nowrap px-5 py-3 text-brand-muted">{fmt(ev.createdAt)}</td>
                          <td className="px-3 py-3">
                            <p className="font-medium text-brand-dark">{providerName(ev.provider)}</p>
                            <p className="font-mono text-[11px] text-brand-muted">{ev.externalBookingId || "—"}</p>
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-medium text-brand-dark">{ev.customerName || "—"}</p>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-medium text-brand-dark">
                            {typeof ev.totalCents === "number" && ev.totalCents > 0
                              ? formatMarketplaceUsd(ev.totalCents)
                              : "—"}
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-medium text-brand-dark">{eventLabel(ev)}</p>
                            <p className="max-w-2xl truncate text-xs text-brand-muted">
                              {ev.listingName || ev.subject || ev.detail || "—"}
                            </p>
                            {tripRange ? <p className="text-[11px] text-brand-muted">{tripRange}</p> : null}
                          </td>
                          <td className="px-3 py-3">
                            <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1", tone.className)}>
                              {tone.label}
                            </span>
                            {ev.detail && tone.label !== "Synced" && tone.label !== "Ignored" ? (
                              <p className="mt-1 max-w-[14rem] text-[11px] text-brand-muted">{ev.detail.replace(/_/g, " ")}</p>
                            ) : null}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <button
                                type="button"
                                className="text-xs font-semibold text-brand-primary hover:underline"
                                onClick={() => void openEventDetails(ev.id)}
                              >
                                View details
                              </button>
                              {ev.bookingId ? (
                                <Link href="/admin/bookings" className="text-xs font-semibold text-brand-primary hover:underline">
                                  View bookings
                                </Link>
                              ) : canRetry ? (
                                <button
                                  type="button"
                                  className="text-xs font-semibold text-brand-primary hover:underline disabled:opacity-50"
                                  disabled={retryId === ev.id}
                                  onClick={() => void retryEvent(ev.id)}
                                >
                                  {retryId === ev.id ? "Retrying…" : "Retry"}
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="space-y-6">
          <section className="rounded-3xl border border-brand-dark/10 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-brand-dark">Listing map</h2>
                <p className="mt-1 text-sm text-brand-muted">
                  Matches a marketplace boat name to watersports, pontoon, sunset, or holiday. Obvious names are added
                  automatically. Unclear names wait here until you map them.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMapOpen((v) => !v)}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-brand-dark/15 bg-brand-bg px-4 py-2 text-sm font-semibold text-brand-dark hover:bg-brand-dark/5"
              >
                <Link2 className="h-4 w-4" aria-hidden />
                {mapOpen ? "Close" : "Add mapping"}
              </button>
            </div>

            {mappings.length > 0 && (
              <ul className="mt-4 divide-y divide-brand-dark/5 rounded-2xl border border-brand-dark/10">
                {mappings.map((m, i) => (
                  <li key={`${m.provider}-${m.matchType}-${m.matchValue}-${i}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium text-brand-dark">{m.matchValue}</p>
                      <p className="text-xs text-brand-muted">
                        {providerName(m.provider)} · {m.matchType.replace("_", " ")}
                      </p>
                    </div>
                    <span className="rounded-full bg-brand-primary/10 px-2.5 py-1 text-[11px] font-semibold text-brand-primary">
                      {m.experienceSlug ?? "unmapped"}
                      {m.durationHours ? ` · ${m.durationHours}h` : ""}
                      {m.autoMapped ? " · auto" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {mapOpen && (
              <div className="mt-4 grid gap-3 rounded-2xl bg-brand-bg/70 p-4">
                <label className="flex flex-col gap-1 text-sm">
                  Marketplace
                  <select className="rounded-xl border border-brand-dark/15 bg-white px-3 py-2.5" value={mapProvider} onChange={(e) => setMapProvider(e.target.value)}>
                    <option value="boatsetter">Boatsetter</option>
                    <option value="getmyboat">Getmyboat</option>
                    <option value="viator">Viator</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Match by
                  <select
                    className="rounded-xl border border-brand-dark/15 bg-white px-3 py-2.5"
                    value={mapType}
                    onChange={(e) => setMapType(e.target.value as typeof mapType)}
                  >
                    <option value="listing_name">Listing name</option>
                    <option value="product_code">Product code</option>
                    <option value="listing_id">Listing ID</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Marketplace listing or product
                  <input
                    className="rounded-xl border border-brand-dark/15 bg-white px-3 py-2.5"
                    value={mapValue}
                    onChange={(e) => setMapValue(e.target.value)}
                    placeholder="AXIS WAKE RESEARCH A24 W/TRAILER"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  the operator experience
                  <select className="rounded-xl border border-brand-dark/15 bg-white px-3 py-2.5" value={mapSlug} onChange={(e) => setMapSlug(e.target.value)}>
                    <option value="watersports">Watersports</option>
                    <option value="pontoon">Pontoon</option>
                    <option value="sunset">Sunset</option>
                    <option value="holiday">Holiday</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Duration hours (optional)
                  <input
                    type="number"
                    min="0.25"
                    step="any"
                    className="rounded-xl border border-brand-dark/15 bg-white px-3 py-2.5"
                    value={mapDuration}
                    onChange={(e) => {
                      setMapDuration(e.target.value);
                      setMapDurationError(null);
                    }}
                    placeholder="2"
                  />
                  {mapDurationError ? <span className="text-xs text-red-700">{mapDurationError}</span> : null}
                </label>
                <div>
                  <button
                    type="button"
                    disabled={!mapValue || busy === "map"}
                    onClick={() => void saveMapping()}
                    className="inline-flex min-h-[44px] items-center rounded-full bg-brand-dark px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark/90 disabled:opacity-50"
                  >
                    {busy === "map" ? "Saving…" : "Save mapping"}
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-dashed border-brand-dark/15 bg-white/60 p-5">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <span>
                <span className="font-semibold text-brand-dark">Advanced</span>
                <span className="ml-2 text-sm text-brand-muted">Reconnect, test, or pull 30 days of mail</span>
              </span>
              <span className="text-sm font-semibold text-brand-primary">{advancedOpen ? "Hide" : "Show"}</span>
            </button>
            {advancedOpen && (
              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href="/api/admin/integrations/gmail/oauth/start"
                  className="inline-flex min-h-[40px] items-center rounded-full border border-brand-dark/15 px-4 py-2 text-sm font-semibold text-brand-dark hover:bg-white"
                >
                  Reconnect Gmail
                </a>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => runAction("test", () => fetch("/api/admin/integrations/gmail/test", { method: "POST", credentials: "include" }))}
                  className="inline-flex min-h-[40px] items-center rounded-full border border-brand-dark/15 px-4 py-2 text-sm font-semibold text-brand-dark hover:bg-white disabled:opacity-50"
                >
                  {busy === "test" ? "Testing…" : "Test Gmail"}
                </button>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => runAction("renew", () => fetch("/api/admin/integrations/gmail/watch/renew", { method: "POST", credentials: "include" }))}
                  className="inline-flex min-h-[40px] items-center rounded-full border border-brand-dark/15 px-4 py-2 text-sm font-semibold text-brand-dark hover:bg-white disabled:opacity-50"
                >
                  {busy === "renew" ? "Renewing…" : "Renew watch"}
                </button>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => void startInboxSync(30)}
                  className="inline-flex min-h-[40px] items-center rounded-full border border-brand-dark/15 px-4 py-2 text-sm font-semibold text-brand-dark hover:bg-white disabled:opacity-50"
                >
                  Pull last 30 days
                </button>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() =>
                    runAction("payouts", () =>
                      fetch("/api/admin/integrations/marketplace", { method: "PATCH", credentials: "include" })
                    )
                  }
                  className="inline-flex min-h-[40px] items-center rounded-full border border-brand-dark/15 px-4 py-2 text-sm font-semibold text-brand-dark hover:bg-white disabled:opacity-50"
                >
                  {busy === "payouts" ? "Filling…" : "Fill missing prices"}
                </button>
              </div>
            )}
          </section>
          </div>
          </div>
        </>
      )}
      {syncModal ? (
        <InboxSyncModal state={syncModal} onClose={() => setSyncModal(null)} />
      ) : null}
      <Dialog
        open={!!detailId}
        onOpenChange={(open) => {
          if (!open) {
            setDetailId(null);
            setDetail(null);
            setDetailError(null);
          }
        }}
        title="Marketplace booking"
        description={detail?.incoming.listingName || detail?.subject || "Incoming trip vs what is already on the calendar"}
        fullScreenOnMobile
      >
        {detailLoading ? <p className="text-sm text-brand-muted">Loading booking details…</p> : null}
        {detailError ? <p className="text-sm text-red-700">{detailError}</p> : null}
        {detail ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1", statusTone(detail.status ?? undefined).className)}>
                {statusTone(detail.status ?? undefined).label}
              </span>
              {detail.detail ? (
                <p className="text-sm text-brand-muted">{String(detail.detail).replace(/_/g, " ")}</p>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-brand-bg/70 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-muted">Incoming trip</p>
                <p className="mt-1 font-medium text-brand-dark">
                  {fmtRange(detail.incoming.startAt, detail.incoming.endAt) || "Times not parsed"}
                </p>
                {detail.incoming.durationHours ? (
                  <p className="text-xs text-brand-muted">{detail.incoming.durationHours} hour trip</p>
                ) : null}
                <p className="mt-2 text-sm text-brand-dark">{detail.incoming.customerName || "Guest not parsed"}</p>
                {detail.incoming.partySize ? (
                  <p className="text-xs text-brand-muted">
                    {detail.incoming.partySize} guest{detail.incoming.partySize === 1 ? "" : "s"}
                  </p>
                ) : null}
                {typeof detail.incoming.totalCents === "number" && detail.incoming.totalCents > 0 ? (
                  <p className="mt-1 text-sm font-medium text-brand-dark">{formatMarketplaceUsd(detail.incoming.totalCents)}</p>
                ) : null}
              </div>
              <div className="rounded-2xl bg-brand-bg/70 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-muted">Maps to</p>
                <p className="mt-1 font-medium text-brand-dark">
                  {detail.incoming.boatName || (detail.incoming.boatResolved ? "Shared sunset inventory" : "Boat not resolved")}
                </p>
                <p className="text-xs text-brand-muted">
                  {detail.incoming.experienceTitle || detail.incoming.experienceSlug || "Experience not mapped"}
                </p>
                <p className="mt-2 font-mono text-[11px] text-brand-muted">
                  {detail.incoming.provider} · {detail.incoming.externalBookingId}
                </p>
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-muted">What’s overlapping</h3>
              {detail.overlaps.length === 0 ? (
                <p className="mt-2 text-sm text-brand-muted">
                  {detail.inspectError
                    ? `Could not compare calendars (${detail.inspectError.replace(/_/g, " ")}).`
                    : "Nothing currently overlapping this window."}
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {detail.overlaps.map((item) => (
                    <li key={`${item.kind}-${item.id}`} className="rounded-2xl border border-brand-dark/10 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-brand-dark/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-dark">
                          {item.kind}
                        </span>
                        {item.sameGuestPlaceholder ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                            Same guest
                          </span>
                        ) : null}
                        <p className="font-medium text-brand-dark">{item.title}</p>
                      </div>
                      <p className="mt-1 text-sm text-brand-dark">{fmtRange(item.startAt, item.endAt)}</p>
                      <p className="text-xs text-brand-muted">
                        {[item.boatName, item.subtitle].filter(Boolean).join(" · ")}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <MarketplaceEmailDetails details={detail.incoming.details} excerpt={detail.incoming.emailExcerpt} />
            {RETRYABLE_EVENT_STATUSES.has((detail.status ?? "") as MarketplaceEventStatus) ? (
              <button
                type="button"
                className="inline-flex min-h-[40px] items-center rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary/90 disabled:opacity-50"
                disabled={retryId === detail.id}
                onClick={() => void retryEvent(detail.id)}
              >
                {retryId === detail.id ? "Retrying…" : "Retry sync"}
              </button>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

function lastSyncHint(status: StatusResponse | null) {
  if (!status || (!status.lastSuccessfulSync && !status.lastGmailNotification)) return null;
  return (
    <p className="text-xs text-white/55">
      Last email seen {fmt(status.lastGmailNotification)} · last sync {fmt(status.lastSuccessfulSync)}
    </p>
  );
}

const SYNC_READING_STEPS = [
  "Connecting to Gmail…",
  "Reading marketplace emails…",
  "Finding confirmed bookings and cancellations…",
  "Adding trips to the trip calendar…",
];

function InboxSyncModal({
  state,
  onClose,
}: {
  state: InboxSyncModalState;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const reading = state.phase === "reading";

  useEffect(() => {
    if (!reading) return;
    const id = window.setInterval(() => {
      setStep((n) => (n + 1) % SYNC_READING_STEPS.length);
    }, 2200);
    return () => window.clearInterval(id);
  }, [reading]);

  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = prev;
    };
  }, []);

  const title =
    state.phase === "error"
      ? "Inbox sync failed"
      : state.phase === "done"
        ? "Inbox sync complete"
        : `Reading last ${state.days} days`;

  const overlay = (
    <div
      className="fixed inset-0 z-[120] flex h-dvh items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inbox-sync-title"
      aria-live="polite"
    >
      <div className="absolute inset-0 bg-brand-dark/70 backdrop-blur-lg" aria-hidden />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl bg-white p-8 text-center shadow-premium">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-brand-primary/10">
          {state.phase === "done" ? (
            <CheckCircle2 className="h-10 w-10 text-emerald-600" aria-hidden />
          ) : state.phase === "error" ? (
            <AlertCircle className="h-10 w-10 text-red-600" aria-hidden />
          ) : (
            <span className="relative flex h-16 w-16 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-brand-primary/20" />
              <Inbox className="relative h-9 w-9 text-brand-primary" aria-hidden />
            </span>
          )}
        </div>

        <h2 id="inbox-sync-title" className="mt-5 font-display text-2xl font-bold text-brand-dark">
          {title}
        </h2>

        {reading ? (
          <>
            <p className="mt-2 min-h-[1.5rem] text-sm text-brand-muted">{SYNC_READING_STEPS[step]}</p>
            <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-brand-dark/10">
              <div className="inbox-sync-bar h-full w-1/3 rounded-full bg-brand-primary" />
            </div>
            <p className="mt-5 text-xs text-brand-muted">This can take a minute. Keep this window open.</p>
            <div className="mt-5 flex justify-center gap-2">
              {["Boatsetter", "Getmyboat", "Viator"].map((name) => (
                <span
                  key={name}
                  className="rounded-full bg-brand-bg px-3 py-1 text-[11px] font-semibold text-brand-dark"
                >
                  {name}
                </span>
              ))}
            </div>
          </>
        ) : null}

        {state.phase === "done" ? (
          <>
            <p className="mt-2 text-sm text-brand-muted">
              Checked the last {state.days} days of Boatsetter, Getmyboat, and Viator mail.
              {(state.payoutsFilled ?? 0) > 0
                ? ` Filled ${state.payoutsFilled} missing payout${state.payoutsFilled === 1 ? "" : "s"} from saved emails.`
                : ""}
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-brand-bg px-2 py-3">
                <p className="font-display text-xl font-bold text-brand-dark">{state.messageCount ?? "—"}</p>
                <p className="text-[11px] font-semibold text-brand-muted">Emails</p>
              </div>
              <div className="rounded-2xl bg-brand-bg px-2 py-3">
                <p className="font-display text-xl font-bold text-brand-dark">{state.processed ?? 0}</p>
                <p className="text-[11px] font-semibold text-brand-muted">Processed</p>
              </div>
              <div className="rounded-2xl bg-brand-bg px-2 py-3">
                <p className="font-display text-xl font-bold text-brand-dark">
                  {(state.failed ?? 0) + (state.parseFailed ?? 0) + (state.unmapped ?? 0)}
                </p>
                <p className="text-[11px] font-semibold text-brand-muted">Need attention</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-brand-muted">
              {state.skipped ?? 0} skipped
              {(state.deadLettered ?? 0) > 0 ? ` · ${state.deadLettered} dead-lettered` : ""}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-primary/90"
            >
              Done
            </button>
          </>
        ) : null}

        {state.phase === "error" ? (
          <>
            <p className="mt-2 text-sm text-brand-muted">{state.error || "Something went wrong while reading Gmail."}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-brand-dark px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark/90"
            >
              Close
            </button>
          </>
        ) : null}
      </div>
      <style>{`
        @keyframes syncbar {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(320%); }
        }
        .inbox-sync-bar {
          animation: syncbar 1.6s ease-in-out infinite;
        }
      `}</style>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(overlay, document.body) : overlay;
}

function Metric({
  label,
  value,
  sub,
  icon: Icon,
  tone = "teal",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "teal" | "navy" | "amber";
}) {
  const toneClass =
    tone === "amber"
      ? "bg-amber-100 text-amber-800"
      : tone === "navy"
        ? "bg-brand-dark/10 text-brand-dark"
        : "bg-brand-primary/10 text-brand-primary";
  const barClass =
    tone === "amber" ? "from-amber-400 to-amber-200" : tone === "navy" ? "from-brand-dark to-brand-primary" : "from-brand-primary to-brand-primary/40";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-brand-dark/10 bg-white p-5 shadow-sm">
      <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", barClass)} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-muted">{label}</p>
          <p className="mt-2 truncate font-display text-xl font-bold tracking-tight text-brand-dark">{value}</p>
          {sub ? <p className="mt-1 text-xs leading-relaxed text-brand-muted">{sub}</p> : null}
        </div>
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl", toneClass)}>
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      </div>
    </div>
  );
}

