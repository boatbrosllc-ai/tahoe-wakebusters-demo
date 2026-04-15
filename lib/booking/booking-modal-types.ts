/**
 * Canonical types for the booking modal (BookingModal, useBookingModalData, steps, context, BookingPageClient).
 * Import from here for end-to-end consistency.
 */

export interface ExperienceItem {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  heroMedia: { type: "image" | "video"; url: string };
  /** Listing gallery URLs (subset from API) for card thumbnails when hero is not a still image. */
  gallery?: string[];
  /** CSS object-position for step-1 category thumbnails. */
  listingCardImagePosition?: string;
  maxGuests: number;
  petsMax: number;
  fromPriceCents: number | null;
  active: boolean;
  pricingType?: "charter" | "ticketed";
  maxCapacity?: number;
  departureHour?: number;
  departureMinute?: number;
  allowDeposit?: boolean;
  allowTipNow?: boolean;
  allowTipLater?: boolean;
  seasonal?: {
    enabled?: boolean;
    startMonth?: number;
    endMonth?: number;
    startDate?: string;
    endDate?: string;
  };
}

export interface BoatOption {
  id: string;
  name: string;
  slug?: string;
  /** From listings API; used for wakeboard charter Step 2 slot scoping. */
  boatType?: string;
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
  /** When present, used to dedupe calendar “booked” tallies when one booking fans out per boat. */
  bookingId?: string | null;
  spotsBooked?: number;
  spotsRemaining?: number;
  /** Ticketed: holds query failed for this date — capacity may be understated; show uncertain styling. */
  holdDataMissing?: boolean;
  /**
   * Charter admin grid: when a shorter-duration row is marked booked because a longer trip overlaps it,
   * this is the booking's true duration (from the booking's slot id). Prefer over parsing `id` for labels.
   */
  bookingDurationHours?: number;
  /** True when a missing booking.boatId forced conservative cross-boat blocking for this slot row. */
  unresolvedBoatId?: boolean;
}

export interface RateOption {
  id: string;
  durationHours: number;
  displayName: string;
  priceCents: number;
  priceWeekendCents?: number;
  priceFriSunCents?: number;
  priceHolidayCents?: number;
}

export interface AddonOption {
  id: string;
  name: string;
  description?: string;
  priceCents: number;
  type: string;
  maxQty?: number;
  highlight?: boolean;
  /** When true (set in Firestore), hide from customer booking UIs (replaces fragile name-based filtering). */
  hiddenFromBookingUI?: boolean;
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
  /** When opening from listing preview — selects matching rate duration on the calendar. */
  durationHours?: number;
  /** Guest or ticket count to pre-fill step 4. */
  partySize?: number;
}
