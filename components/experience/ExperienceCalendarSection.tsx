"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as bookingCache from "@/lib/booking/booking-data-cache";
import { ExperienceCalendarSectionView } from "./ExperienceCalendarSectionView";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn, getDisplayImageUrl } from "@/lib/utils";
import { parseSlotId } from "@/lib/booking/experience-slots";
import { formatBookingTimeFromIso, isoToChicagoDateStr } from "@/lib/booking/format-booking-datetime";
import { toDateStr, getMonthRange, getMonthRangeWithAdjacent, getDaysInMonth as getDaysInMonthFromLib } from "@/lib/booking/booking-date-range";
import { Dialog } from "@/components/ui/dialog";
import { InlineBookingDetailsStep } from "@/components/booking/InlineBookingDetailsStep";

export type SlotStatus = "open" | "held" | "booked" | "blocked";

export interface SlotDto {
  id: string;
  startAt: string;
  endAt: string;
  status: SlotStatus;
  boatId?: string;
  spotsRemaining?: number;
  spotsBooked?: number;
  isCharterLocked?: boolean;
  showSpotsRemaining?: boolean;
  maxCapacity?: number;
}

function formatTime(iso: string) {
  return formatBookingTimeFromIso(iso);
}

/** Range covering one month before through one month after the given calendar month (so nav always has data). */
function getDateRangeForMonth(calendarMonth: Date): { start: string; end: string } {
  return getMonthRangeWithAdjacent(calendarMonth.getFullYear(), calendarMonth.getMonth());
}

/** Returns the date range covering only the visible calendar month (first day through last day). */
function getVisibleMonthRange(calendarMonth: Date): { start: string; end: string } {
  return getMonthRange(calendarMonth.getFullYear(), calendarMonth.getMonth());
}

/**
 * Merges incoming slots into an existing collection. For any (id, boatId) pair that appears in
 * both arrays the incoming (fresher) slot wins, so staleness is never introduced by a merge.
 */
