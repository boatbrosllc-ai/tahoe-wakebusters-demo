"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { HoldCountdown } from "@/components/booking/HoldCountdown";
import { formatBookingTimeFromIso } from "@/lib/booking/format-booking-datetime";
import { cn } from "@/lib/utils";

type SlotStatus = "open" | "held" | "booked" | "blocked";

interface SlotDto {
  id: string;
  startAt: string;
  endAt: string;
  status: SlotStatus;
  holdId: string | null;
  bookingId: string | null;
  updatedAt: string | null;
}

interface RateDto {
  id: string;
  durationHours: number;
  priceCents: number;
  displayName: string;
}

interface AddonDto {
  id: string;
  name: string;
  priceCents: number;
  type: "toggle" | "quantity" | "tip";
  maxQty?: number;
}

function formatTime(iso: string) {
  return formatBookingTimeFromIso(iso);
}

function getDateRange(days: number): { start: string; end: string } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

interface ExperienceCalendarPageProps {
  experienceId: string;
  experienceName: string;
  slug: string;
  rates: RateDto[];
  addons: AddonDto[];
  maxGuests: number;
  petsMax: number;
  backHref: string;
  /** When user selected a boat for this experience, pass boatId so hold/booking use boat pricing */
  boatId?: string;
  boatName?: string;
}

