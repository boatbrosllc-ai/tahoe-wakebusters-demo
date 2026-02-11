"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { HoldCountdown } from "@/components/booking/HoldCountdown";
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
  basePriceCents: number;
  displayName: string;
  active: boolean;
}

interface AddonDto {
  id: string;
  name: string;
  priceCents: number;
  type: "toggle" | "quantity";
  maxQty?: number;
  active: boolean;
}

interface BoatDetail {
  boat: { id: string; name: string; capacityMax: number; petsMax: number; cancellationPolicyText?: string };
  rates: RateDto[];
  addons: AddonDto[];
}

interface PricingDto {
  subtotalCents: number;
  taxCents: number;
  feesCents: number;
  totalCents: number;
  currency: string;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
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

export function BookingCalendar({ defaultBoatId }: { defaultBoatId?: string }) {
  const [boatId, setBoatId] = useState<string | null>(defaultBoatId ?? null);
  const [boats, setBoats] = useState<{ id: string; name: string }[]>([]);
  const [detail, setDetail] = useState<BoatDetail | null>(null);
  const [slots, setSlots] = useState<SlotDto[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SlotDto | null>(null);
  const [selectedRateId, setSelectedRateId] = useState<string | null>(null);
  const [addonSelections, setAddonSelections] = useState<{ addonId: string; qty: number }[]>([]);
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "" });
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [cancellationAck, setCancellationAck] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [holdId, setHoldId] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [pricing, setPricing] = useState<PricingDto | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [boatsError, setBoatsError] = useState<string | null>(null);
  const [boatsLoading, setBoatsLoading] = useState(true);

  const dateRange = useMemo(() => getDateRange(14), []);

