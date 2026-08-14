import { brand } from "@/content/brand";
/**
 * Cabo fishing calendar structure.
 *
 * Season cells start as `null` (pending verification from Nasty trip data).
 * Do not invent catch rates. Ops fills levels as real reports accumulate.
 *
 * Level meaning once verified:
 * - 1 = occasional / possible
 * - 2 = often in play
 * - 3 = historically strong window (still not a guarantee)
 */

export type SeasonLevel = 1 | 2 | 3 | null;

export type CalendarSpecies = {
  id: string;
  name: string;
  href?: string;
  /** Jan=0 … Dec=11 — null = pending Nasty verification */
  months: SeasonLevel[];
  note?: string;
};

export const CALENDAR_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const pendingYear = (): SeasonLevel[] => Array.from({ length: 12 }, () => null);

export const fishingCalendarSpecies: CalendarSpecies[] = [
  {
    id: "striped-marlin",
    name: "Striped marlin",
    href: "/cabo-marlin-fishing",
    months: pendingYear(),
    note: "Cabo’s signature billfish — fill from trip reports.",
  },
  {
    id: "blue-marlin",
    name: "Blue marlin",
    href: "/cabo-marlin-fishing",
    months: pendingYear(),
  },
  {
    id: "black-marlin",
    name: "Black marlin",
    href: "/cabo-marlin-fishing",
    months: pendingYear(),
  },
  {
    id: "dorado",
    name: "Dorado (mahi)",
    months: pendingYear(),
  },
  {
    id: "yellowfin",
    name: "Yellowfin tuna",
    months: pendingYear(),
  },
  {
    id: "wahoo",
    name: "Wahoo",
    months: pendingYear(),
  },
  {
    id: "roosterfish",
    name: "Roosterfish",
    href: "/cabo-roosterfish-fishing",
    months: pendingYear(),
    note: "Inshore-oriented — different plan than offshore marlin days.",
  },
  {
    id: "sailfish",
    name: "Sailfish",
    months: pendingYear(),
  },
];

export const CALENDAR_VERIFICATION_NOTE =
  `Month-by-month ratings are pending verification from ${brand.companyName} trip reports. The grid is ready for first-party data — we do not invent peak months. Use Best Time to Fish Cabo for planning questions while this fills in; your captain sets the daily plan from live conditions.`;
