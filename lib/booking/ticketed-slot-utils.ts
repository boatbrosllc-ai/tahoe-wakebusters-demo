/**
 * Shared ticketed-slot logic used by both slots API and create-hold so slot generation
 * and validation use identical defaults (departure hour/minute, trip duration).
 */
import { getSlugForBoatTypeFilter, isTicketedExperienceSlug } from "@/lib/booking/experience-aliases";
import { inferSlugFromTitle } from "@/lib/booking/experience-aliases";
import { getWeekdayInSlotTimezone, type ParsedSlotId } from "@/lib/booking/experience-slots";
import type { ExperienceRate } from "@/lib/booking/types";

export type ExperienceForTicketed = {
  slug?: string;
  title?: string;
  name?: string;
  pricingType?: "charter" | "ticketed";
  departureHour?: number;
  departureMinute?: number;
  tripDurationHours?: number;
  /** When set and non-empty, departures only on these weekdays (0=Sun … 6=Sat) in America/Chicago. */
  ticketedWeekdays?: number[];
  defaultRateId?: string;
  id?: string;
};

/** Normalize admin/client input: unique integers 0–6, sorted. */
export function normalizeTicketedWeekdaysInput(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const nums = raw.filter((x): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 6);
  return Array.from(new Set(nums)).sort((a, b) => a - b);
}

/** Persist only when 1–6 distinct weekdays; empty or all seven means “every day” (omit field). */
export function ticketedWeekdaysForFirestore(arr: number[] | undefined): number[] | undefined {
  if (!arr || arr.length === 0 || arr.length >= 7) return undefined;
  return arr;
}

/** True if this calendar date is allowed for ticketed departures given optional weekday restriction. */
export function isTicketedOperatingDate(dateStr: string, ticketedWeekdays?: number[] | null | unknown): boolean {
  const normalized = normalizeTicketedWeekdaysInput(ticketedWeekdays);
  const w = ticketedWeekdaysForFirestore(normalized);
  if (w == null) return true;
  return w.includes(getWeekdayInSlotTimezone(dateStr));
}

/** Accepts Firestore QueryDocumentSnapshot-like or { id, data() } so slots and create-hold can pass .docs. */
export type RateDocLike = { id: string; data: () => unknown };

/**
 * Stable order for rate docs so slots API and create-hold always get the same "first" rate
 * when falling back to first active rate's duration (Firestore query order is undefined).
 */
function stableRates(rates: RateDocLike[]): RateDocLike[] {
  return [...rates].sort((a, b) => a.id.localeCompare(b.id));
}

function getDurationHours(d: RateDocLike): number | undefined {
  const raw = d.data();
  return typeof raw === "object" && raw !== null && "durationHours" in raw
    ? (raw as { durationHours?: number }).durationHours
    : undefined;
}

/**
 * Resolve trip duration for ticketed experiences using the same precedence as slots API:
 * experience.tripDurationHours → defaultRateId rate's durationHours → first active rate's durationHours (by id) → 1.
 */
export function resolveTicketedTripDuration(
  experience: ExperienceForTicketed,
  rates: RateDocLike[]
): number {
  const sorted = stableRates(rates);
  const tripHours = experience.tripDurationHours;
  if (typeof tripHours === "number" && tripHours > 0) return tripHours;
  if (experience.defaultRateId && sorted.length > 0) {
    const defaultRate = sorted.find((d) => d.id === experience.defaultRateId);
    const dur = defaultRate ? getDurationHours(defaultRate) : undefined;
    if (typeof dur === "number" && dur > 0) return dur;
  }
  if (sorted.length > 0) {
    const first = getDurationHours(sorted[0]);
    if (typeof first === "number" && first > 0) return first;
  }
  return 1;
}

/**
 * Compute departure hour/minute and trip duration for ticketed validation.
 * Uses getSlugForBoatTypeFilter + isTicketedExperienceSlug for slug-based default when
 * pricingType is not set; when pricingType === 'ticketed', use 19 as default hour.
 */
export function getTicketedDepartureAndDuration(
  experience: ExperienceForTicketed,
  rates: RateDocLike[]
): { deptHour: number; deptMinute: number; tripDuration: number } {
  const sorted = stableRates(rates);
  const experienceSlug = (typeof experience.slug === "string" ? experience.slug.trim() : "").toLowerCase();
  const inferredSlugFromTitle = inferSlugFromTitle(experience.title ?? (experience as { name?: string }).name);
  const slugForBoatType = getSlugForBoatTypeFilter(
    experienceSlug,
    inferredSlugFromTitle,
    experience.id ?? "",
    experience.title ?? (experience as { name?: string }).name
  ).toLowerCase();
  const isTicketedBySlug = isTicketedExperienceSlug(slugForBoatType);
  // Primary: explicit doc field. Then: pricingType === 'ticketed' → 19; else slug-based default (19 for sunset/holiday family, 10 otherwise).
  const rawDeptHour = experience.departureHour;
  const rawDeptMinute = experience.departureMinute;
  const deptHour =
    typeof rawDeptHour === "number" && Number.isInteger(rawDeptHour)
      ? rawDeptHour
      : experience.pricingType === "ticketed"
        ? 19
        : experience.pricingType == null && isTicketedBySlug
          ? 19
          : 10;
  const deptMinute =
    typeof rawDeptMinute === "number" && Number.isInteger(rawDeptMinute) ? rawDeptMinute : 0;
  const tripDuration = resolveTicketedTripDuration(experience, sorted);
  return { deptHour, deptMinute, tripDuration };
}

/**
 * Validate that a parsed slot ID matches the experience's ticketed departure and duration.
 * Returns true if valid, false otherwise (caller should return 400 and log).
 */
export function validateTicketedSlotParsed(
  parsed: ParsedSlotId,
  deptHour: number,
  deptMinute: number,
  tripDuration: number,
  rateDuration: number | undefined
): boolean {
  const durationMatch =
    parsed.durationHours === tripDuration ||
    (rateDuration != null && parsed.durationHours === rateDuration);
  return (
    parsed.startHour === deptHour &&
    parsed.startMinute === deptMinute &&
    durationMatch
  );
}
