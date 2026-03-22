/**
 * Data-fetching hook for BookingModal.
 * Owns experiences, boats, rates, slots, date prices, ticket counts, and effective pricing.
 * Accepts (open, initialSelection, selectionKey) and selection state; returns all loaded data + loading/error states.
 */
import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import * as bookingCache from "@/lib/booking/booking-data-cache";
import { getMonthRange } from "@/lib/booking/booking-date-range";
import { bookingError } from "@/lib/booking/debug";
import type {
  ExperienceItem,
  BoatOption,
  SlotDto,
  RateOption,
  AddonOption,
  BookingModalInitialSelection,
} from "@/lib/booking/booking-modal-types";
import type { ExperienceSeasonal } from "@/lib/booking/types";

export type { ExperienceItem, BoatOption, SlotDto, RateOption, AddonOption, BookingModalInitialSelection };

const EMPTY_RATES: bookingCache.CachedRateOption[] = [];

export type UseBookingModalDataSelection = {
  selectedExperience: ExperienceItem | null;
  viewMonthYear: number;
  viewMonthMonth: number;
  selectedRateIdForCalendar: string | null;
  selectedDate: string | null;
  isTicketed: boolean;
  /** Listing boat id for calendar/effective pricing when the experience has boats. */
  selectedBoatId: string | null;
};