export function ExperienceCalendarPage({
  experienceId,
  experienceName,
  slug,
  rates,
  addons,
  maxGuests,
  petsMax,
  backHref,
  boatId,
  boatName,
}: ExperienceCalendarPageProps) {
  const searchParams = useSearchParams();
  const urlDate = searchParams.get("date");
  const urlSlotId = searchParams.get("slotId");

  const dateRange = useMemo(() => getDateRange(60), []);
  const [slots, setSlots] = useState<SlotDto[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate)) {
      const d = new Date(urlDate + "T12:00:00");
      if (!Number.isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate) ? urlDate : null);
  const [selectedSlot, setSelectedSlot] = useState<SlotDto | null>(null);
  const [addonSelections, setAddonSelections] = useState<{ addonId: string; qty: number }[]>(
    addons.map((a) => ({ addonId: a.id, qty: 0 }))
  );
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "" });
  const [discountCode, setDiscountCode] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [cancellationAck, setCancellationAck] = useState(false);
  const [partySize, setPartySize] = useState(2);
  const [petsCount, setPetsCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSlots = useCallback(async () => {
    setSlotsLoading(true);
    try {
      const res = await fetch(
        `/api/booking/slots?experienceId=${encodeURIComponent(experienceId)}&startDate=${dateRange.start}&endDate=${dateRange.end}`
      );
      if (!res.ok) throw new Error("Failed to load slots");
      const data = await res.json();
      setSlots(data.slots ?? []);
    } finally {
      setSlotsLoading(false);
    }
  }, [experienceId, dateRange.start, dateRange.end]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  useEffect(() => {
    if (slotsLoading || !urlSlotId || slots.length === 0) return;
    const slot = slots.find((s) => s.id === urlSlotId && s.status === "open");
    if (slot) {
      setSelectedSlot(slot);
      const dateStr = slot.startAt.slice(0, 10);
      setSelectedDate(dateStr);
      const d = new Date(slot.startAt);
      setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }, [slotsLoading, slots, urlSlotId]);

  const openSlotsByDate = useMemo(() => {
    const map = new Map<string, SlotDto[]>();
    for (const s of slots) {
      if (s.status !== "open") continue;
      const day = s.startAt.slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(s);
    }
    map.forEach((arr) => arr.sort((a, b) => a.startAt.localeCompare(b.startAt)));
    return map;
  }, [slots]);

  const slotsByStatusByDate = useMemo(() => {
    const map = new Map<string, { open: SlotDto[]; held: SlotDto[]; booked: SlotDto[]; blocked: SlotDto[] }>();
    for (const s of slots) {
      const day = s.startAt.slice(0, 10);
      if (!map.has(day)) map.set(day, { open: [], held: [], booked: [], blocked: [] });
      const entry = map.get(day)!;
      if (s.status === "open") entry.open.push(s);
      else if (s.status === "held") entry.held.push(s);
      else if (s.status === "booked") entry.booked.push(s);
      else entry.blocked.push(s);
    }
    return map;
  }, [slots]);

  const selectedDaySlots = selectedDate ? openSlotsByDate.get(selectedDate) ?? [] : [];
  const selectedDayStatus = selectedDate ? slotsByStatusByDate.get(selectedDate) : null;
  const todayStr = new Date().toISOString().slice(0, 10);
  const monthLabel = calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  /** User came from listing with a pre-picked slot; show confirm & pay only, no big calendar */
  const fromListingWithSlot = Boolean(urlSlotId);
  const compactMode = fromListingWithSlot && !!selectedSlot;

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startPad = first.getDay();
    const daysInMonth = last.getDate();
    const totalCells = Math.ceil((startPad + daysInMonth) / 7) * 7;
    const cells: {
      dateStr: string;
      day: number;
      isCurrentMonth: boolean;
      isPast: boolean;
      openCount: number;
      bookedCount: number;
      openSlots: SlotDto[];
    }[] = [];
    for (let i = 0; i < startPad; i++) {
      const d = new Date(year, month, 1 - (startPad - i));
      const dateStr = d.toISOString().slice(0, 10);
      const entry = slotsByStatusByDate.get(dateStr);
      const openSlots = openSlotsByDate.get(dateStr) ?? [];
      cells.push({
        dateStr,
        day: d.getDate(),
        isCurrentMonth: false,
        isPast: dateStr < todayStr,
        openCount: entry?.open.length ?? 0,
        bookedCount: (entry?.booked.length ?? 0) + (entry?.held.length ?? 0) + (entry?.blocked.length ?? 0),
        openSlots,
      });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const entry = slotsByStatusByDate.get(dateStr);
      const openSlots = openSlotsByDate.get(dateStr) ?? [];
      cells.push({
        dateStr,
        day,
        isCurrentMonth: true,
        isPast: dateStr < todayStr,
        openCount: entry?.open.length ?? 0,
        bookedCount: (entry?.booked.length ?? 0) + (entry?.held.length ?? 0) + (entry?.blocked.length ?? 0),
        openSlots,
      });
    }
    const remaining = totalCells - cells.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      const dateStr = d.toISOString().slice(0, 10);
      const entry = slotsByStatusByDate.get(dateStr);
      const openSlots = openSlotsByDate.get(dateStr) ?? [];
      cells.push({
        dateStr,
        day: d.getDate(),
        isCurrentMonth: false,
        isPast: true,
        openCount: entry?.open.length ?? 0,
        bookedCount: (entry?.booked.length ?? 0) + (entry?.held.length ?? 0) + (entry?.blocked.length ?? 0),
        openSlots,
      });
    }
    return cells;
  }, [calendarMonth, slotsByStatusByDate, openSlotsByDate, todayStr]);

  const goPrevMonth = () => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const goNextMonth = () => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));

  const selectedDayOpenSlots = selectedDate ? (openSlotsByDate.get(selectedDate) ?? []) : [];

  const selectedRate = selectedSlot
    ? rates.find((r) => selectedSlot.id.endsWith("-" + r.durationHours)) ?? null
    : null;
  const rateIdForSlot = selectedSlot
    ? rates.find((r) => selectedSlot.id.endsWith("-" + r.durationHours))?.id ?? null
    : null;

  const updateAddonQty = (addonId: string, qty: number) => {
    setAddonSelections((prev) => {
      const next = prev.map((s) => (s.addonId === addonId ? { ...s, qty } : s));
      if (!next.some((s) => s.addonId === addonId)) next.push({ addonId, qty });
      return next;
    });
  };

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim());
  const showEmailError = customer.email.length > 0 && !emailValid;
  const canProceed =
    selectedSlot &&
    rateIdForSlot &&
    customer.name.trim() &&
    customer.email.trim() &&
    customer.phone.trim() &&
    emailValid &&
    cancellationAck &&
    partySize >= 1 &&
    partySize <= maxGuests &&
    petsCount <= petsMax;

  const addonsTotalCents = useMemo(
    () =>
      addonSelections.reduce((sum, s) => {
        const addon = addons.find((a) => a.id === s.addonId);
        return sum + (addon ? addon.priceCents * s.qty : 0);
      }, 0),
    [addons, addonSelections]
  );
  const orderSummaryTotalCents = selectedRate ? selectedRate.priceCents + addonsTotalCents : 0;

  const handleCreateHoldAndCheckout = async () => {
    if (!selectedSlot || !rateIdForSlot || !customer.name.trim() || !customer.email.trim() || !customer.phone.trim() || !cancellationAck) return;
    setError(null);
    setSubmitting(true);
    try {
      const createHoldRes = await fetch("/api/booking/create-hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experienceId,
          ...(boatId ? { boatId } : {}),
          slotId: selectedSlot.id,
          rateId: rateIdForSlot,
          addonSelections: addonSelections.filter((s) => s.qty > 0),
          partySize,
          petsCount,
          answers: {},
          customerDraft: { name: customer.name.trim(), email: customer.email.trim(), phone: customer.phone.trim() },
          marketingOptIn,
          ...(discountCode.trim() && { discountCode: discountCode.trim() }),
        }),
      });
      const holdData = await createHoldRes.json();
      if (!createHoldRes.ok) {
        setError(holdData.error ?? "Could not reserve slot");
        return;
      }
      setHoldExpiresAt(holdData.expiresAt ?? null);
      const checkoutRes = await fetch("/api/booking/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdId: holdData.holdId }),
      });
      const checkoutData = await checkoutRes.json();
      if (!checkoutRes.ok) {
        setError(checkoutData.error ?? "Could not start checkout");
        return;
      }
      if (checkoutData.url) {
        window.location.href = checkoutData.url;
      } else {
        setError("Checkout URL missing");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-brand-bg/30">
      <header className="sticky top-0 z-10 shrink-0 border-b border-brand-dark/10 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-full items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-4 min-w-0">
            <Link
              href={backHref}
              className="shrink-0 text-brand-primary font-medium text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded"
            >
              ← Back
            </Link>
            <h1 className="text-lg font-bold text-brand-dark truncate">Book: {boatName ?? experienceName}</h1>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col min-h-0 w-full">
        {slotsLoading ? (
          <div className="flex-1 flex items-center justify-center p-12 text-brand-muted">
            Loading calendar…
          </div>
        ) : compactMode ? (
          /* Confirm & pay only – user already picked time on listing */
          <div className="flex-1 flex flex-col items-center p-4 sm:p-6 overflow-y-auto">
            <div className="w-full max-w-md">
              <div className="rounded-xl border border-brand-dark/10 bg-white p-4 sm:p-6 shadow-soft">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-brand-dark">Your selection</h2>
                    <p className="text-sm text-brand-muted mt-0.5">
                      {selectedDate && new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                      {selectedSlot && ` at ${formatTime(selectedSlot.startAt)} — ${selectedRate?.displayName ?? ""}`}
                    </p>
                  </div>
                  <Link
                    href={`/experiences/${slug}/book`}
                    className="text-sm font-medium text-brand-primary hover:underline shrink-0"
                  >
                    Change date & time
                  </Link>
                </div>
                {selectedSlot && rateIdForSlot && (
                  <div className="border-t border-brand-dark/10 pt-6">
                    {error && (
                      <p className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
                    )}
                    <div className="space-y-3">
                      <input
                        type="text"
                        placeholder="Name"
                        value={customer.name}
                        onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))}
                        className="w-full rounded-xl border border-brand-dark/15 px-4 py-2 text-sm"
                      />
                      <div>
                        <input
                          type="email"
                          placeholder="Email"
                          value={customer.email}
                          onChange={(e) => setCustomer((c) => ({ ...c, email: e.target.value }))}
                          className={cn("w-full rounded-xl border px-4 py-2 text-sm", showEmailError && "border-red-500")}
                        />
                        {showEmailError && <p className="mt-1 text-xs text-red-600">Valid email required</p>}
                      </div>
                      <input
                        type="tel"
                        placeholder="Phone"
                        value={customer.phone}
                        onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))}
                        className="w-full rounded-xl border border-brand-dark/15 px-4 py-2 text-sm"
                      />
                      <input
                        type="text"
                        placeholder="Discount code (optional)"
                        value={discountCode}
                        onChange={(e) => setDiscountCode(e.target.value)}
                        className="w-full rounded-xl border border-brand-dark/15 px-4 py-2 text-sm"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label id="compact-party-label" className="block text-xs text-brand-muted mb-1">Party size</label>
                          <input
                            id="compact-party-size"
                            type="number"
                            min={1}
                            max={maxGuests}
                            value={partySize}
                            onChange={(e) => setPartySize(Math.min(maxGuests, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                            className="w-full rounded-xl border border-brand-dark/15 px-4 py-2 text-sm"
                            aria-labelledby="compact-party-label"
                          />
                        </div>
                        <div>
                          <label id="compact-pets-label" className="block text-xs text-brand-muted mb-1">Pets</label>
                          <input
                            id="compact-pets"
                            type="number"
                            min={0}
                            max={petsMax}
                            value={petsCount}
                            onChange={(e) => setPetsCount(Math.min(petsMax, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                            className="w-full rounded-xl border border-brand-dark/15 px-4 py-2 text-sm"
                            aria-labelledby="compact-pets-label"
                          />
                        </div>
                      </div>
                      {addons.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-brand-dark mb-1">Add-ons</p>
                          <ul className="space-y-1">
                            {addons.map((a) => (
                              <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                                <span>{a.name} — ${(a.priceCents / 100).toFixed(2)}</span>
                                {(a.type === "toggle" || a.type === "tip") ? (
                                  <input
                                    type="checkbox"
                                    checked={(addonSelections.find((s) => s.addonId === a.id)?.qty ?? 0) > 0}
                                    onChange={(e) => updateAddonQty(a.id, e.target.checked ? 1 : 0)}
                                    className="h-4 w-4 rounded border-brand-dark/30 text-brand-primary"
                                    aria-label={a.name}
                                  />
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <button type="button" onClick={() => updateAddonQty(a.id, Math.max(0, (addonSelections.find((s) => s.addonId === a.id)?.qty ?? 0) - 1))} className="w-7 h-7 rounded border text-brand-dark">−</button>
                                    <span className="w-5 text-center text-sm">{(addonSelections.find((s) => s.addonId === a.id)?.qty ?? 0)}</span>
                                    <button type="button" onClick={() => updateAddonQty(a.id, Math.min(a.maxQty ?? 99, (addonSelections.find((s) => s.addonId === a.id)?.qty ?? 0) + 1))} className="w-7 h-7 rounded border text-brand-dark">+</button>
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <label className="flex items-center gap-2 text-xs text-brand-muted">
                        <input type="checkbox" checked={cancellationAck} onChange={(e) => setCancellationAck(e.target.checked)} className="rounded border-brand-dark/30 text-brand-primary" />
                        I agree to the cancellation policy
                      </label>
                      <div className="flex justify-between text-sm text-brand-dark pt-2">
                        <span>Estimated total</span>
                        <span className="font-semibold">${(orderSummaryTotalCents / 100).toFixed(2)} + tax</span>
                      </div>
                      <Button
                        size="lg"
                        className="w-full rounded-xl"
                        disabled={!canProceed || submitting}
                        onClick={handleCreateHoldAndCheckout}
                      >
                        {submitting ? "Redirecting…" : "Book now"}
                      </Button>
                      {holdExpiresAt && submitting && (
                        <p className="text-xs text-brand-muted text-center pt-1">
                          <HoldCountdown expiresAt={holdExpiresAt} label="Complete payment in" compact />
                        </p>
                      )}
                      <Link
                        href={`/experiences/${slug}/book`}
                        className="block w-full text-center text-sm text-brand-muted hover:underline pt-1"
                      >
                        Change date & time
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col lg:flex-row min-h-0">
            {/* Full-size calendar – Google Calendar style */}
            <div className="flex-1 flex flex-col min-h-0 p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <h2 className="text-2xl font-bold text-brand-dark">{monthLabel}</h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                      setSelectedDate(todayStr);
                      setSelectedSlot(null);
                    }}
                    className="rounded-xl border border-brand-dark/15 bg-white px-3 py-2 text-sm font-medium text-brand-dark hover:bg-brand-bg transition-colors"
                  >
                    Today
                  </button>
                  <div className="flex rounded-xl border border-brand-dark/10 bg-brand-bg/50 p-0.5">
                    <button
                      type="button"
                      onClick={goPrevMonth}
                      className="rounded-lg p-2.5 text-brand-muted hover:bg-white hover:text-brand-dark hover:shadow-sm transition-all"
                      aria-label="Previous month"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      onClick={goNextMonth}
                      className="rounded-lg p-2.5 text-brand-muted hover:bg-white hover:text-brand-dark hover:shadow-sm transition-all"
                      aria-label="Next month"
                    >
                      →
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex-1 grid grid-cols-7 gap-px sm:gap-1 min-h-[320px] sm:min-h-[400px] lg:min-h-[480px] bg-brand-dark/10 rounded-xl overflow-hidden border border-brand-dark/10 bg-white shadow-soft">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d} className="py-2 px-1 text-center text-xs font-semibold uppercase text-brand-muted bg-brand-bg/50 sm:text-sm">
                    {d}
                  </div>
                ))}
                {calendarDays.map((cell) => {
                  const isSelected = selectedDate === cell.dateStr;
                  const hasOpen = cell.openCount > 0;
                  const hasBooked = cell.bookedCount > 0;
                  const isPast = cell.isPast;
                  const isClickable = cell.isCurrentMonth && (hasOpen || hasBooked) && !isPast;
                  return (
                    <button
                      key={cell.dateStr + cell.day}
                      type="button"
                      disabled={!isClickable}
                      onClick={() => isClickable && (setSelectedDate(cell.dateStr), setSelectedSlot(null))}
                      className={cn(
                        "flex flex-col items-stretch text-left p-1.5 sm:p-2 min-h-[64px] sm:min-h-[80px] lg:min-h-[100px] overflow-hidden rounded-lg transition-all",
                        !cell.isCurrentMonth && "text-brand-muted/50",
                        cell.isCurrentMonth && isPast && "text-brand-muted/60",
                        isClickable && "cursor-pointer hover:ring-2 hover:ring-brand-primary/30",
                        isSelected && "ring-2 ring-brand-primary ring-offset-1 bg-brand-primary/10",
                        hasOpen && cell.isCurrentMonth && !isPast && "bg-green-50/80 hover:bg-green-100 text-green-900",
                        hasBooked && !hasOpen && cell.isCurrentMonth && !isPast && "bg-brand-dark/5 text-brand-muted"
                      )}
                    >
                      <span className="text-sm font-semibold sm:text-base shrink-0">{cell.day}</span>
                      <div className="flex-1 min-h-0 mt-1 overflow-y-auto space-y-0.5">
                        {cell.openSlots.slice(0, 4).map((slot) => (
                          <div
                            key={slot.id}
                            className="text-[10px] sm:text-xs font-medium text-green-800 bg-green-200/60 rounded px-1 py-0.5 truncate"
                            title={`${formatTime(slot.startAt)} — ${rates.find((r) => slot.id.endsWith("-" + r.durationHours))?.displayName ?? ""}`}
                          >
                            {formatTime(slot.startAt)}
                          </div>
                        ))}
                        {cell.openSlots.length > 4 && (
                          <div className="text-[10px] text-brand-muted">+{cell.openSlots.length - 4} more</div>
                        )}
                        {cell.isCurrentMonth && !cell.isPast && cell.openSlots.length === 0 && cell.bookedCount > 0 && (
                          <div className="text-[10px] text-brand-muted">Booked</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-brand-muted">
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded bg-green-200 border border-green-300" aria-hidden />
                  Available (times in day)
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded bg-brand-dark/10" aria-hidden />
                  Booked
                </span>
              </div>
            </div>

            {/* Selected day: scrollable open times + booking form */}
            <div className="w-full lg:w-[380px] xl:w-[420px] shrink-0 border-t lg:border-t-0 lg:border-l border-brand-dark/10 bg-white flex flex-col min-h-0 max-h-[50vh] lg:max-h-none overflow-hidden">
              {selectedDate ? (
                <>
                  <div className="p-4 border-b border-brand-dark/10 shrink-0">
                    <h2 className="text-lg font-semibold text-brand-dark">
                      {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "short",
                        day: "numeric",
                      })}
                    </h2>
                    <p className="text-sm text-brand-muted mt-0.5">Scroll to see open times, then pick one to book.</p>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
                    {selectedDayOpenSlots.length > 0 ? (
                      selectedDayOpenSlots.map((slot) => {
                        const rate = rates.find((r) => slot.id.endsWith("-" + r.durationHours));
                        const isSlotSelected = selectedSlot?.id === slot.id;
                        return (
                          <button
                            key={slot.id}
                            type="button"
                            onClick={() => setSelectedSlot(slot)}
                            className={cn(
                              "w-full flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                              isSlotSelected
                                ? "border-brand-primary bg-brand-primary/10 ring-2 ring-brand-primary"
                                : "border-green-200 bg-green-50 hover:border-green-400 hover:bg-green-100"
                            )}
                          >
                            <span className="font-medium text-brand-dark">
                              {formatTime(slot.startAt)} — {rate?.displayName ?? ""}
                            </span>
                            <span className={cn(
                              "text-xs font-medium px-2 py-1 rounded-lg shrink-0",
                              isSlotSelected ? "bg-brand-primary text-white" : "bg-green-200 text-green-800"
                            )}>
                              {isSlotSelected ? "Selected" : "Select"}
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <p className="text-sm text-brand-muted">No open slots this day.</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="p-6 text-center text-brand-muted text-sm">
                  <p className="font-medium text-brand-dark">Click a date</p>
                  <p className="mt-1">Select a day on the calendar to see and scroll through open times.</p>
                </div>
              )}

              {/* Booking form when slot selected */}
              {selectedSlot && rateIdForSlot && (
                <div className="mt-6 border-t border-brand-dark/10 pt-6">
                  <h3 className="font-semibold text-brand-dark mb-2">
                    {formatTime(selectedSlot.startAt)} — {selectedRate?.displayName}
                  </h3>
                  {error && (
                    <p className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
                  )}
                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="Name"
                      value={customer.name}
                      onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))}
                      className="w-full rounded-xl border border-brand-dark/15 px-4 py-2 text-sm"
                    />
                    <div>
                      <input
                        type="email"
                        placeholder="Email"
                        value={customer.email}
                        onChange={(e) => setCustomer((c) => ({ ...c, email: e.target.value }))}
                        className={cn("w-full rounded-xl border px-4 py-2 text-sm", showEmailError && "border-red-500")}
                      />
                      {showEmailError && <p className="mt-1 text-xs text-red-600">Valid email required</p>}
                    </div>
                    <input
                      type="tel"
                      placeholder="Phone"
                      value={customer.phone}
                      onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))}
                      className="w-full rounded-xl border border-brand-dark/15 px-4 py-2 text-sm"
                    />
                    <input
                      type="text"
                      placeholder="Discount code (optional)"
                      value={discountCode}
                      onChange={(e) => setDiscountCode(e.target.value)}
                      className="w-full rounded-xl border border-brand-dark/15 px-4 py-2 text-sm"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label id="calendar-party-label" className="block text-xs text-brand-muted mb-1">Party size</label>
                        <input
                          id="calendar-party-size"
                          type="number"
                          min={1}
                          max={maxGuests}
                          value={partySize}
                          onChange={(e) => setPartySize(Math.min(maxGuests, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                          className="w-full rounded-xl border border-brand-dark/15 px-4 py-2 text-sm"
                          aria-labelledby="calendar-party-label"
                        />
                      </div>
                      <div>
                        <label id="calendar-pets-label" className="block text-xs text-brand-muted mb-1">Pets</label>
                        <input
                          id="calendar-pets"
                          type="number"
                          min={0}
                          max={petsMax}
                          value={petsCount}
                          onChange={(e) => setPetsCount(Math.min(petsMax, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                          className="w-full rounded-xl border border-brand-dark/15 px-4 py-2 text-sm"
                          aria-labelledby="calendar-pets-label"
                        />
                      </div>
                    </div>
                    {addons.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-brand-dark mb-1">Add-ons</p>
                        <ul className="space-y-1">
                          {addons.map((a) => (
                            <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                              <span>{a.name} — ${(a.priceCents / 100).toFixed(2)}</span>
                              {(a.type === "toggle" || a.type === "tip") ? (
                                <input
                                  type="checkbox"
                                  checked={(addonSelections.find((s) => s.addonId === a.id)?.qty ?? 0) > 0}
                                  onChange={(e) => updateAddonQty(a.id, e.target.checked ? 1 : 0)}
                                  className="h-4 w-4 rounded border-brand-dark/30 text-brand-primary"
                                  aria-label={a.name}
                                />
                              ) : (
                                <div className="flex items-center gap-1">
                                  <button type="button" onClick={() => updateAddonQty(a.id, Math.max(0, (addonSelections.find((s) => s.addonId === a.id)?.qty ?? 0) - 1))} className="w-7 h-7 rounded border text-brand-dark">−</button>
                                  <span className="w-5 text-center text-sm">{(addonSelections.find((s) => s.addonId === a.id)?.qty ?? 0)}</span>
                                  <button type="button" onClick={() => updateAddonQty(a.id, Math.min(a.maxQty ?? 99, (addonSelections.find((s) => s.addonId === a.id)?.qty ?? 0) + 1))} className="w-7 h-7 rounded border text-brand-dark">+</button>
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <label className="flex items-center gap-2 text-xs text-brand-muted">
                      <input type="checkbox" checked={cancellationAck} onChange={(e) => setCancellationAck(e.target.checked)} className="rounded border-brand-dark/30 text-brand-primary" />
                      I agree to the cancellation policy
                    </label>
                    <div className="flex justify-between text-sm text-brand-dark pt-2">
                      <span>Estimated total</span>
                      <span className="font-semibold">${(orderSummaryTotalCents / 100).toFixed(2)} + tax</span>
                    </div>
                    <Button
                      size="lg"
                      className="w-full rounded-xl"
                      disabled={!canProceed || submitting}
                      onClick={handleCreateHoldAndCheckout}
                    >
                      {submitting ? "Redirecting…" : "Book now"}
                    </Button>
                    {holdExpiresAt && submitting && (
                      <p className="text-xs text-brand-muted text-center pt-1">
                        <HoldCountdown expiresAt={holdExpiresAt} label="Complete payment in" compact />
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedSlot(null)}
                      className="w-full text-center text-sm text-brand-muted hover:underline"
                    >
                      Choose a different time
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
