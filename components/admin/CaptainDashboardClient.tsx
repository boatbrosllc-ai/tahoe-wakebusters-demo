"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Calendar as CalendarIcon,
  FileCheck,
  MapPin,
  MessageSquare,
  Phone,
  Ship,
  StickyNote,
  Sun,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getChicagoToday, getMonthRange } from "@/lib/booking/booking-date-range";
import { useAdminPrincipal } from "@/app/(site)/admin/(dashboard)/AdminShell";
import { useCaptainTrips } from "@/components/admin/useCaptainTrips";
import { CaptainTripDetailDialog } from "@/components/admin/CaptainTripDetailDialog";
import {
  addCaptainTripDays,
  captainGuestNotes,
  captainHasOpsNotes,
  captainMonthDay,
  captainPickupHasDetails,
  captainTripDate,
  captainTripLabel,
  captainTripTimeRange,
  captainWaiverLabel,
  captainWaiverNeedsAttention,
  captainWeekdayShort,
  type CaptainTrip,
} from "@/lib/admin/captain-trip";
import { operatorNoteAuthorFirstName, readOperatorNotesLog } from "@/lib/admin/operator-notes";
import { MarketplaceSourceBadge } from "@/components/admin/MarketplaceSourceBadge";

function TripRow({
  ev,
  todayStr,
  onOpen,
}: {
  ev: CaptainTrip;
  todayStr: string;
  onOpen: (ev: CaptainTrip) => void;
}) {
  const day = captainTripDate(ev);
  const isToday = day === todayStr;
  const guestNotes = captainGuestNotes(ev);
  const opsLog = readOperatorNotesLog(ev);
  return (
    <button
      type="button"
      onClick={() => onOpen(ev)}
      className="flex w-full gap-4 px-5 py-4 text-left transition hover:bg-brand-bg/60"
    >
      <div
        className={cn(
          "flex h-[4.25rem] w-14 shrink-0 flex-col items-center justify-center rounded-2xl",
          isToday ? "bg-brand-dark text-white" : "bg-brand-primary/10 text-brand-dark"
        )}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
          {captainWeekdayShort(day)}
        </span>
        <span className="font-display text-xl font-bold leading-none">{Number(day.slice(8))}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="flex min-w-0 items-center gap-2">
            <span className="truncate font-semibold text-brand-dark">{captainTripLabel(ev)}</span>
            <MarketplaceSourceBadge booking={ev} className="px-1.5 py-0.5 text-[8px]" />
          </p>
          {isToday && (
            <span className="shrink-0 rounded-full bg-brand-secondary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-secondary">
              Today
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm font-medium tabular-nums text-brand-primary">{captainTripTimeRange(ev)}</p>
        <p className="mt-1 truncate text-xs text-brand-muted">
          {[ev.boatName, ev.experienceName, ev.partySize != null ? `${ev.partySize} guests` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {opsLog.length > 0 ? (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-brand-primary">
            <MessageSquare className="h-3 w-3" aria-hidden />
            {opsLog.length > 1
              ? `${opsLog.length} notes from ${operatorNoteAuthorFirstName(opsLog[opsLog.length - 1]!)}`
              : `Note from ${operatorNoteAuthorFirstName(opsLog[0]!)}`}
          </p>
        ) : guestNotes ? (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-800">
            <StickyNote className="h-3 w-3" aria-hidden /> Guest notes
          </p>
        ) : null}
      </div>
    </button>
  );
}

export function CaptainDashboardClient() {
  const { displayName } = useAdminPrincipal();
  const firstName = displayName?.split(" ")[0]?.trim() || "Captain";
  const todayStr = getChicagoToday();
  const now = new Date();
  const monthRange = getMonthRange(now.getFullYear(), now.getMonth());
  const weekEnd = addCaptainTripDays(todayStr, 6);
  const fetchTo = monthRange.end > addCaptainTripDays(todayStr, 21) ? monthRange.end : addCaptainTripDays(todayStr, 21);
  const { events, loading, error } = useCaptainTrips(todayStr, fetchTo);
  const [selected, setSelected] = useState<CaptainTrip | null>(null);

  const upcoming = useMemo(
    () =>
      events
        .filter((ev) => captainTripDate(ev) >= todayStr)
        .sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [events, todayStr]
  );
  const nextTrip = upcoming[0] ?? null;
  const todayTrips = upcoming.filter((ev) => captainTripDate(ev) === todayStr);
  const weekTrips = upcoming.filter((ev) => {
    const day = captainTripDate(ev);
    return day >= todayStr && day <= weekEnd;
  });
  const laterWeek = weekTrips.filter((ev) => captainTripDate(ev) !== todayStr);
  const monthRemaining = upcoming.filter((ev) => {
    const day = captainTripDate(ev);
    return day >= todayStr && day <= monthRange.end;
  });
  const attention = useMemo(() => {
    return weekTrips.filter((ev) => {
      if (captainTripDate(ev) === todayStr) return false;
      return (
        Boolean(captainHasOpsNotes(ev)) ||
        captainWaiverNeedsAttention(ev.waiver?.status) ||
        Boolean(captainGuestNotes(ev))
      );
    });
  }, [weekTrips, todayStr]);

  return (
    <div className="space-y-6 pb-16">
      <section className="relative overflow-hidden rounded-3xl bg-brand-dark px-5 py-6 text-white shadow-sm sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-brand-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-brand-secondary/20 blur-3xl" />
        <div className="relative grid gap-6 lg:grid-cols-[1fr_minmax(280px,22rem)] lg:items-stretch">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">Captain dashboard</p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Hey, {firstName}</h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-white/70">
              Today’s trips, pickup, guest phone, and notes from the office. Open the calendar for the full month.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2 sm:max-w-md">
              {[
                { label: "Today", value: todayTrips.length },
                { label: "This week", value: weekTrips.length },
                { label: "This month", value: monthRemaining.length },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 backdrop-blur-sm"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">{stat.label}</p>
                  <p className="mt-1 font-display text-2xl font-bold tabular-nums">{loading ? "—" : stat.value}</p>
                </div>
              ))}
            </div>
            <Link
              href="/admin/calendars"
              className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
            >
              <CalendarIcon className="h-4 w-4" aria-hidden />
              Open calendar
            </Link>
          </div>

          <button
            type="button"
            disabled={!nextTrip}
            onClick={() => nextTrip && setSelected(nextTrip)}
            className="group relative overflow-hidden rounded-2xl border border-white/15 bg-white/10 p-5 text-left backdrop-blur-sm transition hover:bg-white/15 disabled:cursor-default disabled:hover:bg-white/10"
          >
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-primary">
              <Sun className="h-3.5 w-3.5" aria-hidden />
              Next up
            </p>
            {loading ? (
              <p className="mt-3 text-sm text-white/60">Loading…</p>
            ) : nextTrip ? (
              <>
                <p className="mt-3 font-display text-xl font-bold leading-tight">{captainTripLabel(nextTrip)}</p>
                <p className="mt-2 text-sm text-white/80">
                  {captainWeekdayShort(captainTripDate(nextTrip))}, {captainMonthDay(captainTripDate(nextTrip))}
                  {nextTrip.startTime ? ` · ${nextTrip.startTime}` : ""}
                  {nextTrip.endTime ? `–${nextTrip.endTime}` : ""}
                </p>
                <p className="mt-1 truncate text-sm text-white/60">
                  {[nextTrip.boatName, nextTrip.partySize != null ? `${nextTrip.partySize} guests` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="mt-4 text-xs font-semibold text-brand-primary group-hover:underline">Open briefing →</p>
              </>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-white/70">
                Nothing on the books yet. New assignments show up here and in your email.
              </p>
            )}
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      <section className="overflow-hidden rounded-3xl border border-brand-dark/10 bg-white shadow-sm">
        <div className="border-b border-brand-dark/10 px-5 py-4">
          <h2 className="font-display text-lg font-bold text-brand-dark">Today</h2>
          <p className="mt-0.5 text-xs text-brand-muted">Call the guest, confirm pickup, and check notes before you go.</p>
        </div>
        {loading ? (
          <div className="space-y-3 p-5">
            <div className="h-32 animate-pulse rounded-2xl bg-brand-bg" />
          </div>
        ) : todayTrips.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Ship className="mx-auto h-8 w-8 text-brand-primary/40" aria-hidden />
            <p className="mt-3 text-sm font-medium text-brand-dark">No trips today</p>
            <p className="mt-1 text-xs text-brand-muted">
              {nextTrip
                ? `Next is ${captainWeekdayShort(captainTripDate(nextTrip))}, ${captainMonthDay(captainTripDate(nextTrip))}.`
                : "When Admin assigns you, it lands here."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-brand-dark/5">
            {todayTrips.map((ev) => {
              const pickup =
                ev.pickup?.title?.trim() || ev.pickup?.address?.trim() || ev.locationText?.trim() || null;
              const opsLog = readOperatorNotesLog(ev);
              const latestOps = opsLog[opsLog.length - 1];
              return (
                <li key={ev.id} className="px-5 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <button type="button" onClick={() => setSelected(ev)} className="min-w-0 text-left">
                      <p className="font-display text-xl font-bold text-brand-dark">{captainTripTimeRange(ev)}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2">
                        <span className="text-lg font-semibold text-brand-dark">{captainTripLabel(ev)}</span>
                        <MarketplaceSourceBadge booking={ev} className="px-1.5 py-0.5 text-[8px]" />
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-brand-muted">
                        {ev.boatName && (
                          <span className="inline-flex items-center gap-1">
                            <Ship className="h-3.5 w-3.5" aria-hidden /> {ev.boatName}
                          </span>
                        )}
                        {ev.partySize != null && (
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" aria-hidden /> {ev.partySize} guests
                          </span>
                        )}
                        {ev.waiver?.status && (
                          <span className="inline-flex items-center gap-1">
                            <FileCheck className="h-3.5 w-3.5" aria-hidden /> Waiver{" "}
                            {captainWaiverLabel(ev.waiver.status).toLowerCase()}
                          </span>
                        )}
                      </p>
                      {pickup && (
                        <p className="mt-2 flex items-start gap-1.5 text-sm text-brand-dark">
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" aria-hidden />
                          {pickup}
                        </p>
                      )}
                      {latestOps && (
                        <p className="mt-2 whitespace-pre-wrap rounded-xl bg-brand-primary/10 px-3 py-2 text-sm text-brand-dark">
                          <span className="font-semibold text-brand-primary">
                            From {operatorNoteAuthorFirstName(latestOps)}
                            {opsLog.length > 1 ? ` · latest of ${opsLog.length}` : ""} ·{" "}
                          </span>
                          {latestOps.text}
                        </p>
                      )}
                    </button>
                    {ev.customer?.phone && (
                      <a
                        href={`tel:${ev.customer.phone}`}
                        className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white"
                      >
                        <Phone className="h-4 w-4" aria-hidden />
                        Call
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {attention.length > 0 && (
        <section className="overflow-hidden rounded-3xl border border-amber-200 bg-amber-50/60 shadow-sm">
          <div className="border-b border-amber-200/80 px-5 py-4">
            <h2 className="font-display text-lg font-bold text-brand-dark">Before you go</h2>
            <p className="mt-0.5 text-xs text-amber-900/70">Ops notes, guest requests, or waivers still open this week.</p>
          </div>
          <ul className="divide-y divide-amber-200/60">
            {attention.map((ev) => (
              <li key={ev.id}>
                <TripRow ev={ev} todayStr={todayStr} onOpen={setSelected} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="overflow-hidden rounded-3xl border border-brand-dark/10 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-dark/10 px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-bold text-brand-dark">Rest of this week</h2>
            <p className="mt-0.5 text-xs text-brand-muted">Tap a trip for the full briefing.</p>
          </div>
          <Link href="/admin/calendars" className="text-sm font-semibold text-brand-primary hover:underline">
            Full calendar →
          </Link>
        </div>
        {loading ? (
          <div className="space-y-3 p-5">
            {[1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-brand-bg" />
            ))}
          </div>
        ) : laterWeek.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-medium text-brand-dark">
              {weekTrips.length > 0 ? "That’s everything for this week." : "No more trips this week."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-brand-dark/5">
            {laterWeek.map((ev) => (
              <li key={ev.id}>
                <TripRow ev={ev} todayStr={todayStr} onOpen={setSelected} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <CaptainTripDetailDialog selected={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
