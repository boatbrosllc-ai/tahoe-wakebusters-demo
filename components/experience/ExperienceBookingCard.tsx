"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { HoldCountdown } from "@/components/booking/HoldCountdown";
import { formatBookingTimeFromIso, formatBookingDate } from "@/lib/booking/format-booking-datetime";
import { cn } from "@/lib/utils";

const SLOTS_POLL_MS = 60000;

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

function formatDate(iso: string) {
  return formatBookingDate(new Date(iso));
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

interface ExperienceBookingCardProps {
  experienceId: string;
  experienceName: string;
  slug: string;
  rates: RateDto[];
  addons: AddonDto[];
  maxGuests: number;
  petsMax: number;
  /** Pre-select this date when provided (e.g. from calendar section click). */
  initialDate?: string;
  className?: string;
}

export function ExperienceBookingCard({
  experienceId,
  experienceName,
  slug,
  rates,
  addons,
  maxGuests,
  petsMax,
  initialDate,
  className,
}: ExperienceBookingCardProps) {
  const [slots, setSlots] = useState<SlotDto[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SlotDto | null>(null);
  const [selectedRateId, setSelectedRateId] = useState<string | null>(rates[0]?.id ?? null);
  const [addonSelections, setAddonSelections] = useState<{ addonId: string; qty: number }[]>(
    addons.map((a) => ({ addonId: a.id, qty: 0 }))
  );
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "" });
  const [discountCode, setDiscountCode] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [cancellationAck, setCancellationAck] = useState(false);
  const [partySize, setPartySize] = useState(2);
  const [petsCount, setPetsCount] = useState(0);
  const [holdId, setHoldId] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [pricing, setPricing] = useState<{ totalCents: number; currency: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slotStolen, setSlotStolen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const dateRange = useMemo(() => getDateRange(60), []);

  const fetchSlots = useCallback(async () => {
    setSlotsLoading(true);
    setSlotStolen(false);
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
    if (initialDate) setSelectedDate(initialDate);
  }, [initialDate]);

  useEffect(() => {
    let t: ReturnType<typeof setInterval> | null = null;
    const schedule = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      t = setInterval(fetchSlots, SLOTS_POLL_MS);
    };
    schedule();
    const onVisibility = () => {
      if (t) clearInterval(t);
      t = null;
      if (!document.hidden) {
        fetchSlots();
        schedule();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (t) clearInterval(t);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchSlots]);

  const openSlotsByDate = useMemo(() => {
    const map = new Map<string, SlotDto[]>();
    for (const s of slots) {
      if (s.status !== "open") continue;
      const day = s.startAt.slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(s);
    }
    return map;
  }, [slots]);

  const selectedRate = useMemo(() => rates.find((r) => r.id === selectedRateId) ?? null, [rates, selectedRateId]);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim());
  const showEmailError = customer.email.length > 0 && !emailValid;
  const canProceed =
    selectedSlot &&
    selectedRateId &&
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
    if (!selectedSlot || !selectedRateId || !customer.name.trim() || !customer.email.trim() || !customer.phone.trim() || !cancellationAck) return;
    setError(null);
    setSubmitting(true);
    try {
      const createHoldRes = await fetch("/api/booking/create-hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experienceId,
          slotId: selectedSlot.id,
          rateId: selectedRateId,
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
        if (holdData.error?.toLowerCase().includes("no longer available")) setSlotStolen(true);
        return;
      }
      setHoldId(holdData.holdId);
      setHoldExpiresAt(holdData.expiresAt ?? null);
      setPricing(holdData.pricing ?? null);

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
      if (checkoutData.url) window.location.href = checkoutData.url;
      else setError("Checkout URL missing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const updateAddonQty = (addonId: string, qty: number) => {
    setAddonSelections((prev) => {
      const next = prev.map((s) => (s.addonId === addonId ? { ...s, qty } : s));
      if (!next.some((s) => s.addonId === addonId)) next.push({ addonId, qty });
      return next;
    });
  };

  const openDays = useMemo(() => new Set(openSlotsByDate.keys()), [openSlotsByDate]);
  const selectedDaySlots = selectedDate ? openSlotsByDate.get(selectedDate) ?? [] : [];
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const monthLabel = calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startPad = first.getDay();
    const daysInMonth = last.getDate();
    const totalCells = Math.ceil((startPad + daysInMonth) / 7) * 7;
    const cells: { dateStr: string; day: number; isCurrentMonth: boolean; isPast: boolean; isOpen: boolean; openCount: number }[] = [];
    for (let i = 0; i < startPad; i++) {
      const d = new Date(year, month, 1 - (startPad - i));
      const dateStr = d.toISOString().slice(0, 10);
      const openCount = openSlotsByDate.get(dateStr)?.length ?? 0;
      cells.push({
        dateStr,
        day: d.getDate(),
        isCurrentMonth: false,
        isPast: dateStr < todayStr,
        isOpen: openCount > 0,
        openCount,
      });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const openCount = openSlotsByDate.get(dateStr)?.length ?? 0;
      cells.push({
        dateStr,
        day,
        isCurrentMonth: true,
        isPast: dateStr < todayStr,
        isOpen: openDays.has(dateStr),
        openCount,
      });
    }
    const remaining = totalCells - cells.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      const dateStr = d.toISOString().slice(0, 10);
      const openCount = openSlotsByDate.get(dateStr)?.length ?? 0;
      cells.push({
        dateStr,
        day: d.getDate(),
        isCurrentMonth: false,
        isPast: true,
        isOpen: false,
        openCount,
      });
    }
    return cells;
  }, [calendarMonth, openDays, openSlotsByDate, todayStr]);

  const quickPickOptions = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const day = today.getDay();
    const satOffset = day === 0 ? 6 : 6 - day;
    const nextSat = new Date(today);
    nextSat.setDate(nextSat.getDate() + satOffset);
    const todayDs = today.toISOString().slice(0, 10);
    const tomorrowDs = tomorrow.toISOString().slice(0, 10);
    const satDs = nextSat.toISOString().slice(0, 10);
    const openToday = (openSlotsByDate.get(todayDs)?.length ?? 0) > 0;
    const openTomorrow = (openSlotsByDate.get(tomorrowDs)?.length ?? 0) > 0;
    const openSat = (openSlotsByDate.get(satDs)?.length ?? 0) > 0;
    return [
      { label: "Today", dateStr: todayDs, available: openToday },
      { label: "Tomorrow", dateStr: tomorrowDs, available: openTomorrow },
      { label: "Saturday", dateStr: satDs, available: openSat },
    ];
  }, [openSlotsByDate]);

  const goPrevMonth = () => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const goNextMonth = () => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  const goToToday = () => setCalendarMonth(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  return (
    <div className={cn("rounded-2xl border border-brand-dark/10 bg-white shadow-soft p-6", className)}>
      <h3 className="text-lg font-semibold text-brand-dark mb-1">Book this experience</h3>
      <p className="text-sm text-brand-muted mb-4">Pick a date and time, then your details. Your slot is held for 10 minutes at checkout.</p>

      {slotStolen && (
        <p className="mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
          That time was just booked—pick another.
        </p>
      )}
      {error && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">{error}</p>
      )}

      {/* Step 1: Date & time */}
      <div className="mb-4">
        <p className="text-sm font-medium text-brand-dark mb-2">1. When — pick a date</p>
        {!slotsLoading && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {quickPickOptions.map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => opt.available && (setSelectedDate(opt.dateStr), setSelectedSlot(null), setCalendarMonth(() => {
                  const d = new Date(opt.dateStr + "T12:00:00");
                  return new Date(d.getFullYear(), d.getMonth(), 1);
                }))}
                disabled={!opt.available}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  opt.available
                    ? "bg-brand-primary/15 text-brand-dark ring-1 ring-brand-primary/30 hover:bg-brand-primary/25"
                    : "cursor-not-allowed bg-brand-dark/5 text-brand-muted/60"
                )}
              >
                {opt.label}
              </button>
            ))}
            <button
              type="button"
              onClick={goToToday}
              className="rounded-full px-2.5 py-1 text-xs font-medium text-brand-muted hover:bg-brand-bg hover:text-brand-dark transition-colors"
            >
              Today
            </button>
          </div>
        )}
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-brand-muted">{monthLabel}</span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={goPrevMonth}
              className="rounded-lg p-1.5 text-brand-muted hover:bg-brand-bg hover:text-brand-dark transition-colors"
              aria-label="Previous month"
            >
              ←
            </button>
            <button
              type="button"
              onClick={goNextMonth}
              className="rounded-lg p-1.5 text-brand-muted hover:bg-brand-bg hover:text-brand-dark transition-colors"
              aria-label="Next month"
            >
              →
            </button>
          </div>
        </div>
        {slotsLoading ? (
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: 35 }, (_, i) => (
              <div key={i} className="h-9 animate-pulse rounded-lg bg-brand-dark/10" aria-hidden />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-0.5 text-center text-xs font-medium text-brand-muted mb-0.5">
              {(["S", "M", "T", "W", "T", "F", "S"] as const).map((label, i) => (
                <span key={`weekday-${i}`} className="py-1">{label}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {calendarDays.map((cell) => {
                const canSelect = cell.isCurrentMonth && cell.isOpen && !cell.isPast;
                const isToday = cell.dateStr === todayStr;
                return (
                  <button
                    key={cell.dateStr + cell.day}
                    type="button"
                    disabled={!canSelect}
                    onClick={() => canSelect && (setSelectedDate(cell.dateStr), setSelectedSlot(null))}
                    className={cn(
                      "relative flex flex-col items-center justify-center rounded-lg py-1.5 text-sm font-medium transition-colors",
                      !cell.isCurrentMonth && "text-brand-muted/50",
                      cell.isCurrentMonth && cell.isPast && "text-brand-muted/60",
                      cell.isCurrentMonth && !cell.isPast && !cell.isOpen && "text-brand-muted cursor-not-allowed",
                      canSelect && "hover:bg-brand-primary/15 text-brand-dark",
                      canSelect && selectedDate === cell.dateStr && "bg-brand-primary/20 text-brand-primary ring-1 ring-brand-primary",
                      isToday && cell.isCurrentMonth && "ring-2 ring-brand-primary ring-offset-1",
                      !canSelect && "cursor-default"
                    )}
                  >
                    {isToday && cell.isCurrentMonth && (
                      <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 rounded bg-brand-primary px-1 py-0.5 text-[9px] font-bold uppercase text-white">
                        Today
                      </span>
                    )}
                    <span className={cn(isToday && cell.isCurrentMonth && "mt-1.5")}>{cell.day}</span>
                    {canSelect && cell.openCount > 0 && (
                      <span className="text-[9px] font-semibold text-brand-primary/90">{cell.openCount}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Time */}
      {selectedDate && (
        <div className="mb-4">
          <p className="text-sm font-medium text-brand-dark mb-2">Pick a time</p>
          <div className="flex flex-wrap gap-2">
            {selectedDaySlots
              .filter((s) => !selectedRate || s.id.endsWith("-" + selectedRate.durationHours))
              .slice(0, 12)
              .map((slot) => (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => setSelectedSlot(slot)}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-sm font-medium",
                    selectedSlot?.id === slot.id
                      ? "border-brand-primary bg-brand-primary/15 text-brand-primary"
                      : "border-brand-dark/15 text-brand-dark hover:border-brand-primary/50"
                  )}
                >
                  {formatTime(slot.startAt)}
                </button>
              ))}
            {selectedDaySlots.length === 0 && !slotsLoading && (
              <p className="text-brand-muted text-sm">No slots for this duration on this day.</p>
            )}
          </div>
        </div>
      )}

      {/* Duration */}
      <div className="mb-4">
        <p className="text-sm font-medium text-brand-dark mb-2">Duration</p>
        <div className="flex flex-wrap gap-2">
          {rates.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelectedRateId(r.id)}
              className={cn(
                "rounded-xl border px-3 py-2 text-sm font-medium",
                selectedRateId === r.id
                  ? "border-brand-primary bg-brand-primary/15 text-brand-primary"
                  : "border-brand-dark/15 text-brand-dark"
              )}
            >
              {r.displayName} — ${(r.priceCents / 100).toFixed(0)}
            </button>
          ))}
        </div>
      </div>

      {/* Add-ons */}
      {addons.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-medium text-brand-muted mb-2">Add-ons (optional)</p>
          <ul className="space-y-2">
            {addons.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2">
                <span className="text-sm text-brand-dark">{a.name} — ${(a.priceCents / 100).toFixed(2)}</span>
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
                    <button
                      type="button"
                      onClick={() => updateAddonQty(a.id, Math.max(0, (addonSelections.find((s) => s.addonId === a.id)?.qty ?? 0) - 1))}
                      className="h-8 w-8 rounded-lg border border-brand-dark/20 text-brand-dark font-medium"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-sm">{(addonSelections.find((s) => s.addonId === a.id)?.qty ?? 0)}</span>
                    <button
                      type="button"
                      onClick={() =>
                        updateAddonQty(a.id, Math.min(a.maxQty ?? 99, (addonSelections.find((s) => s.addonId === a.id)?.qty ?? 0) + 1))
                      }
                      className="h-8 w-8 rounded-lg border border-brand-dark/20 text-brand-dark font-medium"
                    >
                      +
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Step 2: Your details */}
      <div className="space-y-3 mb-4">
        <p className="text-sm font-medium text-brand-dark">2. Your details</p>
        <input
          type="text"
          placeholder="Name"
          value={customer.name}
          onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))}
          className="w-full rounded-xl border border-brand-dark/15 px-4 py-3 text-brand-dark placeholder:text-brand-muted/70"
        />
        <div>
          <input
            type="email"
            placeholder="Email"
            value={customer.email}
            onChange={(e) => setCustomer((c) => ({ ...c, email: e.target.value }))}
            className={cn("w-full rounded-xl border px-4 py-3 text-brand-dark placeholder:text-brand-muted/70", showEmailError ? "border-red-500" : "border-brand-dark/15")}
          />
          {showEmailError && <p className="mt-1 text-sm text-red-600">Enter a valid email address</p>}
        </div>
        <input
          type="tel"
          placeholder="Phone"
          value={customer.phone}
          onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))}
          className="w-full rounded-xl border border-brand-dark/15 px-4 py-3 text-brand-dark placeholder:text-brand-muted/70"
        />
        <input
          type="text"
          placeholder="Discount code (optional)"
          value={discountCode}
          onChange={(e) => setDiscountCode(e.target.value)}
          className="w-full rounded-xl border border-brand-dark/15 px-4 py-3 text-brand-dark placeholder:text-brand-muted/70"
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="exp-booking-party-size" className="block text-xs text-brand-muted mb-1">Party size</label>
            <input
              id="exp-booking-party-size"
              type="number"
              min={1}
              max={maxGuests}
              value={partySize}
              onChange={(e) => setPartySize(Math.min(maxGuests, Math.max(1, parseInt(e.target.value, 10) || 1)))}
              className="w-full rounded-xl border border-brand-dark/15 px-4 py-2 text-brand-dark placeholder:text-brand-muted/70"
              placeholder="e.g. 4"
              aria-label="Party size"
            />
          </div>
          <div>
            <label htmlFor="exp-booking-pets" className="block text-xs text-brand-muted mb-1">Pets</label>
            <input
              id="exp-booking-pets"
              type="number"
              min={0}
              max={petsMax}
              value={petsCount}
              onChange={(e) => setPetsCount(Math.min(petsMax, Math.max(0, parseInt(e.target.value, 10) || 0)))}
              className="w-full rounded-xl border border-brand-dark/15 px-4 py-2 text-brand-dark placeholder:text-brand-muted/70"
              placeholder="e.g. 0"
              aria-label="Number of pets"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-brand-muted">
          <input type="checkbox" checked={marketingOptIn} onChange={(e) => setMarketingOptIn(e.target.checked)} className="rounded border-brand-dark/30 text-brand-primary" />
          Send me occasional offers
        </label>
        <label className="flex items-start gap-2 text-sm text-brand-dark">
          <input type="checkbox" checked={cancellationAck} onChange={(e) => setCancellationAck(e.target.checked)} className="mt-1 rounded border-brand-dark/30 text-brand-primary" />
          I agree to the cancellation policy
        </label>
      </div>

      {/* Live total */}
      <div className="border-t border-brand-dark/10 pt-4 mb-4">
        <div className="flex justify-between text-sm text-brand-dark">
          <span>Estimated total</span>
          <span className="font-semibold">${(orderSummaryTotalCents / 100).toFixed(2)} + tax at checkout</span>
        </div>
      </div>

      <Button
        size="lg"
        className="w-full rounded-xl"
        disabled={!canProceed || submitting}
        onClick={handleCreateHoldAndCheckout}
      >
        {submitting ? "Taking you to payment…" : "Continue to payment"}
      </Button>

      {holdExpiresAt && (
        <p className="mt-2 text-xs text-brand-muted text-center">
          <HoldCountdown expiresAt={holdExpiresAt} label="Your slot is held — complete payment in" compact />
        </p>
      )}
    </div>
  );
}