function mergeSlots(existing: SlotDto[], incoming: SlotDto[]): SlotDto[] {
  if (existing.length === 0) return incoming;
  if (incoming.length === 0) return existing;
  const incomingByKey = new Map(incoming.map((s) => [`${s.id}:${s.boatId ?? ""}`, s]));
  const retained = existing.filter((s) => !incomingByKey.has(`${s.id}:${s.boatId ?? ""}`));
  return [...retained, ...incoming];
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Days in a calendar month for compact grid (dateStr, label, weekday). month is 0-based. */
function getDaysInMonth(year: number, monthZeroBased: number): { dateStr: string; label: string; weekday: string }[] {
  return getDaysInMonthFromLib(year, monthZeroBased);
}

type RateOption = { id: string; durationHours: number; displayName: string; priceCents: number };

interface BoatOption {
  id: string;
  name: string;
  photos?: string[];
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(cents / 100);
}

export interface ExperienceCalendarOpenModalSelection {
  experienceId?: string;
  experienceSlug?: string;
  date: string;
  slotId: string;
  boatId?: string;
  pricingType?: "charter" | "ticketed";
}

interface ExperienceCalendarSectionProps {
  experienceId?: string;
  firestoreSlug?: string | null;
  /** Slug for opening BookingModal (e.g. experience.slug). Passed to onOpenInModal. */
  experienceSlug?: string | null;
  /** When user picks a date only (no slot selection). */
  onSelectDate?: (date: string) => void;
  /** When user picks a time slot – go to checkout for this slot. */
  onSelectSlot?: (slotId: string, dateStr: string) => void;
  /** Base URL for booking (e.g. /experiences/slug/book). Used with onSelectSlot when not directCheckout and no onOpenInModal. */
  bookHref?: string;
  /** When true, clicking a time goes straight to Stripe Checkout (no book page). Ignored if onOpenInModal is set. */
  directCheckout?: boolean;
  /** When set, picking a time opens the app BookingModal with this selection (experience + date + slot). Use for "calendar first" flow. */
  onOpenInModal?: (selection: ExperienceCalendarOpenModalSelection) => void;
  /** When provided with ratesForDetails and addonsForDetails, details & payment step is shown inline (third panel) instead of opening the modal. */
  experienceForDetails?: { id: string; title: string; maxGuests: number; petsMax: number };
  ratesForDetails?: RateOption[];
  addonsForDetails?: { id: string; name: string; description?: string; priceCents: number; type: string; maxQty?: number }[];
  /** When "dark-card", use the pontoon-style card look (dark bg, white text, compact) in the same spot as BookingPreviewCard. */
  variant?: "default" | "dark-card";
  className?: string;
  /** Pass from server-rendered experience data to skip fetching pricingType and show the correct UI immediately. */
  pricingType?: "charter" | "ticketed";
  departureHour?: number;
  departureMinute?: number;
}

export function ExperienceCalendarSection({
  experienceId: experienceIdProp,
  firestoreSlug,
  experienceSlug,
  onSelectDate,
  onSelectSlot,
  bookHref,
  directCheckout = false,
  onOpenInModal,
  experienceForDetails,
  ratesForDetails,
  addonsForDetails,
  variant = "default",
  className,
  pricingType: pricingTypeProp,
  departureHour: departureHourProp,
  departureMinute: departureMinuteProp,
}: ExperienceCalendarSectionProps) {
  const darkCard = variant === "dark-card";
  const [experienceId, setExperienceId] = useState<string | null>(experienceIdProp ?? null);
  const [rates, setRates] = useState<RateOption[]>([]);
  const [slots, setSlots] = useState<SlotDto[]>([]);
  const [loading, setLoading] = useState(!!experienceIdProp || !!firestoreSlug);
  /** When loading by firestoreSlug, full experience + addons from API (for inline details step when onOpenInModal). */
  const [fetchedExperience, setFetchedExperience] = useState<{ title: string; maxGuests: number; petsMax: number } | null>(null);
  const [fetchedAddons, setFetchedAddons] = useState<{ id: string; name: string; description?: string; priceCents: number; type: string; maxQty?: number }[]>([]);
  const [fetchedPricingType, setFetchedPricingType] = useState<"charter" | "ticketed" | undefined>(pricingTypeProp ?? undefined);
  const [fetchedDepartureHour, setFetchedDepartureHour] = useState<number | undefined>(departureHourProp ?? undefined);
  const [fetchedDepartureMinute, setFetchedDepartureMinute] = useState<number | undefined>(departureMinuteProp ?? undefined);
  const [ticketsAvailableByDate, setTicketsAvailableByDate] = useState<Record<string, number>>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slotModalOpen, setSlotModalOpen] = useState(false);
  const [selectedDurationForModal, setSelectedDurationForModal] = useState<number | null>(null);
  const [directCheckoutLoading, setDirectCheckoutLoading] = useState<string | null>(null);
  const [directCheckoutError, setDirectCheckoutError] = useState<string | null>(null);
  const [directDiscountCode, setDirectDiscountCode] = useState("");
  const [datePrices, setDatePrices] = useState<Record<string, number>>({});
  const [holidayDateStrings, setHolidayDateStrings] = useState<Set<string>>(new Set());
  /** When using inline step-2 (onOpenInModal), the slot chosen for "Continue to choose your boat". */
  const [selectedSlotInline, setSelectedSlotInline] = useState<SlotDto | null>(null);
  /** When true, show "Choose your boat" inline on the page instead of opening the modal. */
  const [showInlineBoatStep, setShowInlineBoatStep] = useState(false);
  /** When true (and experienceForDetails/ratesForDetails/addonsForDetails provided), show "Details & payment" as third panel. */
  const [showDetailsStep, setShowDetailsStep] = useState(false);
  const [inlineBookingHeight, setInlineBookingHeight] = useState<number | null>(null);
  const panel1Ref = useRef<HTMLDivElement>(null);
  const panel2Ref = useRef<HTMLDivElement>(null);
  const panel3Ref = useRef<HTMLDivElement>(null);
  const panel4Ref = useRef<HTMLDivElement>(null);
  const panel5Ref = useRef<HTMLDivElement>(null);
  /** True when Effect 1 already populated rates from the slug endpoint response; skips the standalone rates fetch in Effect 2. */
  const ratesLoadedFromSlug = useRef(false);
  /**
   * Tracks "experienceId:YYYY-MM" month keys successfully loaded into slot state. Only updated on
   * successful fetch so retries and revisits show loading/error until success.
   */
  const fetchedMonthKeysRef = useRef<Set<string>>(new Set());
  /** Month key currently being fetched; used so we only clear loading when that request completes. */
  const currentCalendarMonthKeyRef = useRef<string>("");
  /** Tracks adjacent month keys already background-prefetched to avoid duplicate idle fetches. */
  const prefetchedMonthKeysRef = useRef<Set<string>>(new Set());
  /** Month keys that had a fetch failure; UI shows retry/error banner instead of "No availability." */
  const [monthFetchErrors, setMonthFetchErrors] = useState<Record<string, boolean>>({});
  /** Incremented on retry to re-run the slot fetch effect for the current month. */
  const [retryCount, setRetryCount] = useState(0);
  /** Month keys we've already auto-retried once (first response was 0 slots); avoid infinite retry loop. */
  const autoRetriedMonthKeysRef = useRef<Set<string>>(new Set());
  /** Month keys we've already retried once after AbortError (e.g. Strict Mode); avoid infinite loop. */
  const abortRetriedMonthKeysRef = useRef<Set<string>>(new Set());
  /** When onOpenInModal: 0=duration, 1=date, 2=time, 3=boat, 4=details. Each step slides on page. Ticketed starts at 1 (skips duration step). */
  const [inlineStepIndex, setInlineStepIndex] = useState(() => pricingTypeProp === "ticketed" ? 1 : 0);
  const [inlineBoats, setInlineBoats] = useState<BoatOption[]>([]);
  const [inlineBoatsLoading, setInlineBoatsLoading] = useState(false);
  const [selectedBoatInline, setSelectedBoatInline] = useState<BoatOption | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [bookingMode, setBookingMode] = useState<"shared" | "charter">(
    () => (pricingTypeProp === "ticketed" ? "shared" : "charter")
  );
  const [autoSwitchBanner, setAutoSwitchBanner] = useState(false);
  const [fetchedShowSpotsRemaining, setFetchedShowSpotsRemaining] = useState(false);

  // On listing page (onOpenInModal): charter-only experiences get bookingMode "charter" so the details step shows deposit vs full. Ticketed get "shared".
  useEffect(() => {
    if (!onOpenInModal) return;
    const ticketed = fetchedPricingType === "ticketed" || pricingTypeProp === "ticketed";
    setBookingMode(ticketed ? "shared" : "charter");
  }, [onOpenInModal, fetchedPricingType, pricingTypeProp]);

  useEffect(() => {
    if (experienceIdProp) {
      ratesLoadedFromSlug.current = false;
      setExperienceId(experienceIdProp);
      setRates([]);
      setFetchedExperience(null);
      setFetchedAddons([]);
      return;
    }
    if (!firestoreSlug) {
      setLoading(false);
      setFetchedExperience(null);
      setFetchedAddons([]);
      return;
    }
    const controller = new AbortController();
    bookingCache.fetchExperienceBySlug(firestoreSlug, controller.signal)
      .then((data) => {
        if (data?.id) {
          setExperienceId(data.id);
          if (Array.isArray(data.rates)) {
            ratesLoadedFromSlug.current = true;
            setRates(data.rates);
          }
          const exp = data.experience;
          if (exp && typeof exp.title === "string") {
            setFetchedExperience({
              title: exp.title,
              maxGuests: typeof exp.maxGuests === "number" ? exp.maxGuests : 0,
              petsMax: typeof exp.petsMax === "number" ? exp.petsMax : 0,
            });
            setFetchedPricingType(exp.pricingType ?? undefined);
            setFetchedDepartureHour(exp.pricingType === "ticketed" && typeof exp.departureHour === "number" ? exp.departureHour : undefined);
            setFetchedDepartureMinute(exp.pricingType === "ticketed" && typeof exp.departureMinute === "number" ? exp.departureMinute : undefined);
            setFetchedShowSpotsRemaining(exp.showSpotsRemaining === true);
          } else {
            setFetchedExperience(null);
            setFetchedPricingType(undefined);
          }
          if (Array.isArray(data.addons)) {
            setFetchedAddons(
              data.addons.map((a: { id?: string; name: string; description?: string; priceCents: number; type: string; maxQty?: number }) => ({
                id: a.id ?? "",
                name: a.name ?? "",
                description: a.description,
                priceCents: a.priceCents ?? 0,
                type: a.type ?? "toggle",
                maxQty: a.maxQty,
              }))
            );
          } else {
            setFetchedAddons([]);
          }
        } else {
          setFetchedExperience(null);
          setFetchedAddons([]);
        }
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === "AbortError") return;
        setFetchedExperience(null);
        setFetchedAddons([]);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [experienceIdProp, firestoreSlug]);

  // Load rates when we have experienceId (from prop or from slug resolve). Keeps prices in sync when slug response omitted rates.
  // Skip when the slug effect already supplied rates — the slug endpoint always includes them.
  useEffect(() => {
    if (!experienceId) return;
    if (ratesLoadedFromSlug.current) return;
    const controller = new AbortController();
    bookingCache.fetchExperienceRates(experienceId, controller.signal)
      .then((data) => {
        if (Array.isArray(data?.rates)) setRates(data.rates);
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name !== "AbortError") {
          // rates stay empty — UI falls back gracefully
        }
      });
    return () => controller.abort();
  }, [experienceId]);

  const isTicketed = fetchedPricingType === "ticketed";

  const departureTimeLabel = useMemo(() => {
    if (!isTicketed || fetchedDepartureHour == null) return null;
    const min = fetchedDepartureMinute ?? 0;
    const period = fetchedDepartureHour < 12 ? "AM" : "PM";
    const h12 = fetchedDepartureHour % 12 === 0 ? 12 : fetchedDepartureHour % 12;
    return `${h12}:${String(min).padStart(2, "0")} ${period}`;
  }, [isTicketed, fetchedDepartureHour, fetchedDepartureMinute]);

  const dateRange = useMemo(() => getDateRangeForMonth(calendarMonth), [calendarMonth]);

  // Clear accumulated slot state when the experience changes so stale slots never bleed through.
  // Defined before the fetch effect so React runs it first when experienceId changes.
  useEffect(() => {
    setSlots([]);
    setMonthFetchErrors({});
    fetchedMonthKeysRef.current = new Set();
    prefetchedMonthKeysRef.current = new Set();
    autoRetriedMonthKeysRef.current = new Set();
    abortRetriedMonthKeysRef.current = new Set();
  }, [experienceId]);

  // Fetch slots for the visible month only. Merges into existing state so already-seen months
  // remain in the slot collection and calendar edge-cells keep their data while navigating.
  // Mark month as fetched only on success; do not clear slots on failure so prior months stay visible.
  useEffect(() => {
    if (!experienceId) return;
    const monthKey = `${experienceId}:${toDateStr(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1)).slice(0, 7)}`;
    const alreadyFetched = fetchedMonthKeysRef.current.has(monthKey);
    currentCalendarMonthKeyRef.current = monthKey;
    if (!alreadyFetched) {
      setLoading(true);
      setMonthFetchErrors((prev) => {
        const next = { ...prev };
        delete next[monthKey];
        return next;
      });
    }
    const { start, end } = getVisibleMonthRange(calendarMonth);
    const controller = new AbortController();
    bookingCache.fetchSlots(experienceId, start, end, controller.signal)
      .then((data) => {
        const slotList = (data?.slots ?? []) as SlotDto[];
        setSlots((prev) => mergeSlots(prev, slotList));
        if (slotList.length > 0) {
          fetchedMonthKeysRef.current.add(monthKey);
        } else if (!autoRetriedMonthKeysRef.current.has(monthKey)) {
          autoRetriedMonthKeysRef.current.add(monthKey);
          window.setTimeout(() => setRetryCount((c) => c + 1), 400);
        } else {
          fetchedMonthKeysRef.current.add(monthKey);
        }
      })
      .catch((err: unknown) => {
        const name = (err as { name?: string })?.name;
        const isAbort = name === "AbortError";
        if (isAbort) {
          if (!abortRetriedMonthKeysRef.current.has(monthKey)) {
            abortRetriedMonthKeysRef.current.add(monthKey);
            window.setTimeout(() => setRetryCount((c) => c + 1), 150);
          }
        } else {
          setMonthFetchErrors((prev) => ({ ...prev, [monthKey]: true }));
        }
      })
      .finally(() => {
        if (currentCalendarMonthKeyRef.current === monthKey) setLoading(false);
      });
    return () => controller.abort();
  }, [experienceId, calendarMonth, retryCount]);

  // After the visible month loads, prefetch the previous and next months in the background so
  // navigating feels instant. Uses requestIdleCallback when available (Safari 16.4+, Chrome/Firefox),
  // falls back to a low-priority setTimeout for other environments.
  useEffect(() => {
    if (!experienceId) return;
    let idleId: number | undefined;
    let timerId: ReturnType<typeof setTimeout> | undefined;
    const controllers: AbortController[] = [];

    const doPrefetch = () => {
      for (const offset of [-1, 1]) {
        const adj = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + offset, 1);
        const adjKey = `${experienceId}:${toDateStr(new Date(adj.getFullYear(), adj.getMonth(), 1)).slice(0, 7)}`;
        if (prefetchedMonthKeysRef.current.has(adjKey)) continue;
        prefetchedMonthKeysRef.current.add(adjKey);
        const { start, end } = getVisibleMonthRange(adj);
        const ctrl = new AbortController();
        controllers.push(ctrl);
        bookingCache.fetchSlots(experienceId, start, end, ctrl.signal)
          .then((data) => {
            const incoming = (data?.slots ?? []) as SlotDto[];
            if (incoming.length > 0) setSlots((prev) => mergeSlots(prev, incoming));
          })
          .catch(() => { /* prefetch failures are non-critical */ });
      }
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = (window as Window & { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback(doPrefetch);
    } else {
      timerId = setTimeout(doPrefetch, 300);
    }

    return () => {
      if (idleId !== undefined) (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId);
      if (timerId !== undefined) clearTimeout(timerId);
      controllers.forEach((c) => c.abort());
    };
  }, [experienceId, calendarMonth]);

  // When showing inline boat step, fetch boats for this experience
  useEffect(() => {
    if (!showInlineBoatStep || !experienceId) return;
    setInlineBoatsLoading(true);
    setInlineBoats([]);
    setSelectedBoatInline(null);
    const controller = new AbortController();
    bookingCache.fetchBoats(experienceId, controller.signal)
      .then((data) => {
        if (data?.boats && Array.isArray(data.boats)) {
          const list = data.boats as BoatOption[];
          setInlineBoats(list);
          if (list.length === 1) setSelectedBoatInline(list[0]);
        } else {
          setInlineBoats([]);
        }
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name !== "AbortError") setInlineBoats([]);
      })
      .finally(() => setInlineBoatsLoading(false));
    return () => controller.abort();
  }, [showInlineBoatStep, experienceId]);

  /**
   * Single-pass derivation of all three boat-availability sets for the selected inline slot.
   * Matching on both startAt + endAt prevents cross-duration false negatives.
   */
  const { availableBoatIdsForInlineSlot, unavailableBoatIdsForInlineSlot, bookedBoatIdsForInlineSlot } = useMemo(() => {
    const empty = new Set<string>();
    if (!selectedSlotInline?.startAt || !slots.length) {
      return { availableBoatIdsForInlineSlot: empty, unavailableBoatIdsForInlineSlot: empty, bookedBoatIdsForInlineSlot: empty };
    }
    const startMs = new Date(selectedSlotInline.startAt).getTime();
    const endMs = selectedSlotInline.endAt ? new Date(selectedSlotInline.endAt).getTime() : null;
    const available = new Set<string>();
    const unavailable = new Set<string>();
    const booked = new Set<string>();
    for (const s of slots) {
      const boatId = (s as SlotDto & { boatId?: string }).boatId;
      if (!boatId) continue;
      if (new Date(s.startAt).getTime() !== startMs) continue;
      if (endMs !== null && new Date(s.endAt).getTime() !== endMs) continue;
      if (s.status === "open") available.add(boatId);
      else {
        unavailable.add(boatId);
        booked.add(boatId);
      }
    }
    return { availableBoatIdsForInlineSlot: available, unavailableBoatIdsForInlineSlot: unavailable, bookedBoatIdsForInlineSlot: booked };
  }, [selectedSlotInline?.startAt, selectedSlotInline?.endAt, slots]);

  // Fetch listing (experience) day pricing so calendar shows the same numbers as the listing page
  const rateIdForPricing = selectedDurationForModal != null ? rates.find((r) => r.durationHours === selectedDurationForModal)?.id : undefined;
  useEffect(() => {
    if (!experienceId) {
      setDatePrices({});
      setHolidayDateStrings(new Set());
      return;
    }
    const start = new Date(dateRange.start + "T00:00:00");
    const end = new Date(dateRange.end + "T00:00:00");
    const days = Math.min(90, Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1));
    const controller = new AbortController();
    bookingCache.fetchDatePrices(experienceId, dateRange.start, days, rateIdForPricing, controller.signal)
      .then((data) => {
        if (data?.prices && typeof data.prices === "object") setDatePrices(data.prices);
        else setDatePrices({});
        if (Array.isArray(data?.holidayDateStrings)) {
          setHolidayDateStrings(new Set(data.holidayDateStrings));
        } else {
          setHolidayDateStrings(new Set());
        }
        if (data?.ticketsAvailableByDate && typeof data.ticketsAvailableByDate === "object") {
          setTicketsAvailableByDate(data.ticketsAvailableByDate as Record<string, number>);
        } else {
          setTicketsAvailableByDate({});
        }
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === "AbortError") return;
        setDatePrices({});
        setHolidayDateStrings(new Set());
        setTicketsAvailableByDate({});
      });
    return () => controller.abort();
  }, [experienceId, dateRange.start, dateRange.end, rateIdForPricing]);

  // When only one rate, auto-select duration so calendar shows availability without an extra click
  useEffect(() => {
    if (rates.length === 1 && selectedDurationForModal === null) {
      setSelectedDurationForModal(rates[0].durationHours);
    }
  }, [rates, selectedDurationForModal]);

  // Declared before the useEffect below that depends on it — avoids forward-reference TDZ bug
  const goToInlineStep = useCallback(
    (step: number) => {
      setInlineStepIndex(step);
      setShowInlineBoatStep(step >= 3);
      setShowDetailsStep(step >= 4);
    },
    []
  );

  // Ticketed: skip the duration step — jump straight to the calendar (step 1)
  useEffect(() => {
    if (isTicketed && onOpenInModal && inlineStepIndex === 0) {
      goToInlineStep(1);
    }
  }, [isTicketed, onOpenInModal, goToInlineStep]);

  // Watersports / single-boat: skip the boat step — auto-assign the only boat and go to checkout
  useEffect(() => {
    if (inlineStepIndex === 3 && inlineBoats.length === 1 && !inlineBoatsLoading && onOpenInModal) {
      goToInlineStep(4);
    }
  }, [inlineStepIndex, inlineBoats.length, inlineBoatsLoading, onOpenInModal, goToInlineStep]);

  /** Single-pass derivation of slotsByDate (counts) and openSlotsByDate (open slot arrays). Ticketed: only count/list slots with spotsRemaining > 0 so sold-out times (7am, 1pm) don't appear as available. */
  const { slotsByDate, openSlotsByDate } = useMemo(() => {
    const counts = new Map<string, { open: number; held: number; booked: number; blocked: number }>();
    const openMap = new Map<string, SlotDto[]>();
    for (const s of slots) {
      const day = isoToChicagoDateStr(s.startAt);
      if (!counts.has(day)) counts.set(day, { open: 0, held: 0, booked: 0, blocked: 0 });
      const entry = counts.get(day)!;
      if (s.status === "open") {
        const soldOut = isTicketed && typeof s.spotsRemaining === "number" && s.spotsRemaining === 0;
        if (!soldOut) {
          entry.open++;
          if (!openMap.has(day)) openMap.set(day, []);
          openMap.get(day)!.push(s);
        }
      } else if (s.status === "held") entry.held++;
      else if (s.status === "booked") entry.booked++;
      else entry.blocked++;
    }
    openMap.forEach((arr) => arr.sort((a, b) => a.startAt.localeCompare(b.startAt)));
    return { slotsByDate: counts, openSlotsByDate: openMap };
  }, [slots, isTicketed]);

  const slotDataByDate = useMemo(() => {
    if (!isTicketed) return new Map<string, { spotsRemaining: number | null; spotsBooked: number | null; isCharterLocked: boolean; showSpotsRemaining: boolean }>();
    const map = new Map<string, { spotsRemaining: number | null; spotsBooked: number | null; isCharterLocked: boolean; showSpotsRemaining: boolean }>();
    for (const s of slots) {
      const dateStr = isoToChicagoDateStr(s.startAt);
      if (!map.has(dateStr)) {
        map.set(dateStr, {
          spotsRemaining: typeof s.spotsRemaining === "number" ? s.spotsRemaining : null,
          spotsBooked: typeof s.spotsBooked === "number" ? s.spotsBooked : null,
          isCharterLocked: s.isCharterLocked ?? false,
          showSpotsRemaining: s.showSpotsRemaining ?? false,
        });
      }
    }
    return map;
  }, [slots, isTicketed]);

  const selectedDateOpenSlots = useMemo(
    () => (selectedDate ? openSlotsByDate.get(selectedDate) ?? [] : []),
    [selectedDate, openSlotsByDate]
  );

  /** Group slots by start time (e.g. "11:00 AM") for cleaner modal UX. */
  const slotsGroupedByStartTime = useMemo(() => {
    const map = new Map<string, SlotDto[]>();
    for (const s of selectedDateOpenSlots) {
      const t = formatTime(s.startAt);
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(s);
    }
    map.forEach((arr) =>
      arr.sort((a, b) => (parseSlotId(a.id)?.durationHours ?? 0) - (parseSlotId(b.id)?.durationHours ?? 0))
    );
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [selectedDateOpenSlots]);

  /** For time modal (step-3 style): slots for selected date filtered by selected duration. */
  const slotsForModalDuration = useMemo(() => {
    if (selectedDurationForModal == null) return [];
    return selectedDateOpenSlots.filter((s) => parseSlotId(s.id)?.durationHours === selectedDurationForModal);
  }, [selectedDateOpenSlots, selectedDurationForModal]);

  /** Unique start times for selected duration (for step-3 style time list). */
  const timeOptionsForModal = useMemo(() => {
    const seen = new Set<string>();
    const out: { timeLabel: string; slot: SlotDto }[] = [];
    for (const s of slotsForModalDuration) {
      const t = formatTime(s.startAt);
      if (seen.has(t)) continue;
      seen.add(t);
      out.push({ timeLabel: t, slot: s });
    }
    out.sort((a, b) => a.slot.startAt.localeCompare(b.slot.startAt));
    return out;
  }, [slotsForModalDuration]);

  const todayStr = useMemo(() => toDateStr(new Date()), []);
  const monthLabel = calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const currentMonthKey = experienceId
    ? `${experienceId}:${toDateStr(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1)).slice(0, 7)}`
    : "";
  const monthFetchErrorForKey = !!monthFetchErrors[currentMonthKey];
  const onRetryMonthFetch = useCallback(() => {
    if (!currentMonthKey) return;
    fetchedMonthKeysRef.current.delete(currentMonthKey);
    setMonthFetchErrors((prev) => {
      const next = { ...prev };
      delete next[currentMonthKey];
      return next;
    });
    setRetryCount((c) => c + 1);
  }, [currentMonthKey]);

  /** Compact step-2-style calendar grid (leading blanks + days). Used when onOpenInModal. */
  const step2CompactGrid = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const monthZeroBased = calendarMonth.getMonth();
    const dateOptions = getDaysInMonth(year, monthZeroBased);
    const first = new Date(year, monthZeroBased, 1);
    const leadingBlanks = first.getDay();
    return [...Array(leadingBlanks).fill(null), ...dateOptions];
  }, [calendarMonth]);

  /** For compact grid: open slot count per date for the selected duration. */
  const openCountByDateForDuration = useMemo(() => {
    if (selectedDurationForModal == null) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const s of slots) {
      if (s.status !== "open") continue;
      const dur = parseSlotId(s.id)?.durationHours;
      if (dur !== selectedDurationForModal) continue;
      const day = isoToChicagoDateStr(s.startAt);
      map.set(day, (map.get(day) ?? 0) + 1);
    }
    return map;
  }, [slots, selectedDurationForModal]);

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
      available: boolean;
      openCount: number;
      bookedCount: number;
      heldCount: number;
      blockedCount: number;
      openSlots: SlotDto[];
    }[] = [];
    const pushCell = (
      dateStr: string,
      day: number,
      isCurrentMonth: boolean,
      isPast: boolean
    ) => {
      const entry = slotsByDate.get(dateStr);
      const openCount = entry?.open ?? 0;
      // Ticketed: booked count is in slotDataByDate.spotsBooked; charter uses entry.booked
      const bookedCount = isTicketed
        ? (slotDataByDate.get(dateStr)?.spotsBooked ?? 0)
        : (entry?.booked ?? 0);
      const heldCount = entry?.held ?? 0;
      const blockedCount = entry?.blocked ?? 0;
      cells.push({
        dateStr,
        day,
        isCurrentMonth,
        isPast,
        available: openCount > 0,
        openCount,
        bookedCount,
        heldCount,
        blockedCount,
        openSlots: openSlotsByDate.get(dateStr) ?? [],
      });
    };
    for (let i = 0; i < startPad; i++) {
      const d = new Date(year, month, 1 - (startPad - i));
      pushCell(toDateStr(d), d.getDate(), false, toDateStr(d) < todayStr);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      pushCell(dateStr, day, true, dateStr < todayStr);
    }
    const remaining = totalCells - cells.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      pushCell(toDateStr(d), d.getDate(), false, true);
    }
    return cells;
  }, [calendarMonth, slotsByDate, openSlotsByDate, todayStr, isTicketed, slotDataByDate]);

  const goPrevMonth = () => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const goNextMonth = () => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  const goToToday = () => {
    const d = new Date();
    setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  const handleDayClick = (dateStr: string) => {
    setSelectedDate(dateStr);
    // Ticketed: fixed departure time — skip time/boat steps and open modal directly
    if (isTicketed && onOpenInModal) {
      const slotData = slotDataByDate.get(dateStr);
      if (bookingMode === "shared" && slotData?.spotsRemaining === 0) {
        if (slotData.isCharterLocked) return; // fully blocked — do nothing
        // Auto-switch to charter
        setBookingMode("charter");
        setAutoSwitchBanner(true);
        // Fall through to proceed with date selection in charter mode
      }
      const openSlots = openSlotsByDate.get(dateStr) ?? [];
      if (openSlots.length > 0) {
        onOpenInModal({
          date: dateStr,
          slotId: openSlots[0].id,
          experienceId: experienceId ?? undefined,
          experienceSlug: experienceSlug ?? undefined,
          pricingType: "ticketed",
        });
      }
      return;
    }
    if (onOpenInModal) {
      setSelectedSlotInline(null);
      return;
    }
    if (onSelectSlot) {
      setSelectedDurationForModal(null);
      setSlotModalOpen(true);
      return;
    }
    if (onSelectDate) onSelectDate(dateStr);
    else document.getElementById("availability")?.scrollIntoView({ behavior: "smooth" });
  };

  const hasAnyAvailability = useMemo(
    () => Array.from(slotsByDate.entries()).some(([dateStr, v]) => v.open > 0 && dateStr >= todayStr),
    [slotsByDate, todayStr]
  );

  const didFetchSlots = !!experienceId;
  const noAvailabilityBecauseNotSetUp = !experienceId && !!firestoreSlug && !loading;

  const selectedDateLabel = selectedDate
    ? new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
    : "";

  /** When onOpenInModal and loading by firestoreSlug, use fetched experience/addons for inline details step so all steps stay on page. */
  const effectiveExperienceForDetails = experienceForDetails ?? (onOpenInModal && experienceId && fetchedExperience ? { id: experienceId, title: fetchedExperience.title, maxGuests: fetchedExperience.maxGuests, petsMax: fetchedExperience.petsMax } : undefined);
  const effectiveRatesForDetails = ratesForDetails ?? (onOpenInModal && rates.length > 0 ? rates : undefined);
  const effectiveAddonsForDetails = addonsForDetails ?? (onOpenInModal ? fetchedAddons : undefined);
  const hasInlineDetails = !!(effectiveExperienceForDetails && effectiveRatesForDetails && effectiveAddonsForDetails !== undefined);
  /** When onOpenInModal: 5 (or 4) steps slide one-by-one; else 3 (or 2) panels (duration+date+time | boat | details). */
  const slidingPanelCount = onOpenInModal ? (hasInlineDetails ? 5 : 4) : hasInlineDetails ? 3 : 2;
  const slidingPanelIndex = onOpenInModal ? inlineStepIndex : showDetailsStep ? 2 : showInlineBoatStep ? 1 : 0;

  const inlineDetailsRate = useMemo(() => {
    if (!selectedDate || !selectedSlotInline || !effectiveExperienceForDetails) return null;
    const rateList = effectiveRatesForDetails ?? rates;
    const dur = parseSlotId(selectedSlotInline.id)?.durationHours ?? selectedDurationForModal;
    const rate = (dur != null ? rateList.find((r) => r.durationHours === dur) : null) ?? rateList[0];
    return rate ?? null;
  }, [selectedDate, selectedSlotInline, effectiveExperienceForDetails, effectiveRatesForDetails, rates, selectedDurationForModal]);
  const inlineDetailsStepReady = !!(inlineDetailsRate && effectiveAddonsForDetails !== undefined);

  // Fixed heights per step for listing-page 5-step flow so the card fits correctly at each step.
  const STEP_HEIGHTS = [320, 460, 380, 420, 640] as const; // duration, calendar, time, boat, details (outer box fits calendar + buttons)
  useLayoutEffect(() => {
    if (!onOpenInModal) return;
    const stepIndex = slidingPanelIndex;
    if (stepIndex >= 0 && stepIndex < STEP_HEIGHTS.length) {
      setInlineBookingHeight(STEP_HEIGHTS[stepIndex]);
      return;
    }
    setInlineBookingHeight(null);
  }, [onOpenInModal, slidingPanelIndex]);

  // Stable reference — must be declared before any early return to satisfy Rules of Hooks
  const handleSetBookingMode = useCallback((mode: "shared" | "charter") => {
    setBookingMode(mode);
    setAutoSwitchBanner(false);
  }, []);

  if (!experienceIdProp && !firestoreSlug) return null;

  const viewProps = {
    darkCard,
    className,
    onOpenInModal,
    inlineBookingHeight,
    slidingPanelIndex,
    slidingPanelCount,
    panel1Ref,
    panel2Ref,
    panel3Ref,
    panel4Ref,
    panel5Ref,
    inlineStepIndex,
    goToInlineStep,
    rates,
    loading,
    selectedDurationForModal,
    setSelectedDurationForModal,
    setSelectedSlotInline,
    monthLabel,
    goToToday,
    goPrevMonth,
    goNextMonth,
    step2CompactGrid,
    selectedDate,
    openCountByDateForDuration,
    slotsByDate,
    slotsLength: slots.length,
    datePrices,
    holidayDateStrings,
    todayStr,
    handleDayClick,
    selectedSlotInline,
    timeOptionsForModal,
    setShowInlineBoatStep,
    noAvailabilityBecauseNotSetUp,
    didFetchSlots,
    hasAnyAvailability,
    monthFetchErrorForKey,
    onRetryMonthFetch,
    inlineBoatsLoading,
    inlineBoats,
    availableBoatIdsForInlineSlot,
    unavailableBoatIdsForInlineSlot,
    bookedBoatIdsForInlineSlot,
    selectedBoatInline,
    setSelectedBoatInline,
    experienceForDetails: effectiveExperienceForDetails,
    ratesForDetails: effectiveRatesForDetails,
    addonsForDetails: effectiveAddonsForDetails ?? [],
    experienceId,
    experienceSlug,
    showDetailsStep,
    setShowDetailsStep,
    inlineDetailsRate,
    inlineDetailsStepReady,
    hasInlineDetails,
    calendarMonth,
    setCalendarMonth,
    setSelectedDate,
    calendarDays,
    slotModalOpen,
    setSlotModalOpen,
    selectedDateLabel,
    directCheckout,
    directDiscountCode,
    setDirectDiscountCode,
    directCheckoutLoading,
    setDirectCheckoutLoading,
    directCheckoutError,
    setDirectCheckoutError,
    bookHref,
    isTicketed,
    departureTimeLabel,
    ticketsAvailableByDate,
    bookingMode,
    setBookingMode: handleSetBookingMode,
    autoSwitchBanner,
    setAutoSwitchBanner,
    showSpotsRemaining: fetchedShowSpotsRemaining,
    slotDataByDate,
  };
  return React.createElement(ExperienceCalendarSectionView, viewProps);
}
