/**
 * Data-fetching hook for BookingModal.
 * Owns experiences, boats, rates, slots, date prices, ticket counts, and effective pricing.
 * Accepts (open, initialSelection, selectionKey) and selection state; returns all loaded data + loading/error states.
 */
import { useState, useRef, useMemo, useEffect } from "react";
import * as bookingCache from "@/lib/booking/booking-data-cache";
import { getMonthRange } from "@/lib/booking/booking-date-range";
import { bookingError } from "@/lib/booking/debug";

export interface ExperienceItem {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  heroMedia: { type: "image" | "video"; url: string };
  maxGuests: number;
  petsMax: number;
  fromPriceCents: number | null;
  active: boolean;
  pricingType?: "charter" | "ticketed";
  maxCapacity?: number;
  departureHour?: number;
  departureMinute?: number;
  allowDeposit?: boolean;
}

export interface BoatOption {
  id: string;
  name: string;
  slug?: string;
  photos: string[];
  fromPriceCents: number | null;
  rates: { id: string; durationHours: number; displayName: string; priceCents: number }[];
}

export interface SlotDto {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  boatId?: string;
  spotsBooked?: number;
  spotsRemaining?: number;
}

export interface RateOption {
  id: string;
  durationHours: number;
  displayName: string;
  priceCents: number;
}

export interface AddonOption {
  id: string;
  name: string;
  description?: string;
  priceCents: number;
  type: string;
  maxQty?: number;
  highlight?: boolean;
}

export interface BookingModalInitialSelection {
  experienceId?: string;
  experienceSlug?: string;
  boatId?: string;
  date?: string;
  slotId?: string;
  pricingType?: "charter" | "ticketed";
  bookingMode?: "shared" | "charter";
  departureHour?: number;
  departureMinute?: number;
}

const EMPTY_RATES: bookingCache.CachedRateOption[] = [];

export type UseBookingModalDataSelection = {
  selectedExperience: ExperienceItem | null;
  viewMonthYear: number;
  viewMonthMonth: number;
  selectedRateIdForCalendar: string | null;
  selectedDate: string | null;
  isTicketed: boolean;
  setSelectedExperience: React.Dispatch<React.SetStateAction<ExperienceItem | null>>;
};

