/**
 * Data-fetching hook for BookingModal.
 * Owns experiences, boats, rates, slots, date prices, ticket counts, and effective pricing.
 * Accepts (open, initialSelection, selectionKey) and selection state; returns all loaded data + loading/error states.
 */
import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import * as bookingCache from "@/lib/booking/booking-data-cache";
import { getMonthRange } from "@/lib/booking/booking-date-range";
import { isTicketedExperienceForBooking } from "@/lib/booking/experience-aliases";
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

export type ConfirmSlotsFreshResult =
  | { ok: true; slots: SlotDto[] }
  | { ok: false; error: string };

export function useBookingModalData(
  open: boolean,
  initialSelection: BookingModalInitialSelection | null | undefined,
  selectionKey: number,
  selection: UseBookingModalDataSelection | null,
  /** Skip experience-detail fetch and merge during active Stripe checkout so slot selection is not overwritten. */
  paymentPhase: string,
  /** When date-prices returns `rateIdMismatch`, parent should clear `selectedRateIdForCalendar`. */
  onDatePricesRateIdMismatch?: () => void
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
  /** Last time month slots were written to state from a successful fetch (for staleness on step advance). */
  const [slotsFetchedAt, setSlotsFetchedAt] = useState<number | null>(null);
  const [datePrices, setDatePrices] = useState<Record<string, number>>({});
  const [datePricesLoading, setDatePricesLoading] = useState(false);
  /** True when date-prices API indicates incomplete legacy hold scan (conservative ticket caps in UI). */
  const [datePricesPartialData, setDatePricesPartialData] = useState(false);
  /** Set when API reports selected rateId no longer exists; parent resets calendar rate via callback. */
  const [datePricesRateMismatchMessage, setDatePricesRateMismatchMessage] = useState<string | null>(null);
  const [holidayDateStrings, setHolidayDateStrings] = useState<Set<string>>(new Set());
  const [ticketsAvailableByDate, setTicketsAvailableByDate] = useState<Record<string, number>>({});
  const [ratesSummary, setRatesSummary] = useState<bookingCache.CachedRateOption[] | null>(null);
  const [ratesLoadError, setRatesLoadError] = useState<string | null>(null);
  const [slotsRetryTrigger, setSlotsRetryTrigger] = useState(0);
  const [boatsRetryTrigger, setBoatsRetryTrigger] = useState(0);
  const [effectivePriceRetryTrigger, setEffectivePriceRetryTrigger] = useState(0);
  const [ticketCounts, setTicketCounts] = useState<{
    total: number;
    sold: number;
    onHold: number;
    available: number;
    conservativeEstimate?: boolean;
    availabilityNote?: string;
  } | null>(null);
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
    setSlotsLoadError(null);
    setSlotsLoading(false);
    setSlotsPartialData(false);
    setSlotsFetchedAt(null);
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
    setDatePricesRateMismatchMessage(null);
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
      setRatesSummary(null);
      setRatesLoadError(null);
      setAddons([]);
      setExperienceDetailLoadError(null);
      return;
    }
    setExperienceDetailLoadError(null);
    setMonthSlots([]);
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
        const rateList = Array.isArray(data.rates) ? (data.rates as RateOption[]) : [];
        setExperienceRates(rateList);
        setRatesSummary(rateList);
        setRatesLoadError(null);
        const viewMonth = viewMonthForPrefetchRef.current;
        if (viewMonth && rateList.length > 0) {
          const allRateIds = rateList.map((r) => r.id).filter(Boolean);
          bookingCache.prefetchDatePrices(
            exp.id,
            viewMonth.viewMonthStartStr,
            viewMonth.daysInViewMonth,
            allRateIds,
            undefined
          );
        }
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
        setRatesSummary(null);
        setRatesLoadError(null);
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

  // View month ref for prefetch
  useEffect(() => {
    if (!selection || !viewMonthStartStr) return;
    viewMonthForPrefetchRef.current = { viewMonthStartStr, daysInViewMonth };
  }, [selection, viewMonthStartStr, daysInViewMonth]);

  // Date prices
  useEffect(() => {
    const exp = selection?.selectedExperience;
    const rateIdForDatePrices =
      selection?.selectedRateIdForCalendar ?? (ratesForSelection.length > 0 ? ratesForSelection[0]?.id : null);
    if (!exp?.id || !rateIdForDatePrices || !viewMonthStartStr) {
      setDatePrices({});
      setHolidayDateStrings(new Set());
      setTicketsAvailableByDate({});
      setDatePricesLoading(false);
      return;
    }
    const key = `${exp.id}|${viewMonthStartStr}|${daysInViewMonth}|${rateIdForDatePrices}`;
    inFlightKeyRef.current = key;
    setDatePricesLoading(true);
    setDatePricesRateMismatchMessage(null);
    const controller = new AbortController();
    bookingCache
      .fetchDatePrices(
        exp.id,
        viewMonthStartStr,
        daysInViewMonth,
        rateIdForDatePrices,
        controller.signal
      )
      .then((data) => {
        const keyMatch = inFlightKeyRef.current === key;
        const prices = data.prices && typeof data.prices === "object" ? data.prices : {};
        if (!keyMatch) return;
        setDatePricesRateMismatchMessage(null);
        const holidays = new Set<string>(Array.isArray(data?.holidayDateStrings) ? data.holidayDateStrings : []);
        const ticketsAvailable =
          data.ticketsAvailableByDate && typeof data.ticketsAvailableByDate === "object"
            ? data.ticketsAvailableByDate
            : {};
        setDatePrices({ ...prices });
        setHolidayDateStrings(new Set(holidays));
        setTicketsAvailableByDate({ ...ticketsAvailable });
        setDatePricesPartialData(Boolean((data as { partialData?: boolean }).partialData));
        if (!selection) return;
        const otherRateIds = ratesForSelection
          .map((r) => r.id)
          .filter((id) => id !== rateIdForDatePrices);
        bookingCache.prefetchDatePrices(exp.id, viewMonthStartStr, daysInViewMonth, otherRateIds, undefined);
        const nextYear = selection.viewMonthMonth === 12 ? selection.viewMonthYear + 1 : selection.viewMonthYear;
        const nextMonth0 = selection.viewMonthMonth === 12 ? 0 : selection.viewMonthMonth;
        const { start: nextStart } = getMonthRange(nextYear, nextMonth0);
        const daysInNextMonth = new Date(nextYear, nextMonth0 + 1, 0).getDate();
        const selId = rateIdForDatePrices;
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
        const apiBody = (err as {
          apiBody?: { error?: string; hint?: string; rateIdMismatch?: boolean };
        })?.apiBody;
        const rateMismatch = apiBody?.rateIdMismatch === true;
        if (rateMismatch && inFlightKeyRef.current === key) {
          onDatePricesRateIdMismatch?.();
          setDatePricesRateMismatchMessage(
            apiBody?.error?.trim() ||
              "That trip length is no longer available. Please choose a duration again."
          );
        }
        if (!rateMismatch) {
          bookingError("client", "date-prices fetch failed", null, {
            startDate: viewMonthStartStr,
            status,
            error: apiBody?.error,
            hint: apiBody?.hint,
          });
        }
        if (inFlightKeyRef.current === key) {
          setDatePrices({});
          setHolidayDateStrings(new Set());
          setTicketsAvailableByDate({});
          setDatePricesPartialData(false);
        }
      })
      .finally(() => {
        if (inFlightKeyRef.current === key) setDatePricesLoading(false);
      });
    return () => {
      controller.abort();
      if (inFlightKeyRef.current === key) inFlightKeyRef.current = null;
    };
  }, [
    selection?.selectedExperience?.id,
    selection?.viewMonthYear,
    selection?.viewMonthMonth,
    viewMonthStartStr,
    daysInViewMonth,
    selection?.selectedRateIdForCalendar,
    ratesForSelection,
    onDatePricesRateIdMismatch,
  ]);

  // Slots for visible month
  useEffect(() => {
    const exp = selection?.selectedExperience;
    if (!exp?.id) {
      slotsExperienceIdRef.current = null;
      setMonthSlots([]);
      setSlotsLoadError(null);
      setSlotsPartialData(false);
      setSlotsFetchedAt(null);
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
      { ticketed: isTicketedExperienceForBooking(exp) }
    )
      .then((data) => {
        if (slotsExperienceIdRef.current !== requestedExpId) return;
        const slots = (data?.slots ?? []) as SlotDto[];
        const refMatch = slotsRequestRangeRef.current?.start === viewMonthStartStr && slotsRequestRangeRef.current?.end === viewMonthEndStr;
        if (!refMatch) return;
        setSlotsLoadError(null);
        setSlotsPartialData(Boolean((data as { partialData?: boolean })?.partialData));
        setSlotsFetchedAt(Date.now());
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
            setMonthSlots(nextSlots);
            setSlotsLoading(false);
          }, 0);
        } else {
          setMonthSlots(nextSlots);
          setSlotsLoading(false);
        }
        const nextYear = viewMonth === 12 ? viewYear + 1 : viewYear;
        const nextMonth0 = viewMonth === 12 ? 0 : viewMonth;
        const { start: nextStart, end: nextEnd } = getMonthRange(nextYear, nextMonth0);
        if (slotsExperienceIdRef.current === requestedExpId) {
          bookingCache.fetchSlots(exp.id, nextStart, nextEnd, undefined, { ticketed: isTicketedExperienceForBooking(exp) }).catch(() => {});
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
        if ((err as { name?: string })?.name === "TimeoutError") {
          setSlotsLoadError("Availability is taking a moment to load. Please try again.");
        } else {
          const msg = apiBody?.error ?? (err instanceof Error ? err.message : "Unable to load availability");
          const parts = [msg, apiBody?.hint, apiBody?.firebaseDetail?.summary].filter(Boolean);
          setSlotsLoadError(parts.join(" "));
        }
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
        setTicketCounts(null);
        setTicketCountsRetryTrigger((t) => t + 1);
        setSlotsRetryTrigger((t) => t + 1);
        setBoatsRetryTrigger((t) => t + 1);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [selection?.selectedExperience?.id]);

  // On mount/open: if last slots fetch is old, force refresh even if visibilitychange doesn't fire.
  useEffect(() => {
    if (!open) return;
    const expId = selection?.selectedExperience?.id;
    if (!expId || !viewMonthStartStr || !viewMonthEndStr) return;
    const raw = process.env.NEXT_PUBLIC_SLOTS_REFETCH_ON_MOUNT_MS ?? "";
    const n = parseInt(String(raw), 10);
    const thresholdMs = Number.isFinite(n) && n >= 1_000 ? Math.min(n, 10 * 60_000) : 30_000;
    const last = bookingCache.getSlotsCacheFetchedAt(expId, viewMonthStartStr, viewMonthEndStr);
    if (last != null && Date.now() - last > thresholdMs) {
      bookingCache.invalidate(`slots|${expId}|`);
      setSlotsRetryTrigger((t) => t + 1);
    }
  }, [open, selection?.selectedExperience?.id, viewMonthStartStr, viewMonthEndStr]);

  // Ticket counts (ticketed only) — one automatic retry after 3s; on failure leave ticketCounts null and show error (no synthetic capacity).
  useEffect(() => {
    const exp = selection?.selectedExperience;
    const selectedDate = selection?.selectedDate;
    if (!selection?.isTicketed || !selectedDate || !exp?.id) {
      setTicketCounts(null);
      setTicketCountsError(null);
      setTicketCountsLoading(false);
      return;
    }
    if (ticketsAvailableByDateRef.current[selectedDate] === 0) {
      setTicketCounts({ total: 0, sold: 0, onHold: 0, available: 0 });
      setTicketCountsError(null);
      setTicketCountsLoading(false);
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
          ...(body.conservativeEstimate === true ? { conservativeEstimate: true as const } : {}),
          ...(typeof body.availabilityNote === "string" && body.availabilityNote.trim()
            ? { availabilityNote: body.availabilityNote.trim() }
            : {}),
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
        setTicketCountsError("We couldn't confirm available tickets — tap Retry to try again.");
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
  }, [selection?.selectedExperience?.id, selection?.selectedRateIdForCalendar, selection?.selectedDate, selection?.selectedBoatId, datePrices, effectivePriceRetryTrigger]);

  const clearExperienceDetailPatch = useCallback(() => {
    setExperienceDetailPatch(null);
  }, []);

  const retrySlots = useCallback(() => {
    setSlotsRetryTrigger((t) => t + 1);
  }, []);

  /** Invalidate slot cache and fetch immediately (e.g. before payment step when data may be stale). */
  const confirmSlotsFresh = useCallback(async (): Promise<ConfirmSlotsFreshResult> => {
    const exp = selection?.selectedExperience;
    if (!exp?.id || !viewMonthStartStr || !viewMonthEndStr) return { ok: true, slots: [] };
    bookingCache.invalidate(`slots|${exp.id}|`);
    setSlotsLoading(true);
    setSlotsLoadError(null);
    try {
      const data = await bookingCache.fetchSlots(exp.id, viewMonthStartStr, viewMonthEndStr, undefined, {
        ticketed: isTicketedExperienceForBooking(exp),
      });
      const slots = (data?.slots ?? []) as SlotDto[];
      setMonthSlots(slots);
      setSlotsPartialData(Boolean((data as { partialData?: boolean })?.partialData));
      setSlotsFetchedAt(Date.now());
      setSlotsLoadError(null);
      return { ok: true, slots };
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === "AbortError") {
        const aborted = "Could not refresh availability. Tap Continue again to retry.";
        setSlotsLoadError(aborted);
        return { ok: false, error: aborted };
      }
      const apiBody = (err as { apiBody?: { error?: string; hint?: string; firebaseDetail?: { summary?: string } } })?.apiBody;
      const status = (err as { status?: number }).status;
      bookingError("client", "confirmSlotsFresh fetch failed", err, {
        experienceId: exp.id,
        startDate: viewMonthStartStr,
        endDate: viewMonthEndStr,
        status,
        error: apiBody?.error,
        hint: apiBody?.hint,
        firebaseSummary: apiBody?.firebaseDetail?.summary,
      });
      const head =
        (err as { name?: string })?.name === "TimeoutError"
          ? "Availability is taking a moment to load."
          : apiBody?.error ?? (err instanceof Error ? err.message : "Could not refresh availability.");
      const parts = [head, apiBody?.hint, apiBody?.firebaseDetail?.summary].filter(Boolean);
      const detail = parts.join(" ").replace(/\s+/g, " ").trim();
      const message = detail
        ? `${detail} Tap Continue again to retry.`
        : "Could not refresh availability. Tap Continue again to retry.";
      setSlotsLoadError(message);
      return { ok: false, error: message };
    } finally {
      setSlotsLoading(false);
    }
  }, [selection?.selectedExperience, viewMonthStartStr, viewMonthEndStr]);

  const retryBoats = useCallback(() => {
    setBoatsRetryTrigger((t) => t + 1);
  }, []);

  const retryEffectivePrice = useCallback(() => {
    setEffectivePriceRetryTrigger((t) => t + 1);
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
    setDatePricesPartialData(false);
    setDatePricesRateMismatchMessage(null);
    setMonthSlots([]);
    setRatesSummary(null);
    setRatesLoadError(null);
    setExperienceDetailPatch(null);
  }, []);

  const invalidateAfterConflict = useCallback(() => {
    const exp = selection?.selectedExperience;
    if (!exp?.id || !viewMonthStartStr || !viewMonthEndStr) return;
    bookingCache.invalidate(`slots|${exp.id}|`);
    const ticketed = isTicketedExperienceForBooking(exp);
    bookingCache
      .fetchSlots(exp.id, viewMonthStartStr, viewMonthEndStr, undefined, { ticketed })
      .then((data) => {
        const nextSlots = (data?.slots ?? []) as SlotDto[];
        setMonthSlots(nextSlots);
        setSlotsFetchedAt(Date.now());
      })
      .catch(() => {
        setMonthSlots([]);
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
    slotsFetchedAt,
    datePrices,
    datePricesLoading,
    datePricesPartialData,
    datePricesRateMismatchMessage,
    holidayDateStrings,
    ticketsAvailableByDate,
    ratesSummary,
    ratesLoadError,
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
    confirmSlotsFresh,
    retryBoats,
    retryEffectivePrice,
    retryTicketCounts,
    resetBookingDataForModalOpen,
    invalidateAfterConflict,
  };
}
