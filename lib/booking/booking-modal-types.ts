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