export function useBookingModalData(
  open: boolean,
  initialSelection: BookingModalInitialSelection | null | undefined,
  selectionKey: number,
  selection: UseBookingModalDataSelection | null
) {
  const [experiences, setExperiences] = useState<ExperienceItem[] | null>(null);
  const [experiencesLoadError, setExperiencesLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [boats, setBoats] = useState<BoatOption[]>([]);
  const [boatsLoading, setBoatsLoading] = useState(false);
  const [experienceRates, setExperienceRates] = useState<RateOption[]>([]);
  const [addons, setAddons] = useState<AddonOption[]>([]);
  const [addonsLoading, setAddonsLoading] = useState(false);
  const [experienceDetailLoadError, setExperienceDetailLoadError] = useState<string | null>(null);
  const [monthSlots, setMonthSlots] = useState<SlotDto[]>([]);
  const [slotsLoadError, setSlotsLoadError] = useState<string | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [datePrices, setDatePrices] = useState<Record<string, number>>({});
  const [datePricesLoading, setDatePricesLoading] = useState(false);
  const [holidayDateStrings, setHolidayDateStrings] = useState<Set<string>>(new Set());
  const [ticketsAvailableByDate, setTicketsAvailableByDate] = useState<Record<string, number>>({});
  const [ratesSummary, setRatesSummary] = useState<bookingCache.CachedRateOption[] | null>(null);
  const [ratesLoadError, setRatesLoadError] = useState<string | null>(null);
  const [monthDataRangeStart, setMonthDataRangeStart] = useState<string | null>(null);
  const [slotsRetryTrigger, setSlotsRetryTrigger] = useState(0);
  const [ticketCounts, setTicketCounts] = useState<{ total: number; sold: number; onHold: number; available: number } | null>(null);
  const [ticketCountsLoading, setTicketCountsLoading] = useState(false);
  const [effectiveRateCents, setEffectiveRateCents] = useState<number | null>(null);

  const viewMonthForPrefetchRef = useRef<{ viewMonthStartStr: string; daysInViewMonth: number } | null>(null);
  const inFlightKeyRef = useRef<string | null>(null);
  const slotsRequestRangeRef = useRef<{ start: string; end: string } | null>(null);
  const lastSlotsRetryForRef = useRef<string | null>(null);
  const ticketsAvailableByDateRef = useRef<Record<string, number>>({});
  ticketsAvailableByDateRef.current = ticketsAvailableByDate;

  const ratesForSelection = useMemo(
    () => (experienceRates.length > 0 ? experienceRates : (ratesSummary ?? EMPTY_RATES)),
    [experienceRates, ratesSummary]
  );

  const viewMonthStartStr = selection
    ? getMonthRange(selection.viewMonthYear, selection.viewMonthMonth - 1).start
    : "";
  const viewMonthEndStr = selection
    ? getMonthRange(selection.viewMonthYear, selection.viewMonthMonth - 1).end
    : "";
  const daysInViewMonth = selection
    ? new Date(selection.viewMonthYear, selection.viewMonthMonth, 0).getDate()
    : 0;

  // When modal closes, clear data and loading so reopening triggers a fresh load (fixes "won't load" on second open).
  useEffect(() => {
    if (open) return;
    setLoading(false);
    setExperiences(null);
    setExperiencesLoadError(null);
    setBoats([]);
    setExperienceRates([]);
    setAddons([]);
    setExperienceDetailLoadError(null);
    setMonthSlots([]);
    setMonthDataRangeStart(null);
    setSlotsLoadError(null);
    setSlotsLoading(false);
    setRatesSummary(null);
    setRatesLoadError(null);
    setDatePrices({});
    setDatePricesLoading(false);
    setTicketsAvailableByDate({});
    setTicketCounts(null);
    setTicketCountsLoading(false);
  }, [open]);

  // Experiences fetch (on open/selectionKey)
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setExperiencesLoadError(null);
    const controller = new AbortController();
    bookingCache
      .fetchExperiences(controller.signal)
      .then((data) => {
        const list = data?.experiences ?? [];
        setExperiences(list.length > 0 ? list : []);
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === "AbortError") return;
        setExperiences([]);
        const apiBody = (err as { apiBody?: { error?: string; hint?: string } })?.apiBody;
        const msg = apiBody?.error ?? (err instanceof Error ? err.message : "Failed to load experiences");
        setExperiencesLoadError(apiBody?.hint ? `${msg}. ${apiBody.hint}` : msg);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [open, selectionKey]);

  // Experience detail (boats, rates, addons)
  useEffect(() => {
    const exp = selection?.selectedExperience;
    if (!exp?.id) {
      setBoats([]);
      setExperienceRates([]);
      setAddons([]);
      setExperienceDetailLoadError(null);
      return;
    }
    setExperienceDetailLoadError(null);
    setMonthSlots([]);
    setMonthDataRangeStart(null);
    setBoatsLoading(true);
    setAddonsLoading(true);
    const controller = new AbortController();
    bookingCache.fetchExperienceDetail(exp.id, controller.signal)
      .then((data) => {
        const boatList = Array.isArray(data.boats) ? (data.boats as BoatOption[]) : [];
        setBoats(boatList);
        setExperienceRates(Array.isArray(data.rates) ? (data.rates as RateOption[]) : []);
        setAddons(Array.isArray(data.addons) ? (data.addons as AddonOption[]) : []);
        const detail = data as { pricingType?: "charter" | "ticketed"; maxCapacity?: number; departureHour?: number; departureMinute?: number; allowDeposit?: boolean };
        if (detail?.pricingType || detail?.departureHour != null || detail?.allowDeposit != null) {
          selection?.setSelectedExperience((prev) =>
            prev
              ? {
                  ...prev,
                  ...(detail.pricingType && { pricingType: detail.pricingType }),
                  ...(detail.pricingType === "ticketed" && detail.maxCapacity != null && { maxCapacity: detail.maxCapacity }),
                  ...(detail.pricingType === "ticketed" && detail.departureHour != null && { departureHour: detail.departureHour }),
                  ...(detail.pricingType === "ticketed" && detail.departureMinute != null && { departureMinute: detail.departureMinute }),
                  ...(detail.allowDeposit != null && { allowDeposit: detail.allowDeposit }),
                }
              : null
          );
        }
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === "AbortError") return;
        setBoats([]);
        setExperienceRates([]);
        setAddons([]);
        const apiBody = (err as { apiBody?: { error?: string; hint?: string }; message?: string })?.apiBody;
        const msg = apiBody?.error ?? apiBody?.hint ?? (err instanceof Error ? err.message : "Could not load experience details.");
        setExperienceDetailLoadError(msg);
      })
      .finally(() => {
        setBoatsLoading(false);
        setAddonsLoading(false);
      });
    return () => controller.abort();
  }, [selection?.selectedExperience?.id, selection?.setSelectedExperience]);

  // Rates summary (early fetch for duration/date-prices)
  useEffect(() => {
    const exp = selection?.selectedExperience;
    if (!exp?.id) {
      setRatesSummary(null);
      setRatesLoadError(null);
      return;
    }
    setRatesLoadError(null);
    const controller = new AbortController();
    bookingCache
      .fetchExperienceRates(exp.id, controller.signal)
      .then((data) => {
        const list = data?.rates ?? [];
        setRatesSummary(list);
        setRatesLoadError(null);
        const viewMonth = viewMonthForPrefetchRef.current;
        if (viewMonth && list.length > 0) {
          const allRateIds = list.map((r) => r.id);
          bookingCache.prefetchDatePrices(
            exp.id,
            viewMonth.viewMonthStartStr,
            viewMonth.daysInViewMonth,
            allRateIds,
            controller.signal
          );
        }
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === "AbortError") return;
        setRatesSummary(null);
        const apiBody = (err as { apiBody?: { error?: string; hint?: string }; message?: string })?.apiBody;
        const msg = apiBody?.error ?? apiBody?.hint ?? (err instanceof Error ? err.message : "We couldn't load rates for this experience.");
        setRatesLoadError(msg);
      });
    return () => controller.abort();
  }, [selection?.selectedExperience?.id]);

  // View month ref for prefetch
  useEffect(() => {
    if (!selection || !viewMonthStartStr) return;
    viewMonthForPrefetchRef.current = { viewMonthStartStr, daysInViewMonth };
  }, [selection, viewMonthStartStr, daysInViewMonth]);

  // Date prices
  useEffect(() => {
    const exp = selection?.selectedExperience;
    if (!exp?.id || !selection?.selectedRateIdForCalendar || !viewMonthStartStr) {
      setDatePrices({});
      setHolidayDateStrings(new Set());
      setTicketsAvailableByDate({});
      setDatePricesLoading(false);
      return;
    }
    const key = `${exp.id}|${viewMonthStartStr}|${daysInViewMonth}|${selection.selectedRateIdForCalendar}`;
    inFlightKeyRef.current = key;
    setDatePricesLoading(true);
    const controller = new AbortController();
    bookingCache
      .fetchDatePrices(
        exp.id,
        viewMonthStartStr,
        daysInViewMonth,
        selection.selectedRateIdForCalendar,
        controller.signal
      )
      .then((data) => {
        const keyMatch = inFlightKeyRef.current === key;
        const prices = data.prices && typeof data.prices === "object" ? data.prices : {};
        if (!keyMatch) return;
        const holidays = new Set<string>(Array.isArray(data?.holidayDateStrings) ? data.holidayDateStrings : []);
        const ticketsAvailable =
          data.ticketsAvailableByDate && typeof data.ticketsAvailableByDate === "object"
            ? data.ticketsAvailableByDate
            : {};
        setDatePrices({ ...prices });
        setHolidayDateStrings(new Set(holidays));
        setTicketsAvailableByDate({ ...ticketsAvailable });
        const otherRateIds = ratesForSelection
          .map((r) => r.id)
          .filter((id) => id !== selection.selectedRateIdForCalendar);
        bookingCache.prefetchDatePrices(exp.id, viewMonthStartStr, daysInViewMonth, otherRateIds, controller.signal);
        const nextYear = selection.viewMonthMonth === 12 ? selection.viewMonthYear + 1 : selection.viewMonthYear;
        const nextMonth0 = selection.viewMonthMonth === 12 ? 0 : selection.viewMonthMonth;
        const { start: nextStart } = getMonthRange(nextYear, nextMonth0);
        const daysInNextMonth = new Date(nextYear, nextMonth0 + 1, 0).getDate();
        const selId = selection.selectedRateIdForCalendar;
        const allRateIdsForAdjacentMonth: string[] = otherRateIds.length && selId
          ? [...otherRateIds, selId]
          : selId ? [selId] : [];
        if (allRateIdsForAdjacentMonth.length > 0) {
          bookingCache.prefetchDatePrices(exp.id, nextStart, daysInNextMonth, allRateIdsForAdjacentMonth, controller.signal);
        }
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === "AbortError") return;
        const status = (err as { status?: number }).status;
        const apiBody = (err as { apiBody?: { error?: string; hint?: string } })?.apiBody;
        bookingError("client", "date-prices fetch failed", null, { startDate: viewMonthStartStr, status, error: apiBody?.error, hint: apiBody?.hint });
        if (inFlightKeyRef.current === key) {
          setDatePrices({});
          setHolidayDateStrings(new Set());
          setTicketsAvailableByDate({});
        }
      })
      .finally(() => {
        if (inFlightKeyRef.current === key) setDatePricesLoading(false);
      });
    return () => {
      controller.abort();
      inFlightKeyRef.current = null;
    };
  }, [selection?.selectedExperience?.id, selection?.viewMonthYear, selection?.viewMonthMonth, viewMonthStartStr, daysInViewMonth, selection?.selectedRateIdForCalendar, ratesForSelection]);

  // Slots for visible month
  useEffect(() => {
    const exp = selection?.selectedExperience;
    if (!exp?.id) {
      setMonthSlots([]);
      setSlotsLoadError(null);
      setMonthDataRangeStart(null);
      return;
    }
    const viewYear = selection?.viewMonthYear ?? new Date().getFullYear();
    const viewMonth = selection?.viewMonthMonth ?? new Date().getMonth() + 1;
    const rangeKey = `${viewMonthStartStr}|${viewMonthEndStr}`;
    if (slotsRequestRangeRef.current?.start !== viewMonthStartStr || slotsRequestRangeRef.current?.end !== viewMonthEndStr) {
      lastSlotsRetryForRef.current = null;
    }
    slotsRequestRangeRef.current = { start: viewMonthStartStr, end: viewMonthEndStr };
    setSlotsLoading(true);
    setSlotsLoadError(null);
    const controller = new AbortController();
    bookingCache.fetchSlots(
      exp.id,
      viewMonthStartStr,
      viewMonthEndStr,
      controller.signal,
      { ticketed: exp.pricingType === "ticketed" }
    )
      .then((data) => {
        const slots = (data?.slots ?? []) as SlotDto[];
        const refMatch = slotsRequestRangeRef.current?.start === viewMonthStartStr && slotsRequestRangeRef.current?.end === viewMonthEndStr;
        if (!refMatch) return;
        setSlotsLoadError(null);
        const nextSlots = [...slots];
        if (slots.length > 100) {
          setTimeout(() => {
            setMonthDataRangeStart(viewMonthStartStr);
            setMonthSlots(nextSlots);
            setSlotsLoading(false);
          }, 0);
        } else {
          setMonthDataRangeStart(viewMonthStartStr);
          setMonthSlots(nextSlots);
          setSlotsLoading(false);
        }
        const nextYear = viewMonth === 12 ? viewYear + 1 : viewYear;
        const nextMonth0 = viewMonth === 12 ? 0 : viewMonth;
        const { start: nextStart, end: nextEnd } = getMonthRange(nextYear, nextMonth0);
        bookingCache.fetchSlots(exp.id, nextStart, nextEnd, undefined, { ticketed: exp.pricingType === "ticketed" }).catch(() => {});
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === "AbortError") return;
        const apiBody = (err as { apiBody?: { error?: string; hint?: string; firebaseDetail?: { summary?: string } } })?.apiBody;
        const status = (err as { status?: number }).status;
        bookingError("client", "slots fetch failed", null, {
          startDate: viewMonthStartStr,
          endDate: viewMonthEndStr,
          status,
          error: apiBody?.error,
          hint: apiBody?.hint,
          firebaseSummary: apiBody?.firebaseDetail?.summary,
        });
        setMonthSlots([]);
        setMonthDataRangeStart(null);
        const msg = apiBody?.error ?? (err instanceof Error ? err.message : "Unable to load availability");
        const parts = [msg, apiBody?.hint, apiBody?.firebaseDetail?.summary].filter(Boolean);
        setSlotsLoadError(parts.join(" "));
        if (lastSlotsRetryForRef.current !== rangeKey) {
          lastSlotsRetryForRef.current = rangeKey;
          setTimeout(() => setSlotsRetryTrigger((t) => t + 1), 1500);
        }
      })
      .finally(() => {
        if (slotsRequestRangeRef.current?.start === viewMonthStartStr && slotsRequestRangeRef.current?.end === viewMonthEndStr) setSlotsLoading(false);
      });
    return () => controller.abort();
  }, [selection?.selectedExperience?.id, selection?.viewMonthYear, selection?.viewMonthMonth, viewMonthStartStr, viewMonthEndStr, slotsRetryTrigger]);

  // Ticket counts (ticketed only)
  useEffect(() => {
    const exp = selection?.selectedExperience;
    const selectedDate = selection?.selectedDate;
    if (!selection?.isTicketed || !selectedDate || !exp?.id) {
      setTicketCounts(null);
      return;
    }
    if (ticketsAvailableByDateRef.current[selectedDate] === 0) {
      setTicketCounts({ total: 0, sold: 0, onHold: 0, available: 0 });
      return;
    }
    setTicketCountsLoading(true);
    setTicketCounts(null);
    const controller = new AbortController();
    fetch(
      `/api/booking/ticket-availability?experienceId=${encodeURIComponent(exp.id)}&date=${encodeURIComponent(selectedDate)}`,
      { signal: controller.signal, cache: "no-store" }
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.total === "number") setTicketCounts(data);
      })
      .catch(() => {})
      .finally(() => setTicketCountsLoading(false));
    return () => controller.abort();
  }, [selection?.isTicketed, selection?.selectedDate, selection?.selectedExperience?.id]);

  // Effective rate cents (for selected date)
  useEffect(() => {
    const exp = selection?.selectedExperience;
    const selectedRateId = selection?.selectedRateIdForCalendar;
    const selectedDate = selection?.selectedDate;
    if (!exp?.id || !selectedRateId || !selectedDate) {
      setEffectiveRateCents(null);
      return;
    }
    const cachedPrice = datePrices[selectedDate];
    if (typeof cachedPrice === "number") {
      setEffectiveRateCents(cachedPrice);
      return;
    }
    const controller = new AbortController();
    const effectivePriceUrl = `/api/booking/effective-price?experienceId=${encodeURIComponent(exp.id)}&rateId=${encodeURIComponent(selectedRateId)}&date=${encodeURIComponent(selectedDate)}`;
    fetch(effectivePriceUrl, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (typeof data?.priceCents === "number") setEffectiveRateCents(data.priceCents);
        else setEffectiveRateCents(null);
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name !== "AbortError") setEffectiveRateCents(null);
      });
    return () => controller.abort();
  }, [selection?.selectedExperience?.id, selection?.selectedRateIdForCalendar, selection?.selectedDate, datePrices]);

  return {
    experiences,
    setExperiences,
    experiencesLoadError,
    setExperiencesLoadError,
    loading,
    boats,
    setBoats,
    boatsLoading,
    setBoatsLoading,
    experienceRates,
    setExperienceRates,
    addons,
    setAddons,
    addonsLoading,
    experienceDetailLoadError,
    setExperienceDetailLoadError,
    monthSlots,
    setMonthSlots,
    slotsLoadError,
    setSlotsLoadError,
    slotsLoading,
    datePrices,
    setDatePrices,
    datePricesLoading,
    setDatePricesLoading,
    holidayDateStrings,
    setHolidayDateStrings,
    ticketsAvailableByDate,
    setTicketsAvailableByDate,
    ratesSummary,
    setRatesSummary,
    ratesLoadError,
    setRatesLoadError,
    monthDataRangeStart,
    setMonthDataRangeStart,
    slotsRetryTrigger,
    setSlotsRetryTrigger,
    ticketCounts,
    setTicketCounts,
    ticketCountsLoading,
    effectiveRateCents,
    setEffectiveRateCents,
    viewMonthForPrefetchRef,
    ratesForSelection,
  };
}
