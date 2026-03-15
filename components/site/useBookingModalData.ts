/**
 * Data-fetching hook for BookingModal.
 * Owns experiences, boats, rates, slots, date prices, ticket counts, and effective pricing.
 * Extract remaining useEffect fetch logic from BookingModal into this hook so the modal
 * only handles step state and payment orchestration.
 *
 * TODO: Move all fetch useEffects from BookingModal here and return loaded data + loading/error states.
 */
import { useState, useRef, useMemo, useEffect } from "react";
import * as bookingCache from "@/lib/booking/booking-data-cache";

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

export function useBookingModalData(
  open: boolean,
  initialSelection: BookingModalInitialSelection | null,
  selectionKey: number
) {
  const [experiences, setExperiences] = useState<ExperienceItem[] | null>(null);
  const [experiencesLoadError, setExperiencesLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [boats, setBoats] = useState<BoatOption[]>([]);
  const [boatsLoading, setBoatsLoading] = useState(false);
  const [experienceRates, setExperienceRates] = useState<RateOption[]>([]);
  const [monthSlots, setMonthSlots] = useState<SlotDto[]>([]);
  const [slotsLoadError, setSlotsLoadError] = useState<string | null>(null);
  const [datePrices, setDatePrices] = useState<Record<string, number>>({});
  const [datePricesLoading, setDatePricesLoading] = useState(false);
  const [ticketsAvailableByDate, setTicketsAvailableByDate] = useState<Record<string, number>>({});
  const [ratesSummary, setRatesSummary] = useState<bookingCache.CachedRateOption[] | null>(null);
  const [ratesLoadError, setRatesLoadError] = useState<string | null>(null);
  const viewMonthForPrefetchRef = useRef<{ viewMonthStartStr: string; daysInViewMonth: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
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

  return {
    experiences,
    setExperiences,
    experiencesLoadError,
    loading,
    boats,
    setBoats,
    boatsLoading,
    setBoatsLoading,
    experienceRates,
    setExperienceRates,
    monthSlots,
    setMonthSlots,
    slotsLoadError,
    setSlotsLoadError,
    datePrices,
    setDatePrices,
    datePricesLoading,
    setDatePricesLoading,
    ticketsAvailableByDate,
    setTicketsAvailableByDate,
    ratesSummary,
    setRatesSummary,
    ratesLoadError,
    setRatesLoadError,
    viewMonthForPrefetchRef,
  };
}