  const fetchBoats = useCallback(async () => {
    setBoatsError(null);
    setBoatsLoading(true);
    try {
      const res = await fetch("/api/booking/boats");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBoatsError(data.detail ?? data.error ?? "Failed to load boats");
        setBoats([]);
        return;
      }
      setBoats(data.boats ?? []);
      if (data.boats?.length && !boatId) setBoatId(data.boats[0].id);
    } finally {
      setBoatsLoading(false);
    }
  }, [boatId]);

  const fetchDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/booking/boat/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setDetail(data);
    setSelectedRateId(data.rates?.[0]?.id ?? null);
    const initialAddons = (data.addons ?? []).map((a: AddonDto) => ({ addonId: a.id, qty: 0 }));
    setAddonSelections(initialAddons);
  }, []);

  const fetchSlots = useCallback(async (id: string) => {
    setSlotsLoading(true);
    try {
      const res = await fetch(
        `/api/booking/slots?boatId=${encodeURIComponent(id)}&startDate=${dateRange.start}&endDate=${dateRange.end}`
      );
      if (!res.ok) throw new Error("Failed to load slots");
      const data = await res.json();
      setSlots(data.slots ?? []);
    } finally {
      setSlotsLoading(false);
    }
  }, [dateRange.start, dateRange.end]);

  useEffect(() => {
    fetchBoats();
  }, [fetchBoats]);

  useEffect(() => {
    if (boatId) {
      fetchDetail(boatId);
      fetchSlots(boatId);
    } else {
      setDetail(null);
      setSlots([]);
    }
  }, [boatId, fetchDetail, fetchSlots]);

  useEffect(() => {
    if (!boatId) return;
    let t: ReturnType<typeof setInterval> | null = null;
    const schedule = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      t = setInterval(() => fetchSlots(boatId), SLOTS_POLL_MS);
    };
    schedule();
    const onVisibility = () => {
      if (t) clearInterval(t);
      t = null;
      if (!document.hidden) {
        fetchSlots(boatId);
        schedule();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (t) clearInterval(t);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [boatId, fetchSlots]);

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

  const selectedRate = useMemo(
    () => detail?.rates.find((r) => r.id === selectedRateId) ?? null,
    [detail, selectedRateId]
  );

  const [partySize, setPartySize] = useState(2);
  const [petsCount, setPetsCount] = useState(0);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim());
  const showEmailError = customer.email.length > 0 && !emailValid;

  const canProceedToCheckout =
    selectedSlot &&
    selectedRateId &&
    detail &&
    customer.name.trim() &&
    customer.email.trim() &&
    customer.phone.trim() &&
    emailValid &&
    cancellationAck &&
    partySize >= 1 &&
    partySize <= detail.boat.capacityMax &&
    petsCount <= detail.boat.petsMax;

  const currentStep = !boatId ? 1 : !selectedSlot ? 2 : !selectedRateId ? 3 : 4;
  const steps = [
    { num: 1, label: "Experience" },
    { num: 2, label: "Date & time" },
    { num: 3, label: "Options" },
    { num: 4, label: "Your details" },
  ];

  const addonsTotalCents = useMemo(() => {
    if (!detail) return 0;
    return addonSelections.reduce((sum, s) => {
      const addon = detail.addons.find((a) => a.id === s.addonId);
      return sum + (addon ? addon.priceCents * s.qty : 0);
    }, 0);
  }, [detail, addonSelections]);

  const orderSummaryTotalCents = selectedRate ? selectedRate.basePriceCents + addonsTotalCents : 0;

  const handleCreateHoldAndCheckout = async () => {
    if (!detail || !selectedSlot || !selectedRateId || !customer.name.trim() || !customer.email.trim() || !customer.phone.trim() || !cancellationAck) return;
    setError(null);
    setSubmitting(true);
    try {
      const createHoldRes = await fetch("/api/booking/create-hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boatId: detail.boat.id,
          slotId: selectedSlot.id,
          rateId: selectedRateId,
          addonSelections: addonSelections.filter((s) => s.qty > 0),
          partySize,
          petsCount,
          answers: {},
          customerDraft: { name: customer.name.trim(), email: customer.email.trim(), phone: customer.phone.trim() },
          marketingOptIn,
        }),
      });
      const holdData = await createHoldRes.json();
      if (!createHoldRes.ok) {
        setError(holdData.error ?? "Could not reserve slot");
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

  if (boatsError) {
    return (
      <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-8 sm:p-10 text-center shadow-soft">
        <p className="font-semibold text-red-800 text-lg">{boatsError}</p>
        <p className="mt-3 text-sm text-red-600 max-w-md mx-auto">
          Check Firebase config in .env.local or use FIREBASE_SERVICE_ACCOUNT_JSON_PATH. Then restart the dev server.
        </p>
      </div>
    );
  }
  if (boatsLoading) {
    return (
      <div className="rounded-2xl border border-brand-dark/10 bg-white p-12 text-center shadow-soft">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" aria-hidden />
        <p className="mt-4 text-brand-muted font-medium">Loading experiences…</p>
      </div>
    );
  }
  if (boats.length === 0) {
    return (
      <div className="rounded-2xl border border-brand-dark/10 bg-white p-8 sm:p-10 text-center shadow-soft">
        <p className="text-brand-dark font-semibold">No experiences available yet</p>
        <p className="mt-2 text-sm text-brand-muted">
          Seed the database with demo boats, rates, add-ons, and slots for the next 14 days.
        </p>
        <form
          action="/api/booking/seed"
          method="POST"
          className="mt-6"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const res = await fetch(form.action, { method: "POST" });
            if (res.ok) {
              await fetchBoats();
            } else {
              const data = await res.json().catch(() => ({}));
              setBoatsError(data.error ?? "Seed failed");
            }
          }}
        >
          <Button type="submit" size="lg">Seed demo data</Button>
        </form>
      </div>
    );
  }

  return (
    <div className="lg:grid lg:grid-cols-[1fr_340px] lg:gap-10 xl:gap-12">
      <div className="space-y-10">
        {/* Progress stepper */}
        <nav aria-label="Booking progress" className="flex items-center justify-center gap-1 sm:gap-2">
          {steps.map((s) => (
            <div key={s.num} className="flex items-center">
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors",
                  currentStep >= s.num ? "bg-brand-primary text-white" : "bg-brand-dark/10 text-brand-muted"
                )}
              >
                {s.num}
              </span>
              {s.num < 4 && <span className="mx-1 h-0.5 w-4 sm:w-6 bg-brand-dark/10 rounded" aria-hidden />}
            </div>
          ))}
        </nav>

        {/* 1. Experience */}
        <section className="rounded-2xl border border-brand-dark/10 bg-white p-6 shadow-soft">
          <h2 className="text-xl font-semibold text-brand-dark mb-4">Choose your experience</h2>
          <div className={cn("grid gap-3", boats.length <= 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")}>
            {boats.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  setBoatId(b.id);
                  setSelectedDate(null);
                  setSelectedSlot(null);
                }}
                className={cn(
                  "rounded-xl border-2 p-4 text-left transition-all duration-200",
                  boatId === b.id
                    ? "border-brand-primary bg-brand-primary/10 shadow-soft"
                    : "border-brand-dark/10 bg-white hover:border-brand-primary/40 hover:shadow-soft"
                )}
              >
                <span className="font-semibold text-brand-dark">{b.name}</span>
              </button>
            ))}
          </div>
        </section>

        {detail && (
          <>
            {/* 2. Date & time */}
            <section className="rounded-2xl border border-brand-dark/10 bg-white p-6 shadow-soft">
              <h2 className="text-xl font-semibold text-brand-dark mb-4">Date & time</h2>
              <p className="text-sm text-brand-muted mb-3">Available dates (next 14 days)</p>
              <div className="flex flex-wrap gap-2">
                {Array.from(openSlotsByDate.keys())
                  .sort()
                  .slice(0, 14)
                  .map((day) => {
                    const isToday = day === new Date().toISOString().slice(0, 10);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          setSelectedDate(day);
                          setSelectedSlot(null);
                        }}
                        className={cn(
                          "rounded-xl border-2 px-4 py-2.5 text-sm font-medium transition-all",
                          selectedDate === day
                            ? "border-brand-primary bg-brand-primary text-white"
                            : "border-brand-dark/15 bg-white text-brand-dark hover:border-brand-primary/50",
                          isToday && selectedDate !== day && "ring-1 ring-brand-primary/30"
                        )}
                      >
                        {formatDate(day + "T12:00:00")}
                        {isToday && <span className="ml-1 text-xs opacity-80">Today</span>}
                      </button>
                    );
                  })}
              </div>
              {slotsLoading && <p className="mt-3 text-sm text-brand-muted">Updating availability…</p>}
              {selectedDate && (
                <div className="mt-4 pt-4 border-t border-brand-dark/10">
                  <p className="text-sm font-medium text-brand-dark mb-2">Time slot</p>
                  <div className="flex flex-wrap gap-2">
                    {(openSlotsByDate.get(selectedDate) ?? []).map((slot) => (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() => setSelectedSlot(slot)}
                        className={cn(
                          "rounded-xl border-2 px-4 py-2 text-sm font-medium transition-all",
                          selectedSlot?.id === slot.id
                            ? "border-brand-primary bg-brand-primary text-white"
                            : "border-brand-dark/15 bg-white text-brand-dark hover:border-brand-primary/50"
                        )}
                      >
                        {formatTime(slot.startAt)} – {formatTime(slot.endAt)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {selectedSlot && (
              <>
                {/* 3. Duration & add-ons */}
                <section className="rounded-2xl border border-brand-dark/10 bg-white p-6 shadow-soft">
                  <h2 className="text-xl font-semibold text-brand-dark mb-4">Duration</h2>
                  <div className="flex flex-wrap gap-2">
                    {detail.rates.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedRateId(r.id)}
                        className={cn(
                          "rounded-xl border-2 px-4 py-3 text-sm font-medium transition-all min-w-[120px]",
                          selectedRateId === r.id
                            ? "border-brand-primary bg-brand-primary text-white"
                            : "border-brand-dark/15 bg-white text-brand-dark hover:border-brand-primary/50"
                        )}
                      >
                        <span className="block">{r.displayName}</span>
                        <span className="font-semibold">${(r.basePriceCents / 100).toFixed(0)}</span>
                      </button>
                    ))}
                  </div>
                  {detail.addons.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-brand-dark/10">
                      <h3 className="text-base font-semibold text-brand-dark mb-3">Add-ons</h3>
                      <ul className="space-y-3">
                        {detail.addons.map((addon) => (
                          <li key={addon.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-dark/10 bg-brand-bg/30 px-4 py-3">
                            <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                              <input
                                type="checkbox"
                                checked={(addonSelections.find((s) => s.addonId === addon.id)?.qty ?? 0) > 0}
                                onChange={(e) => updateAddonQty(addon.id, e.target.checked ? 1 : 0)}
                                className="h-4 w-4 rounded border-brand-dark/30 text-brand-primary focus:ring-brand-primary"
                              />
                              <span className="font-medium text-brand-dark">{addon.name}</span>
                              <span className="text-brand-muted">+${(addon.priceCents / 100).toFixed(2)}</span>
                            </label>
                            {addon.type === "quantity" && (addonSelections.find((s) => s.addonId === addon.id)?.qty ?? 0) > 0 && (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => updateAddonQty(addon.id, Math.max(0, (addonSelections.find((s) => s.addonId === addon.id)?.qty ?? 0) - 1))}
                                  className="h-8 w-8 rounded-lg border border-brand-dark/20 bg-white text-brand-dark font-medium hover:bg-brand-bg"
                                  aria-label={`Less ${addon.name}`}
                                >
                                  −
                                </button>
                                <input
                                  type="number"
                                  min={0}
                                  max={addon.maxQty ?? 10}
                                  value={addonSelections.find((s) => s.addonId === addon.id)?.qty ?? 0}
                                  onChange={(e) => updateAddonQty(addon.id, Math.min(addon.maxQty ?? 10, parseInt(e.target.value, 10) || 0))}
                                  className="w-12 rounded-lg border border-brand-dark/15 px-2 py-1 text-center text-sm"
                                  aria-label={`Quantity for ${addon.name}`}
                                />
                                <button
                                  type="button"
                                  onClick={() => updateAddonQty(addon.id, Math.min(addon.maxQty ?? 10, (addonSelections.find((s) => s.addonId === addon.id)?.qty ?? 0) + 1))}
                                  className="h-8 w-8 rounded-lg border border-brand-dark/20 bg-white text-brand-dark font-medium hover:bg-brand-bg"
                                  aria-label={`More ${addon.name}`}
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
                </section>

                {/* 4. Your details */}
                <section className="rounded-2xl border border-brand-dark/10 bg-white p-6 shadow-soft">
                  <h2 className="text-xl font-semibold text-brand-dark mb-4">Your details</h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="mb-1.5 block text-sm font-medium text-brand-dark">Full name</label>
                      <input
                        type="text"
                        value={customer.name}
                        onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))}
                        className="w-full rounded-xl border border-brand-dark/15 bg-white px-4 py-3 text-brand-dark placeholder:text-brand-muted/70 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                        placeholder="Full name"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-brand-dark">Email</label>
                      <input
                        type="email"
                        value={customer.email}
                        onChange={(e) => setCustomer((c) => ({ ...c, email: e.target.value }))}
                        className={cn(
                          "w-full rounded-xl border bg-white px-4 py-3 text-brand-dark placeholder:text-brand-muted/70 focus:ring-2",
                          showEmailError ? "border-red-400 focus:border-red-400 focus:ring-red-400/20" : "border-brand-dark/15 focus:border-brand-primary focus:ring-brand-primary/20"
                        )}
                        placeholder="you@example.com"
                      />
                      {showEmailError && <p className="mt-1 text-sm text-red-600">Enter a valid email address</p>}
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-brand-dark">Phone</label>
                      <input
                        type="tel"
                        value={customer.phone}
                        onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))}
                        className="w-full rounded-xl border border-brand-dark/15 bg-white px-4 py-3 text-brand-dark placeholder:text-brand-muted/70 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                        placeholder="(512) 555-0123"
                      />
                    </div>
                    <div>
                      <label htmlFor="booking-party-size" className="mb-1.5 block text-sm font-medium text-brand-dark">Party size</label>
                      <input
                        id="booking-party-size"
                        type="number"
                        min={1}
                        max={detail.boat.capacityMax}
                        value={partySize}
                        onChange={(e) => setPartySize(Math.min(detail.boat.capacityMax, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                        className="w-full rounded-xl border border-brand-dark/15 bg-white px-4 py-3 text-brand-dark placeholder:text-brand-muted/70 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                        placeholder="e.g. 4"
                        aria-label="Party size"
                      />
                      <p className="mt-1 text-xs text-brand-muted">Max {detail.boat.capacityMax}</p>
                    </div>
                    <div>
                      <label htmlFor="booking-pets" className="mb-1.5 block text-sm font-medium text-brand-dark">Pets</label>
                      <input
                        id="booking-pets"
                        type="number"
                        min={0}
                        max={detail.boat.petsMax}
                        value={petsCount}
                        onChange={(e) => setPetsCount(Math.min(detail.boat.petsMax, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                        className="w-full rounded-xl border border-brand-dark/15 bg-white px-4 py-3 text-brand-dark placeholder:text-brand-muted/70 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                        placeholder="e.g. 0"
                        aria-label="Number of pets"
                      />
                      <p className="mt-1 text-xs text-brand-muted">Max {detail.boat.petsMax}</p>
                    </div>
                  </div>
                  <label className="mt-4 flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={marketingOptIn}
                      onChange={(e) => setMarketingOptIn(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-brand-dark/30 text-brand-primary focus:ring-brand-primary"
                    />
                    <span className="text-sm text-brand-muted">Send me occasional offers and updates</span>
                  </label>
                  <label className="mt-3 flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cancellationAck}
                      onChange={(e) => setCancellationAck(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-brand-dark/30 text-brand-primary focus:ring-brand-primary"
                    />
                    <span className="text-sm text-brand-dark">
                      I agree to the cancellation policy: {detail.boat.cancellationPolicyText || "Cancel 24h before for full refund."}
                    </span>
                  </label>
                  {error && (
                    <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
                      {error}
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </div>

      {/* Sticky order summary */}
      <div className="mt-10 lg:mt-0">
        <div className="lg:sticky lg:top-8 rounded-2xl border border-brand-dark/10 bg-white p-6 shadow-soft-lg">
          <h3 className="text-lg font-semibold text-brand-dark mb-4">Your booking</h3>
          {boatId && detail && (
            <ul className="space-y-2 text-sm text-brand-dark">
              <li><span className="text-brand-muted">Experience:</span> {boats.find((b) => b.id === boatId)?.name}</li>
              {selectedDate && <li><span className="text-brand-muted">Date:</span> {formatDate(selectedDate + "T12:00:00")}</li>}
              {selectedSlot && <li><span className="text-brand-muted">Time:</span> {formatTime(selectedSlot.startAt)} – {formatTime(selectedSlot.endAt)}</li>}
              {selectedRate && <li><span className="text-brand-muted">Duration:</span> {selectedRate.displayName}</li>}
              {addonSelections.some((s) => s.qty > 0) && (
                <li>
                  <span className="text-brand-muted">Add-ons:</span>{" "}
                  {detail.addons
                    .filter((a) => (addonSelections.find((s) => s.addonId === a.id)?.qty ?? 0) > 0)
                    .map((a) => `${a.name} × ${addonSelections.find((s) => s.addonId === a.id)?.qty ?? 0}`)
                    .join(", ")}
                </li>
              )}
              <li><span className="text-brand-muted">Party:</span> {partySize} {petsCount > 0 && `, ${petsCount} pet(s)`}</li>
            </ul>
          )}
          {orderSummaryTotalCents > 0 && (
            <p className="mt-4 pt-4 border-t border-brand-dark/10 text-xl font-bold text-brand-dark">
              ${(orderSummaryTotalCents / 100).toFixed(2)} <span className="text-sm font-normal text-brand-muted">+ tax at checkout</span>
            </p>
          )}
          {holdExpiresAt && (
            <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              <HoldCountdown expiresAt={holdExpiresAt} label="Slot held — complete payment in" compact />
            </p>
          )}
          <Button
            size="lg"
            className="w-full mt-6"
            disabled={!canProceedToCheckout || submitting}
            onClick={handleCreateHoldAndCheckout}
          >
            {submitting ? "Redirecting to checkout…" : "Continue to payment"}
          </Button>
        </div>
      </div>
    </div>
  );
}
