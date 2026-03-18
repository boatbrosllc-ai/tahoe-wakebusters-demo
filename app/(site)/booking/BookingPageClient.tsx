"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import * as bookingCache from "@/lib/booking/booking-data-cache";
import {
  getChicagoToday,
  getDaysInMonth,
  getMonthRangeWithAdjacent,
} from "@/lib/booking/booking-date-range";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useBookingModal } from "@/components/site/BookingModalContext";
import { formatExperiencePriceLabel } from "@/content/experiences";
import { isoToChicagoDateStr } from "@/lib/booking/format-booking-datetime";
import { cn } from "@/lib/utils";
import { bookingDebugLog } from "@/lib/booking/debug";

interface ExperienceItem {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  heroMedia: { type: "image" | "video"; url: string };
  maxGuests: number;
  petsMax: number;
  fromPriceCents: number | null;
  active: boolean;
}

interface BoatOption {
  id: string;
  name: string;
  photos: string[];
  fromPriceCents: number | null;
  rates: { id: string; durationHours: number; displayName: string; priceCents: number }[];
}

interface InitialSelection {
  /** experienceId or slug emitted by BookingCTA / ExperienceBookPage / LegacyBookPage */
  experience?: string;
  boatId?: string;
  date?: string;
}

/** Initial display month (current month in America/Chicago). */
function getInitialDisplayMonth(): { year: number; month: number } {
  const today = getChicagoToday();
  const [y, m] = today.split("-").map(Number);
  return { year: y, month: m - 1 };
}

