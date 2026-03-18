/**
 * Shared types for BookingModal step components.
 * Re-exported or mirrored from BookingModal so step components can be typed without importing from the modal.
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
