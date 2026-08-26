"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  Copy,
  Link2,
  Mail,
  Megaphone,
  MessageSquare,
  Phone,
  Send,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getAdminBookingStatusBadgeClass } from "@/lib/admin/admin-booking-status-badge";
import { customerStatusLabel, type CustomerActivityItem, type CustomerKind } from "@/lib/admin/customer-crm";
import { daysWaiting, leadInterestLabel, leadSourceLabel, publicBookingPath, suggestedLeadEmails } from "@/lib/lead/lead";
import { formatTripDateYyyyMmDd } from "@/lib/booking/format-booking-datetime";
import { AdminSessionRedirectError, throwIfAdminApiError } from "@/lib/admin-auth-client";

type ProfileBooking = {
  id: string;
  experienceName: string;
  boatName: string | null;
  tripDate: string | null;
  partySize: number | null;
  status: string;
  totalSpentCents: number;
  createdAt: string | null;
  specialNotes: string | null;
  howDidYouHear: string | null;
  discountCode: string | null;
};

type CustomerProfileData = {
  email: string;
  name: string;
  phone: string;
  kind: CustomerKind;
  bookingCount: number;
  totalSpentCents: number;
  lastBookingAt: string | null;
  lastExperienceName: string | null;
  marketingOptIn: boolean;
  leadSource: string | null;
  leadCapturedAt: string | null;
  leadInterest: string | null;
  leadPage: string | null;
  lastContactedAt: string | null;
  leadMessage: string | null;
  bookings: ProfileBooking[];
  activity: CustomerActivityItem[];
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function initials(name: string, email: string) {
  const source = name.trim() || email.trim();
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase() || "?";
}

function statusBadgeClass(kind: CustomerKind, bookingCount: number, lastContactedAt?: string | null) {
  if (kind === "lead" || bookingCount <= 0) {
    return lastContactedAt ? "bg-white/15 text-white" : "bg-amber-100 text-amber-900";
  }
  if (bookingCount > 1) return "bg-brand-secondary/15 text-brand-secondary";
  return "bg-brand-primary/15 text-brand-primary";
}

function activityIcon(type: CustomerActivityItem["type"]) {
  if (type === "sms") return MessageSquare;
  if (type === "email") return Mail;
  if (type === "lead_captured") return UserPlus;
  if (type === "marketing_opt_in") return Megaphone;
  return CalendarDays;
}

export function CustomerProfile({ email }: { email: string }) {
  const [data, setData] = useState<CustomerProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendOk, setSendOk] = useState(false);
  const [copied, setCopied] = useState<"email" | "phone" | "booking" | null>(null);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/customers/profile?email=${encodeURIComponent(email)}`, {
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throwIfAdminApiError(res, json, "Failed to load profile");
      setData(json as CustomerProfileData);
    } catch (e) {
      if (e instanceof AdminSessionRedirectError) return;
      setError(e instanceof Error ? e.message : "Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [email]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markContacted() {
    if (!data) return;
    setMarking(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/customers/mark-contacted", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throwIfAdminApiError(res, json, "Failed to mark contacted");
      await load();
    } catch (err) {
      if (err instanceof AdminSessionRedirectError) return;
      setSendError(err instanceof Error ? err.message : "Failed to mark contacted");
    } finally {
      setMarking(false);
    }
  }

  function applySuggestion(subjectLine: string, bodyText: string) {
    setSubject(subjectLine);
    setBody(bodyText);
    setSendOk(false);
    document.getElementById("send-email")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function copy(value: string, which: "email" | "phone" | "booking") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      /* ignore */
    }
  }

  async function sendEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    setSending(true);
    setSendError(null);
    setSendOk(false);
    try {
      const res = await fetch("/api/admin/customers/send-email", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: data.email,
          toName: data.name,
          subject,
          body,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throwIfAdminApiError(res, json, "Failed to send");
      setSendOk(true);
      setSubject("");
      setBody("");
      await load();
    } catch (err) {
      if (err instanceof AdminSessionRedirectError) return;
      setSendError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-40 rounded-lg bg-brand-dark/10" />
        <div className="h-48 rounded-3xl bg-brand-dark/90" />
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="h-96 rounded-3xl border border-brand-dark/10 bg-white lg:col-span-3" />
          <div className="h-96 rounded-3xl border border-brand-dark/10 bg-white lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link href="/admin/customers" className="inline-flex items-center gap-2 text-sm font-medium text-brand-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to customers
        </Link>
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error ?? "Not found"}
        </div>
      </div>
    );
  }

  const status = customerStatusLabel(data);
  const firstName = data.name.trim().split(/\s+/)[0] || "there";

  return (
    <div className="space-y-6 sm:space-y-8">
      <Link href="/admin/customers" className="inline-flex items-center gap-2 text-sm font-medium text-brand-muted hover:text-brand-primary">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All customers &amp; leads
      </Link>

      <section className="relative overflow-hidden rounded-3xl bg-brand-dark px-5 py-6 text-white shadow-premium sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-brand-primary/25 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white">
              {initials(data.name, data.email)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                  {data.name || data.email}
                </h1>
                <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide", statusBadgeClass(data.kind, data.bookingCount, data.lastContactedAt))}>
                  {status}
                </span>
                {data.marketingOptIn ? (
                  <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white/80">
                    Opted in
                  </span>
                ) : (
                  <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white/50">
                    No marketing opt-in
                  </span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/75">
                <a href={`mailto:${data.email}`} className="inline-flex items-center gap-1.5 hover:text-white break-all">
                  <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {data.email}
                </a>
                {data.phone ? (
                  <a href={`tel:${data.phone}`} className="inline-flex items-center gap-1.5 hover:text-white">
                    <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {data.phone}
                  </a>
                ) : null}
              </div>
              <p className="mt-3 text-sm text-white/60">
                {data.kind === "lead"
                  ? [
                      leadSourceLabel(data.leadSource),
                      data.leadInterest ? leadInterestLabel(data.leadInterest) : null,
                      data.leadCapturedAt
                        ? `${daysWaiting(data.leadCapturedAt) ?? 0} day${(daysWaiting(data.leadCapturedAt) ?? 0) === 1 ? "" : "s"} waiting`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : `${data.bookingCount} booking${data.bookingCount !== 1 ? "s" : ""} · ${formatCents(data.totalSpentCents)} spent${data.lastExperienceName ? ` · last: ${data.lastExperienceName}` : ""}${data.leadSource ? ` · first found via ${leadSourceLabel(data.leadSource)}` : ""}`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copy(data.email, "email")}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
              {copied === "email" ? "Copied" : "Copy email"}
            </button>
            {data.phone ? (
              <a
                href={`tel:${data.phone}`}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20"
              >
                <Phone className="h-3.5 w-3.5" aria-hidden />
                Call
              </a>
            ) : null}
            <a
              href="#send-email"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-brand-primary px-4 py-2 text-xs font-semibold text-white hover:bg-brand-primary/90"
            >
              <Mail className="h-3.5 w-3.5" aria-hidden />
              Email
            </a>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="overflow-hidden rounded-3xl border border-brand-dark/10 bg-white shadow-sm lg:col-span-3">
          <div className="border-b border-brand-dark/10 px-5 py-4 sm:px-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-dark">
              {data.kind === "lead" && data.bookings.length === 0 ? (
                <Sparkles className="h-5 w-5 text-brand-primary" aria-hidden />
              ) : (
                <CalendarDays className="h-5 w-5 text-brand-primary" aria-hidden />
              )}
              {data.kind === "lead" && data.bookings.length === 0 ? "Convert this lead" : "History"}
            </h2>
            <p className="mt-1 text-xs text-brand-muted">
              {data.kind === "lead" && data.bookings.length === 0
                ? "Source, wait time, and a suggested next email"
                : "Bookings for this email"}
            </p>
          </div>
          {data.kind === "lead" && data.bookings.length === 0 ? (
            <LeadConvertPanel
              data={data}
              marking={marking}
              copiedBooking={copied === "booking"}
              onCopyBooking={() => {
                const url = `${window.location.origin}${publicBookingPath(data.leadInterest)}`;
                void copy(url, "booking");
              }}
              onMarkContacted={() => void markContacted()}
              onApplySuggestion={applySuggestion}
            />
          ) : data.bookings.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-brand-muted">
              Hasn&apos;t booked yet
              {data.leadSource ? ` · came in via ${leadSourceLabel(data.leadSource)}` : ""}.
            </div>
          ) : (
            <ul className="divide-y divide-brand-dark/5">
              {data.bookings.map((b) => (
                <li key={b.id} className="px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/admin/bookings?highlight=${encodeURIComponent(b.id)}`}
                        className="font-semibold text-brand-dark hover:text-brand-primary"
                      >
                        {b.experienceName}
                      </Link>
                      <p className="mt-1 text-xs text-brand-muted">
                        {formatTripDateYyyyMmDd(b.tripDate)}
                        {b.boatName ? ` · ${b.boatName}` : ""}
                        {b.partySize != null ? ` · ${b.partySize} guest${b.partySize !== 1 ? "s" : ""}` : ""}
                      </p>
                      {b.howDidYouHear ? (
                        <p className="mt-1 text-xs text-brand-muted">Heard about us: {b.howDidYouHear}</p>
                      ) : null}
                      {b.specialNotes ? (
                        <p className="mt-1 text-xs text-brand-muted">Notes: {b.specialNotes}</p>
                      ) : null}
                      {b.discountCode ? (
                        <p className="mt-1 text-xs text-brand-muted">Code: {b.discountCode}</p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-brand-dark">{formatCents(b.totalSpentCents)}</p>
                      <span className={cn("mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", getAdminBookingStatusBadgeClass(b.status))}>
                        {b.status.replace(/_/g, " ")}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-6 lg:col-span-2">
          <section id="send-email" className="overflow-hidden rounded-3xl border border-brand-dark/10 bg-white shadow-sm">
            <div className="border-b border-brand-dark/10 px-5 py-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-dark">
                <Send className="h-5 w-5 text-brand-primary" aria-hidden />
                Email {firstName}
              </h2>
              <p className="mt-1 text-xs text-brand-muted">
                Sends via Brevo. Replies go to the ops inbox.
                {!data.marketingOptIn ? " They did not check marketing opt-in — use for personal follow-up." : ""}
              </p>
            </div>
            <form onSubmit={(e) => void sendEmail(e)} className="space-y-3 px-5 py-4">
              <div>
                <label htmlFor="crm-subject" className="sr-only">
                  Subject
                </label>
                <input
                  id="crm-subject"
                  type="text"
                  required
                  maxLength={200}
                  placeholder="Subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-brand-dark/15 bg-brand-bg/40 px-3 py-2.5 text-sm text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                />
              </div>
              <div>
                <label htmlFor="crm-body" className="sr-only">
                  Message
                </label>
                <textarea
                  id="crm-body"
                  required
                  rows={6}
                  maxLength={10000}
                  placeholder={`Hi ${firstName},\n\n`}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full rounded-xl border border-brand-dark/15 bg-brand-bg/40 px-3 py-2.5 text-sm text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                />
              </div>
              {sendError ? <p className="text-sm text-red-700">{sendError}</p> : null}
              {sendOk ? <p className="text-sm text-brand-primary">Email sent. It will show up in activity.</p> : null}
              <button
                type="submit"
                disabled={sending}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-brand-dark px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark/90 disabled:opacity-60"
              >
                <Send className="h-4 w-4" aria-hidden />
                {sending ? "Sending…" : "Send email"}
              </button>
            </form>
          </section>

          <section className="overflow-hidden rounded-3xl border border-brand-dark/10 bg-white shadow-sm">
            <div className="border-b border-brand-dark/10 px-5 py-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-dark">
                <Users className="h-5 w-5 text-brand-primary" aria-hidden />
                Activity
              </h2>
              <p className="mt-1 text-xs text-brand-muted">Leads, bookings, emails, and SMS</p>
            </div>
            {data.activity.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-brand-muted">No activity yet.</div>
            ) : (
              <ol className="divide-y divide-brand-dark/5">
                {data.activity.map((item) => {
                  const Icon = activityIcon(item.type);
                  return (
                    <li key={item.id} className="flex gap-3 px-5 py-3.5">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary">
                        <Icon className="h-4 w-4" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-brand-dark">{item.title}</p>
                        {item.detail ? <p className="mt-0.5 text-xs text-brand-muted break-words">{item.detail}</p> : null}
                        <p className="mt-1 text-[11px] text-brand-muted">{formatDateTime(item.at)}</p>
                        {item.bookingId ? (
                          <Link
                            href={`/admin/bookings?highlight=${encodeURIComponent(item.bookingId)}`}
                            className="mt-1 inline-block text-[11px] font-medium text-brand-primary hover:underline"
                          >
                            View booking
                          </Link>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function LeadConvertPanel({
  data,
  marking,
  copiedBooking,
  onCopyBooking,
  onMarkContacted,
  onApplySuggestion,
}: {
  data: CustomerProfileData;
  marking: boolean;
  copiedBooking: boolean;
  onCopyBooking: () => void;
  onMarkContacted: () => void;
  onApplySuggestion: (subject: string, body: string) => void;
}) {
  const waiting = daysWaiting(data.leadCapturedAt);
  const firstName = data.name.trim().split(/\s+/)[0] || "there";
  const bookingPath = publicBookingPath(data.leadInterest);
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://example.com").replace(/\/+$/, "");
  const suggestions = suggestedLeadEmails({
    firstName,
    interest: data.leadInterest,
    bookingUrl: `${origin}${bookingPath}`,
  });

  const facts: { label: string; value: string }[] = [
    { label: "Source", value: leadSourceLabel(data.leadSource) },
    { label: "Interest", value: data.leadInterest ? leadInterestLabel(data.leadInterest) : "Not specified" },
    { label: "Signed up", value: data.leadCapturedAt ? formatDate(data.leadCapturedAt) : "—" },
    {
      label: "Waiting",
      value: waiting == null ? "—" : waiting === 0 ? "Today" : `${waiting} day${waiting === 1 ? "" : "s"}`,
    },
    { label: "Last contacted", value: data.lastContactedAt ? formatDate(data.lastContactedAt) : "Never" },
  ];
  if (data.leadPage) facts.push({ label: "Page", value: data.leadPage });

  return (
    <div className="space-y-5 px-5 py-5 sm:px-6">
      <p className="text-sm text-brand-muted">Hasn&apos;t booked yet. Follow up from here.</p>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {facts.map((f) => (
          <div key={f.label} className="rounded-2xl bg-brand-bg/60 px-4 py-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">{f.label}</dt>
            <dd className="mt-1 text-sm font-medium text-brand-dark break-words">{f.value}</dd>
          </div>
        ))}
      </dl>
      {data.leadMessage ? (
        <div className="rounded-2xl border border-brand-dark/10 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">Message</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-brand-dark">{data.leadMessage}</p>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onCopyBooking}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-brand-dark/15 bg-white px-4 py-2 text-sm font-semibold text-brand-dark hover:bg-brand-bg"
        >
          <Link2 className="h-4 w-4" aria-hidden />
          {copiedBooking ? "Copied booking link" : "Copy booking link"}
        </button>
        <button
          type="button"
          disabled={marking || Boolean(data.lastContactedAt)}
          onClick={onMarkContacted}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark/90 disabled:opacity-50"
        >
          {data.lastContactedAt ? "Marked contacted" : marking ? "Saving…" : "Mark contacted"}
        </button>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">Suggested emails</p>
        <div className="mt-2 flex flex-col gap-2">
          {suggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onApplySuggestion(s.subject, s.body)}
              className="rounded-2xl border border-brand-dark/10 px-4 py-3 text-left hover:border-brand-primary/40 hover:bg-brand-bg/50"
            >
              <span className="text-sm font-semibold text-brand-dark">{s.label}</span>
              <span className="mt-0.5 block text-xs text-brand-muted">{s.subject}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