export function BookingPageClient({ initialSelection }: { initialSelection?: InitialSelection }) {
  const { openWithSelection } = useBookingModal();
  const [experiences, setExperiences] = useState<ExperienceItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);

  const [selectedExperience, setSelectedExperience] = useState<ExperienceItem | null>(null);
  const [boats, setBoats] = useState<BoatOption[]>([]);
  const [boatsLoading, setBoatsLoading] = useState(false);
  const [selectedBoat, setSelectedBoat] = useState<BoatOption | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // One-shot initialization from deep-link params. Cleared after first boats load so user
  // edits (e.g. switching experience) don't re-trigger auto-selection.
  const initRef = useRef<InitialSelection | null>(
    initialSelection?.experience || initialSelection?.boatId || initialSelection?.date
      ? { ...initialSelection }
      : null
  );
  const [initDone, setInitDone] = useState(false);

  // Refs for scrolling to the first incomplete step after initialization.
  const boatsSectionRef = useRef<HTMLElement | null>(null);
  const dateSectionRef = useRef<HTMLElement | null>(null);
  const continueSectionRef = useRef<HTMLDivElement | null>(null);

  // Month-based date browsing (current month + prev/next navigation).
  const [displayMonth, setDisplayMonth] = useState(getInitialDisplayMonth);

  // null = not yet fetched; array = fetched (may be empty if no open slots)
  const [allSlots, setAllSlots] = useState<bookingCache.CachedSlotDto[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsLoadError, setSlotsLoadError] = useState<string | null>(null);
  const [slotsPartialData, setSlotsPartialData] = useState(false);
  const slotsRequestRangeRef = useRef<{ start: string; end: string } | null>(null);
  const [slotsRetryTrigger, setSlotsRetryTrigger] = useState(0);
  const lastSlotsRetryForRef = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    bookingCache.fetchExperiences(controller.signal)
      .then((data) => {
        if (data.experiences?.length) {
          setExperiences(data.experiences);
          // Apply deep-link experience preselection (match by id or slug).
          if (initRef.current?.experience) {
            const target = initRef.current.experience;
            const match = data.experiences.find(
              (exp) => exp.id === target || exp.slug === target
            );
            if (match) setSelectedExperience(match);
          }
        } else {
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === "AbortError") return;
        setExperiences([]);
        const apiBody = (err as { apiBody?: { error?: string; hint?: string } })?.apiBody;
        const msg = apiBody?.error ?? (err instanceof Error ? err.message : "Failed to load");
        setError(apiBody?.hint ? `${msg}. ${apiBody.hint}` : msg);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [retryTrigger]);

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    setRetryTrigger((t) => t + 1);
  };

  useEffect(() => {
    if (!selectedExperience) {
      setBoats([]);
      setSelectedBoat(null);
      return;
    }
    setBoatsLoading(true);
    setSelectedBoat(null);
    setSelectedDate(null);
    const controller = new AbortController();
    bookingCache.fetchBoats(selectedExperience.id, controller.signal)
      .then((data) => {
        const boatList = data.boats && Array.isArray(data.boats) ? (data.boats as BoatOption[]) : [];
        setBoats(boatList);
        // Single boat: auto-assign so we don't force the user to "select" the only option.
        if (boatList.length === 1) {
          setSelectedBoat(boatList[0]);
        }
        // Apply one-shot deep-link preselection for boat and date.
        // initRef is cleared after the first run so user edits don't re-trigger auto-selection.
        if (initRef.current) {
          if (initRef.current.boatId && boatList.length > 0) {
            const match = boatList.find((b) => b.id === initRef.current!.boatId);
            if (match) setSelectedBoat(match);
          }
          if (initRef.current.date) {
            // The availableDateSet effect will validate and clear this if the date is unavailable.
            setSelectedDate(initRef.current.date);
          }
          initRef.current = null;
          setInitDone(true);
        }
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name !== "AbortError") setBoats([]);
        initRef.current = null;
      })
      .finally(() => setBoatsLoading(false));
    return () => controller.abort();
  }, [selectedExperience]);

  // Date options for the currently visible month (month-based pagination).
  const dateOptions = useMemo(
    () => getDaysInMonth(displayMonth.year, displayMonth.month),
    [displayMonth.year, displayMonth.month]
  );

  // Fetch slots for the visible month + adjacent months so prev/next nav has data.
  useEffect(() => {
    if (!selectedExperience) {
      setAllSlots(null);
      setSlotsPartialData(false);
      return;
    }
    const { start: startDate, end: endDate } = getMonthRangeWithAdjacent(
      displayMonth.year,
      displayMonth.month
    );
    const rangeKey = `${startDate}|${endDate}`;
    if (slotsRequestRangeRef.current?.start !== startDate || slotsRequestRangeRef.current?.end !== endDate) {
      lastSlotsRetryForRef.current = null;
    }
    slotsRequestRangeRef.current = { start: startDate, end: endDate };
    bookingDebugLog("BookingPageClient", "slots fetch start", { experienceId: selectedExperience.id, startDate, endDate });
    setSlotsLoading(true);
    setAllSlots(null);
    setSlotsLoadError(null);
    const controller = new AbortController();
    bookingCache.fetchSlots(selectedExperience.id, startDate, endDate, controller.signal)
      .then((data) => {
        if (slotsRequestRangeRef.current?.start !== startDate || slotsRequestRangeRef.current?.end !== endDate) return;
        const slots = Array.isArray(data.slots) ? data.slots : [];
        bookingDebugLog("BookingPageClient", "slots fetch success", { slotCount: slots.length, startDate, endDate });
        setAllSlots(slots);
        setSlotsLoadError(null);
        setSlotsPartialData(Boolean((data as { partialData?: boolean })?.partialData));
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === "AbortError") return;
        const apiBody = (err as { apiBody?: { error?: string; hint?: string } })?.apiBody;
        const status = (err as { status?: number }).status;
        console.warn("[booking] slots fetch failed (BookingPageClient)", { startDate, endDate, status, error: apiBody?.error, hint: apiBody?.hint });
        bookingDebugLog("BookingPageClient", "slots fetch failed", { error: apiBody?.error, hint: apiBody?.hint });
        setAllSlots([]);
        const msg = apiBody?.error ?? (err instanceof Error ? err.message : "Unable to load availability");
        setSlotsLoadError(apiBody?.hint ? `${msg}. ${apiBody.hint}` : msg);
        if (lastSlotsRetryForRef.current !== rangeKey) {
          lastSlotsRetryForRef.current = rangeKey;
          setTimeout(() => setSlotsRetryTrigger((t) => t + 1), 1500);
        }
      })
      .finally(() => {
        if (slotsRequestRangeRef.current?.start === startDate && slotsRequestRangeRef.current?.end === endDate) setSlotsLoading(false);
      });
    return () => controller.abort();
  }, [selectedExperience, displayMonth.year, displayMonth.month, slotsRetryTrigger]);

  // Derive available dates in-memory from the cached slot dataset.
  // Switching boats re-derives this set without any API call.
  const availableDateSet = useMemo<Set<string> | null>(() => {
    if (allSlots === null) return null;
    const available = new Set<string>();
    for (const slot of allSlots) {
      if (slot.status !== "open") continue;
      if (typeof (slot as { spotsRemaining?: number }).spotsRemaining === "number" && (slot as { spotsRemaining: number }).spotsRemaining === 0) continue;
      if (selectedBoat && slot.boatId !== selectedBoat.id) continue;
      const dateStr: string = slot.dateStr ?? (slot.startAt ? isoToChicagoDateStr(slot.startAt) : "");
      if (dateStr) available.add(dateStr);
    }
    return available;
  }, [allSlots, selectedBoat]);

  // Clear a previously-selected date if it is no longer available for the current boat.
  useEffect(() => {
    if (availableDateSet !== null) {
      setSelectedDate((prev) => (prev && !availableDateSet.has(prev) ? null : prev));
    }
  }, [availableDateSet]);

  const todayChicago = getChicagoToday();
  const currentYear = parseInt(todayChicago.slice(0, 4), 10);
  const currentMonth = parseInt(todayChicago.slice(5, 7), 10) - 1; // 0-indexed
  const isAtCurrentMonth = displayMonth.year === currentYear && displayMonth.month === currentMonth;
  const useExperiencePicker = experiences != null && experiences.length > 0;

  const canContinue =
    selectedExperience && !boatsLoading && (selectedBoat || boats.length === 0) && selectedDate;

  const handleContinueToCheckout = () => {
    if (!canContinue || !selectedExperience) return;
    openWithSelection({
      experienceId: selectedExperience.id,
      experienceSlug: selectedExperience.slug,
      boatId: selectedBoat?.id,
      date: selectedDate ?? undefined,
    });
  };

  // After deep-link initialization completes and slots finish loading, scroll to the first
  // incomplete step. scrolledRef ensures this fires at most once per page load.
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (!initDone || slotsLoading || scrolledRef.current) return;
    scrolledRef.current = true;
    const timer = setTimeout(() => {
      if (selectedExperience && boats.length > 1 && !selectedBoat) {
        boatsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (selectedExperience && (boats.length === 0 || boats.length === 1 || selectedBoat) && !selectedDate) {
        dateSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (canContinue) {
        continueSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }, 150);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initDone, slotsLoading]);

  return (
    <div className="section-padding">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
        <header className="text-center mb-8 sm:mb-10">
          <Link
            href="/experiences"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-muted hover:text-brand-primary mb-4 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Back to experiences
          </Link>
          <h1 className="text-3xl sm:text-4xl font-bold text-brand-dark tracking-tight mb-2">
            Book your experience
          </h1>
          <p className="text-sm text-brand-muted">
            Pick a category, boat, and date — then choose your time and checkout.
          </p>
        </header>

        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-4">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" aria-hidden />
            <p className="text-brand-muted text-sm">Loading…</p>
          </div>
        ) : useExperiencePicker ? (
          <div className="space-y-8 sm:space-y-10">
            {/* 1. Categories – 2x2 squares */}
            <section>
              <h2 className="text-sm font-semibold text-brand-dark uppercase tracking-wider mb-3">
                Category
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {experiences!.map((exp) => {
                  const isSelected = selectedExperience?.id === exp.id;
                  const hasImage = exp.heroMedia?.url && exp.heroMedia.type === "image";
                  return (
                    <button
                      key={exp.id}
                      type="button"
                      onClick={() => setSelectedExperience(exp)}
                      className={cn(
                        "relative flex flex-col overflow-hidden rounded-xl border-2 aspect-square transition-all",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2",
                        isSelected
                          ? "border-brand-primary ring-2 ring-brand-primary/30"
                          : "border-brand-dark/15 hover:border-brand-dark/30"
                      )}
                    >
                      <div className="absolute inset-0 bg-brand-dark/5">
                        {hasImage ? (
                          <Image
                            src={exp.heroMedia.url}
                            alt=""
                            fill
                            className="object-cover"
                            sizes="(max-width: 640px) 50vw, 240px"
                          />
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/15 to-brand-dark/10" />
                        )}
                      </div>
                      <div className="relative flex flex-1 flex-col justify-end p-3 sm:p-4 bg-gradient-to-t from-black/70 via-black/20 to-transparent">
                        <span className="text-sm font-semibold text-white drop-shadow-sm">{exp.title}</span>
                        {exp.fromPriceCents != null && (
                          <span className="text-xs text-white/90 mt-0.5">
                            {formatExperiencePriceLabel(exp.slug, exp.fromPriceCents)}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 2. Select your boat – only when category selected and more than one boat (single boat is auto-assigned) */}
            {selectedExperience && boats.length > 1 && (
              <section ref={boatsSectionRef}>
                <h2 className="text-sm font-semibold text-brand-dark uppercase tracking-wider mb-3">
                  Select your boat
                </h2>
                {boatsLoading ? (
                  <p className="text-brand-muted text-sm py-2">Loading boats…</p>
                ) : boats.length === 0 ? (
                  <p className="text-brand-muted text-sm py-2">
                    No boats assigned — you can still pick a date and use experience pricing.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-4">
                    {boats.map((boat) => {
                      const isSelected = selectedBoat?.id === boat.id;
                      const thumb = boat.photos?.[0];
                      return (
                        <button
                          key={boat.id}
                          type="button"
                          onClick={() => setSelectedBoat(boat)}
                          className={cn(
                            "inline-flex items-center gap-4 rounded-xl border-2 px-4 py-4 sm:px-5 sm:py-5 text-left transition-all min-w-0",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2",
                            isSelected
                              ? "border-brand-primary bg-brand-primary/10 text-brand-dark font-semibold"
                              : "border-brand-dark/15 bg-white text-brand-dark hover:border-brand-dark/30"
                          )}
                        >
                          {thumb ? (
                            <span className="relative h-14 w-20 sm:h-16 sm:w-24 shrink-0 block overflow-hidden rounded-lg bg-brand-dark/5">
                              <Image src={thumb} alt="" width={96} height={64} className="object-cover h-full w-full" />
                            </span>
                          ) : (
                            <span className="h-14 w-20 sm:h-16 sm:w-24 shrink-0 rounded-lg bg-brand-dark/10" aria-hidden />
                          )}
                          <span className="text-base sm:text-lg font-medium truncate">{boat.name}</span>
                          {boat.fromPriceCents != null && (
                            <span className="text-sm text-brand-muted shrink-0 font-medium">${(boat.fromPriceCents / 100).toFixed(0)}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* 3. Select your date – when boat selected, no boats, or single boat (auto-assigned) */}
            {selectedExperience && (boats.length === 0 || boats.length === 1 || selectedBoat) && (
              <section ref={dateSectionRef}>
                <h2 className="text-sm font-semibold text-brand-dark uppercase tracking-wider mb-3">
                  Select your date
                </h2>
                <div className="flex items-center justify-between mb-3">
                  <button
                    type="button"
                    onClick={() =>
                      setDisplayMonth((prev) =>
                        prev.month === 0
                          ? { year: prev.year - 1, month: 11 }
                          : { year: prev.year, month: prev.month - 1 }
                      )
                    }
                    disabled={isAtCurrentMonth}
                    className={cn(
                      "rounded-lg p-2 transition-colors",
                      isAtCurrentMonth ? "opacity-40 cursor-not-allowed" : "text-brand-muted hover:bg-brand-dark/5 hover:text-brand-dark"
                    )}
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="h-5 w-5" aria-hidden />
                  </button>
                  <p className="text-sm font-semibold text-brand-dark">
                    {new Date(displayMonth.year, displayMonth.month, 1).toLocaleDateString("en-US", {
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setDisplayMonth((prev) =>
                        prev.month === 11
                          ? { year: prev.year + 1, month: 0 }
                          : { year: prev.year, month: prev.month + 1 }
                      )
                    }
                    className="rounded-lg p-2 text-brand-muted hover:bg-brand-dark/5 hover:text-brand-dark transition-colors"
                    aria-label="Next month"
                  >
                    <ChevronRight className="h-5 w-5" aria-hidden />
                  </button>
                </div>
                {slotsPartialData && (
                  <p className="text-sm text-amber-700 py-2 px-2 mb-2 rounded bg-amber-50 border border-amber-200" role="alert">
                    Availability may be incomplete — refresh or contact us to confirm.
                  </p>
                )}
                {slotsLoadError ? (
                  <p className="text-sm text-amber-700 py-4 px-2">{slotsLoadError}</p>
                ) : slotsLoading ? (
                  <div className="flex items-center gap-2 py-4">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" aria-hidden />
                    <p className="text-brand-muted text-sm">Checking availability…</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-5 sm:grid-cols-7 gap-2">
                    {dateOptions.map(({ dateStr, label, weekday }) => {
                      const isSelected = selectedDate === dateStr;
                      const isPast = dateStr < todayChicago;
                      const isAvailable = availableDateSet !== null ? availableDateSet.has(dateStr) : true;
                      const isDisabled = isPast || (availableDateSet !== null && !isAvailable);
                      return (
                        <button
                          key={dateStr}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => setSelectedDate(dateStr)}
                          className={cn(
                            "rounded-xl border-2 py-2.5 px-2 text-center transition-all",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2",
                            isDisabled && "opacity-40 cursor-not-allowed",
                            isSelected
                              ? "border-brand-primary bg-brand-primary/10 text-brand-dark font-semibold"
                              : !isDisabled
                                ? "border-green-400/70 bg-green-50 hover:border-green-500"
                                : "border-brand-dark/10 bg-white"
                          )}
                        >
                          <span className="block text-[10px] sm:text-xs text-brand-muted uppercase">{weekday}</span>
                          <span className="block text-sm font-medium mt-0.5">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* Continue CTA */}
            {canContinue && (
              <div ref={continueSectionRef} className="pt-4">
                <button
                  type="button"
                  onClick={handleContinueToCheckout}
                  className="block w-full rounded-xl bg-brand-primary text-white font-semibold text-center py-4 px-6 hover:bg-brand-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 transition-colors"
                >
                  Continue to choose time & checkout
                </button>
                <p className="text-center text-xs text-brand-muted mt-3">
                  Instant confirmation · 10-minute hold at checkout
                </p>
              </div>
            )}

            {error && (
              <p className="text-center text-sm text-red-600">{error}</p>
            )}
          </div>
        ) : error != null && Array.isArray(experiences) && experiences.length === 0 ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-8 sm:p-10 text-center shadow-soft">
            <p className="text-red-800 font-semibold">Something went wrong</p>
            <p className="mt-2 text-sm text-red-700">{error}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="mt-4 rounded-xl bg-brand-primary text-white font-semibold py-3 px-6 hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 transition-colors"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-brand-dark/10 bg-white p-8 sm:p-10 text-center shadow-soft">
            <p className="text-brand-dark font-semibold">No experiences available yet</p>
            <p className="mt-2 text-sm text-brand-muted">
              Check back soon — experiences will appear here once they are published.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