export function useBookingModalData(
  open: boolean,
  initialSelection: BookingModalInitialSelection | null | undefined,
  selectionKey: number,
  selection: UseBookingModalDataSelection | null,
  /** Skip experience-detail fetch and merge during active Stripe checkout so slot selection is not overwritten. */
  paymentPhase: string
) {
  const paymentPhaseRef = useRef(paymentPhase);
  paymentPhaseRef.current = paymentPhase;
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
  const [slotsPartialData, setSlotsPartialData] = useState(false);
  const [datePrices, setDatePrices] = useState<Record<string, number>>({});
  const [datePricesLoading, setDatePricesLoading] = useState(false);
  const [holidayDateStrings, setHolidayDateStrings] = useState<Set<string>>(new Set());
  const [ticketsAvailableByDate, setTicketsAvailableByDate] = useState<Record<string, number>>({});
  const [ratesSummary, setRatesSummary] = useState<bookingCache.CachedRateOption[] | null>(null);
  const [ratesLoadError, setRatesLoadError] = useState<string | null>(null);
  const [monthDataRangeStart, setMonthDataRangeStart] = useState<string | null>(null);
  const [slotsRetryTrigger, setSlotsRetryTrigger] = useState(0);
  const [boatsRetryTrigger, setBoatsRetryTrigger] = useState(0);
  const [ticketCounts, setTicketCounts] = useState<{ total: number; sold: number; onHold: number; available: number } | null>(null);
  const [ticketCountsLoading, setTicketCountsLoading] = useState(false);
  const [ticketCountsError, setTicketCountsError] = useState<string | null>(null);
  const [ticketCountsRetryTrigger, setTicketCountsRetryTrigger] = useState(0);
  const [effectiveRateCents, setEffectiveRateCents] = useState<number | null>(null);
  /** True while fetching `/api/booking/effective-price` for the selected date (cache miss for that date). */
  const [effectivePriceLoading, setEffectivePriceLoading] = useState(false);
  /** Merged into parent `selectedExperience` in BookingModal after detail fetch (avoids setter in selection). */
  const [experienceDetailPatch, setExperienceDetailPatch] = useState<Partial<ExperienceItem> | null>(null);

  const viewMonthForPrefetchRef = useRef<{ viewMonthStartStr: string; daysInViewMonth: number } | null>(null);
  const inFlightKeyRef = useRef<string | null>(null);
  const slotsRequestRangeRef = useRef<{ start: string; end: string } | null>(null);
  const lastSlotsRetryForRef = useRef<string | null>(null);
  /** Latest experience id for in-flight slots requests — discard responses after switching listings. */
  const slotsExperienceIdRef = useRef<string | null>(null);
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
    setSlotsPartialData(false);
    setRatesSummary(null);
    setRatesLoadError(null);
    setDatePrices({});
    setDatePricesLoading(false);
    setEffectivePriceLoading(false);
    setTicketsAvailableByDate({});
    setTicketCounts(null);
    setTicketCountsLoading(false);
    setTicketCountsError(null);
    setExperienceDetailPatch(null);
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
    if (
      paymentPhase === "stripe" ||
      paymentPhase === "loading" ||
      paymentPhase === "completing"
    ) {
      return;
    }
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
    // Drop previous experience's boats/rates/addons immediately so calendar/rates don't show the wrong listing while the new fetch runs.
    setBoats([]);
    setExperienceRates([]);
    setAddons([]);
    setBoatsLoading(true);
    setAddonsLoading(true);
    const controller = new AbortController();
    bookingCache.fetchExperienceDetail(exp.id, controller.signal)
      .then((data) => {
        const boatList = Array.isArray(data.boats) ? (data.boats as BoatOption[]) : [];
        setBoats(boatList);
        setExperienceRates(Array.isArray(data.rates) ? (data.rates as RateOption[]) : []);
        setAddons(Array.isArray(data.addons) ? (data.addons as AddonOption[]) : []);
        const detail = data as { pricingType?: "charter" | "ticketed"; maxCapacity?: number; departureHour?: number; departureMinute?: number; allowDeposit?: boolean; allowTipNow?: boolean; allowTipLater?: boolean; seasonal?: ExperienceSeasonal };
        if (
          paymentPhaseRef.current === "stripe" ||
          paymentPhaseRef.current === "loading" ||
          paymentPhaseRef.current === "completing"
        ) {
          return;
        }
        if (detail?.pricingType || detail?.departureHour != null || detail?.allowDeposit != null || detail?.allowTipNow != null || detail?.allowTipLater != null || detail?.seasonal != null) {
          setExperienceDetailPatch({
            ...(detail.pricingType && { pricingType: detail.pricingType }),
            ...(detail.pricingType === "ticketed" && detail.maxCapacity != null && { maxCapacity: detail.maxCapacity }),
            ...(detail.pricingType === "ticketed" && detail.departureHour != null && { departureHour: detail.departureHour }),
            ...(detail.pricingType === "ticketed" && detail.departureMinute != null && { departureMinute: detail.departureMinute }),
            ...(detail.allowDeposit != null && { allowDeposit: detail.allowDeposit }),
            ...(detail.allowTipNow != null && { allowTipNow: detail.allowTipNow }),
            ...(detail.allowTipLater != null && { allowTipLater: detail.allowTipLater }),
            ...(detail.seasonal != null && { seasonal: detail.seasonal }),
          });
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
  }, [selection?.selectedExperience?.id, boatsRetryTrigger, paymentPhase]);

  // Rates summary (early fetch for duration/date-prices)
  useEffect(() => {
    const exp = selection?.selectedExperience;
    if (!exp?.id) {
      setRatesSummary(null);
      setRatesLoadError(null);
      return;
    }
    setRatesSummary(null);
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
            undefined
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
        bookingCache.prefetchDatePrices(exp.id, viewMonthStartStr, daysInViewMonth, otherRateIds, undefined);
        const nextYear = selection.viewMonthMonth === 12 ? selection.viewMonthYear + 1 : selection.viewMonthYear;
        const nextMonth0 = selection.viewMonthMonth === 12 ? 0 : selection.viewMonthMonth;
        const { start: nextStart } = getMonthRange(nextYear, nextMonth0);
        const daysInNextMonth = new Date(nextYear, nextMonth0 + 1, 0).getDate();
        const selId = selection.selectedRateIdForCalendar;
        const allRateIdsForAdjacentMonth: string[] = otherRateIds.length && selId
          ? [...otherRateIds, selId]
          : selId ? [selId] : [];
        if (allRateIdsForAdjacentMonth.length > 0) {
          bookingCache.prefetchDatePrices(exp.id, nextStart, daysInNextMonth, allRateIdsForAdjacentMonth, undefined);
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
      if (inFlightKeyRef.current === key) inFlightKeyRef.current = null;
    };
  }, [selection?.selectedExperience?.id, selection?.viewMonthYear, selection?.viewMonthMonth, viewMonthStartStr, daysInViewMonth, selection?.selectedRateIdForCalendar, ratesForSelection]);

  // Slots for visible month
  useEffect(() => {
    const exp = selection?.selectedExperience;
    if (!exp?.id) {
      slotsExperienceIdRef.current = null;
      setMonthSlots([]);
      setSlotsLoadError(null);
      setMonthDataRangeStart(null);
      setSlotsPartialData(false);
      return;
    }
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const viewYear = selection?.viewMonthYear ?? new Date().getFullYear();
    const viewMonth = selection?.viewMonthMonth ?? new Date().getMonth() + 1;
    const rangeKey = `${viewMonthStartStr}|${viewMonthEndStr}`;
    if (slotsRequestRangeRef.current?.start !== viewMonthStartStr || slotsRequestRangeRef.current?.end !== viewMonthEndStr) {
      lastSlotsRetryForRef.current = null;
    }
    slotsRequestRangeRef.current = { start: viewMonthStartStr, end: viewMonthEndStr };
    slotsExperienceIdRef.current = exp.id;
    setSlotsLoading(true);
    setSlotsLoadError(null);
    const controller = new AbortController();
    const requestedExpId = exp.id;
    bookingCache.fetchSlots(
      exp.id,
      viewMonthStartStr,
      viewMonthEndStr,
      controller.signal,
      { ticketed: exp.pricingType === "ticketed" }
    )
      .then((data) => {
        if (slotsExperienceIdRef.current !== requestedExpId) return;
        const slots = (data?.slots ?? []) as SlotDto[];
        const refMatch = slotsRequestRangeRef.current?.start === viewMonthStartStr && slotsRequestRangeRef.current?.end === viewMonthEndStr;
        if (!refMatch) return;
        setSlotsLoadError(null);
        setSlotsPartialData(Boolean((data as { partialData?: boolean })?.partialData));
        const ur = (data as { unresolvedBookingCount?: number })?.unresolvedBookingCount;
        if (typeof ur === "number" && ur > 0) {
          bookingError("client", "slots API reports bookings missing boatId — verify backfill", null, {
            experienceId: exp.id,
            unresolvedBookingCount: ur,
          });
        }
        const nextSlots = [...slots];
        if (slots.length > 100) {
          setTimeout(() => {
            if (slotsExperienceIdRef.current !== requestedExpId) return;
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
        if (slotsExperienceIdRef.current === requestedExpId) {
          bookingCache.fetchSlots(exp.id, nextStart, nextEnd, undefined, { ticketed: exp.pricingType === "ticketed" }).catch(() => {});
        }
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
          retryTimer = setTimeout(() => setSlotsRetryTrigger((t) => t + 1), 1500);
        }
      })
      .finally(() => {
        if (slotsRequestRangeRef.current?.start === viewMonthStartStr && slotsRequestRangeRef.current?.end === viewMonthEndStr) setSlotsLoading(false);
      });
    return () => {
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [selection?.selectedExperience?.id, selection?.viewMonthYear, selection?.viewMonthMonth, viewMonthStartStr, viewMonthEndStr, slotsRetryTrigger]);

  // When tab becomes visible after inactivity, refresh slots and boats/experience-detail so the grid and options are not stale.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && selection?.selectedExperience?.id) {
        const experienceId = selection.selectedExperience.id;
        bookingCache.invalidate(`slots|${experienceId}|`);
        bookingCache.invalidate(`boats|${experienceId}`);
        bookingCache.invalidate(`experience-detail|${experienceId}`);
        setSlotsRetryTrigger((t) => t + 1);
        setBoatsRetryTrigger((t) => t + 1);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [selection?.selectedExperience?.id]);

  // Ticket counts (ticketed only) — one automatic retry after 3s; on failure leave ticketCounts null and show error (no synthetic capacity).
  useEffect(() => {
    const exp = selection?.selectedExperience;
    const selectedDate = selection?.selectedDate;
    if (!selection?.isTicketed || !selectedDate || !exp?.id) {
      setTicketCounts(null);
      setTicketCountsError(null);
      return;
    }
    if (ticketsAvailableByDateRef.current[selectedDate] === 0) {
      setTicketCounts({ total: 0, sold: 0, onHold: 0, available: 0 });
      setTicketCountsError(null);
      return;
    }
    setTicketCountsLoading(true);
    setTicketCounts(null);
    setTicketCountsError(null);
    const controller = new AbortController();

    const parseCounts = (body: Record<string, unknown>) => {
      if (
        typeof body.total === "number" &&
        typeof body.sold === "number" &&
        typeof body.onHold === "number" &&
        typeof body.available === "number"
      ) {
        return {
          total: body.total,
          sold: body.sold,
          onHold: body.onHold,
          available: body.available,
        };
      }
      return null;
    };

    (async () => {
      try {
        const fetchOnce = async () => {
          const res = await fetch(
            `/api/booking/ticket-availability?experienceId=${encodeURIComponent(exp.id)}&date=${encodeURIComponent(selectedDate)}`,
            { signal: controller.signal, cache: "no-store" }
          );
          let body: Record<string, unknown> = {};
          try {
            body = (await res.json()) as Record<string, unknown>;
          } catch {
            /* non-JSON */
          }
          return { res, body };
        };

        for (let attempt = 0; attempt < 2; attempt++) {
          if (controller.signal.aborted) return;
          if (attempt > 0) {
            await new Promise((r) => setTimeout(r, 3000));
            if (controller.signal.aborted) return;
          }
          const { res, body } = await fetchOnce();
          if (res.ok) {
            const counts = parseCounts(body);
            if (counts) {
              setTicketCounts(counts);
              setTicketCountsError(null);
              return;
            }
            bookingError("client", "ticket-availability invalid response", null, {
              keys: Object.keys(body),
              experienceId: exp.id,
              date: selectedDate,
            });
          } else {
            bookingError("client", "ticket-availability fetch failed", null, {
              status: res.status,
              error: body.error,
              hint: body.hint,
              experienceId: exp.id,
              date: selectedDate,
            });
          }
        }
        if (controller.signal.aborted) return;
        setTicketCounts(null);
        setTicketCountsError("We couldn’t load ticket availability. Tap Retry to try again.");
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === "AbortError") return;
        bookingError("client", "ticket-availability fetch threw", err, {
          experienceId: exp.id,
          date: selectedDate,
        });
        setTicketCounts(null);
        setTicketCountsError(err instanceof Error ? err.message : "Could not load ticket availability");
      }
    })().finally(() => {
      if (!controller.signal.aborted) setTicketCountsLoading(false);
    });

    return () => controller.abort();
  }, [selection?.isTicketed, selection?.selectedDate, selection?.selectedExperience?.id, ticketCountsRetryTrigger]);

  // Effective rate for selected date: use month cache when present; otherwise fetch `/api/booking/effective-price`
  // directly (cache: no-store, not `fetchCached`) so payment-time price stays server-authoritative.
  useEffect(() => {
    const exp = selection?.selectedExperience;
    const selectedRateId = selection?.selectedRateIdForCalendar;
    const selectedDate = selection?.selectedDate;
    if (!exp?.id || !selectedRateId || !selectedDate) {
      setEffectiveRateCents(null);
      setEffectivePriceLoading(false);
      return;
    }
    const cachedPrice = datePrices[selectedDate];
    if (typeof cachedPrice === "number") {
      setEffectiveRateCents(cachedPrice);
      setEffectivePriceLoading(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setEffectivePriceLoading(true);
    const boatIdParam =
      selection.selectedBoatId && selection.selectedBoatId.trim()
        ? `&boatId=${encodeURIComponent(selection.selectedBoatId.trim())}`
        : "";
    const effectivePriceUrl = `/api/booking/effective-price?experienceId=${encodeURIComponent(exp.id)}&rateId=${encodeURIComponent(selectedRateId)}&date=${encodeURIComponent(selectedDate)}${boatIdParam}`;

    (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (cancelled || controller.signal.aborted) return;
        try {
          const res = await fetch(effectivePriceUrl, { signal: controller.signal, cache: "no-store" });
          const data = (await res.json()) as { priceCents?: unknown };
          if (cancelled) return;
          if (typeof data?.priceCents === "number") {
            setEffectiveRateCents(data.priceCents);
            setEffectivePriceLoading(false);
            return;
          }
        } catch (err: unknown) {
          if ((err as { name?: string })?.name === "AbortError") return;
        }
      }
      if (!cancelled) {
        setEffectiveRateCents(null);
        setEffectivePriceLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selection?.selectedExperience?.id, selection?.selectedRateIdForCalendar, selection?.selectedDate, selection?.selectedBoatId, datePrices]);

  const clearExperienceDetailPatch = useCallback(() => {
    setExperienceDetailPatch(null);
  }, []);

  const retrySlots = useCallback(() => {
    setSlotsRetryTrigger((t) => t + 1);
  }, []);

  const retryTicketCounts = useCallback(() => {
    setTicketCountsRetryTrigger((t) => t + 1);
  }, []);

  const resetBookingDataForModalOpen = useCallback(() => {
    setExperiencesLoadError(null);
    setBoats([]);
    setExperienceRates([]);
    setAddons([]);
    setExperienceDetailLoadError(null);
    setEffectiveRateCents(null);
    setDatePrices({});
    setMonthSlots([]);
    setMonthDataRangeStart(null);
    setRatesSummary(null);
    setRatesLoadError(null);
    setExperienceDetailPatch(null);
  }, []);

  const invalidateAfterConflict = useCallback(() => {
    const exp = selection?.selectedExperience;
    if (!exp?.id || !viewMonthStartStr || !viewMonthEndStr) return;
    bookingCache.invalidate(`slots|${exp.id}|`);
    const ticketed = exp.pricingType === "ticketed";
    bookingCache
      .fetchSlots(exp.id, viewMonthStartStr, viewMonthEndStr, undefined, { ticketed })
      .then((data) => {
        const nextSlots = (data?.slots ?? []) as SlotDto[];
        setMonthDataRangeStart(viewMonthStartStr);
        setMonthSlots(nextSlots);
      })
      .catch(() => {
        setMonthSlots([]);
        setMonthDataRangeStart(null);
      });
  }, [selection?.selectedExperience, viewMonthStartStr, viewMonthEndStr]);

  return {
    experiences,
    experiencesLoadError,
    loading,
    boats,
    boatsLoading,
    experienceRates,
    addons,
    addonsLoading,
    experienceDetailLoadError,
    monthSlots,
    slotsLoadError,
    slotsLoading,
    slotsPartialData,
    datePrices,
    datePricesLoading,
    holidayDateStrings,
    ticketsAvailableByDate,
    ratesSummary,
    ratesLoadError,
    monthDataRangeStart,
    ticketCounts,
    ticketCountsLoading,
    ticketCountsError,
    ticketCountsRetryTrigger,
    effectiveRateCents,
    effectivePriceLoading,
    viewMonthForPrefetchRef,
    ratesForSelection,
    experienceDetailPatch,
    clearExperienceDetailPatch,
    retrySlots,
    retryTicketCounts,
    resetBookingDataForModalOpen,
    invalidateAfterConflict,
  };
}
