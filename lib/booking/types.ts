/**
 * Firestore document types for the booking engine.
 * Matches the data model spec exactly.
 * Timestamp is Firestore's Timestamp (seconds + nanoseconds).
 */
export interface FirestoreTimestamp {
  seconds: number;
  nanoseconds: number;
  toDate?: () => Date;
}

// ---------------------------------------------------------------------------
// Boats (legacy: standalone boat with own slots)
// ---------------------------------------------------------------------------

export interface Boat {
  name: string;
  timezone: string;
  capacityMax: number;
  petsMax: number;
  defaultLocationText: string;
  cancellationPolicyText: string;
  active: boolean;
}

// ---------------------------------------------------------------------------
// Listing boats (assigned to experiences; use experience slots + boat rates)
// Stored in same boats collection; has experienceIds and photos.
// ---------------------------------------------------------------------------

/** Custom price for a date range (overrides weekday/weekend/holiday for this boat). */
export interface BoatPriceOverride {
  startDate: string; // YYYY-MM-DD
  endDate: string;
  /** If set, applies only to this duration; if omitted, applies to all rates for this boat in the range. */
  durationHours?: number;
  priceCents: number;
}

export interface ListingBoat {
  name: string;
  slug?: string;
  description?: string;
  /** Photo URLs for gallery/booking picker */
  photos: string[];
  active: boolean;
  /** Experience document IDs this boat is available for */
  experienceIds: string[];
  /** True for admin-created boats tied to experiences (vs legacy standalone boats) */
  isListingBoat?: true;
  /** Custom prices for specific date ranges (e.g. "March 10–19 = $499"). Checked before weekday/weekend/holiday. */
  priceOverrides?: BoatPriceOverride[];
  /** Boat type for the pricing calendar (e.g. "pontoon", "wake", "tritoon"). Calendar overrides apply by boat type. */
  boatType?: string;
}

/** Calendar override: one doc per boatType, field rates = { [date YYYY-MM-DD]: hourlyRateCents }. Overrides always win. */
export type PricingCalendarRates = Record<string, number>;

/** Boat rate for listing boats — availability only (duration + display). Price comes from the experience (listing). Subcollection boats/{boatId}/rates */
export interface BoatRate {
  durationHours: number;
  displayName: string;
  /** @deprecated Pricing is on the listing (experience). Kept for backward compat; may be absent. */
  priceCents?: number;
  priceWeekendCents?: number;
  priceHolidayCents?: number;
  active: boolean;
}

// ---------------------------------------------------------------------------
// Experiences (collection: experiences/{experienceId})
// ---------------------------------------------------------------------------

export interface ExperienceLocation {
  title: string;
  addressText: string;
  notes?: string;
}

export interface ExperienceCancellationPolicy {
  freeCancelDays: number;
  partialRefundDaysStart: number;
  partialRefundDaysEnd: number;
  noRefundWithinDays: number;
  fullText: string;
}

export interface ExperienceSeasonal {
  enabled: boolean;
  startMonth?: number; // 1-12
  endMonth?: number;
}

export interface ExperienceTestimonial {
  name: string;
  quote: string;
  date?: string;
}

export interface Experience {
  id?: string;
  slug: string; // pontoon | watersports | sunset | holiday
  title: string;
  subtitle: string;
  descriptionLong: string;
  heroMedia: { type: "image" | "video"; url: string };
  gallery: string[];
  location: ExperienceLocation;
  maxGuests: number;
  petsMax: number;
  included: string[];
  whatToBring: string[];
  rules: string[];
  cancellationPolicy: ExperienceCancellationPolicy;
  faqs: { q: string; a: string }[];
  seasonal: ExperienceSeasonal;
  active: boolean;
  timezone?: string;
  // Display & SEO (optional – for badass listing pages)
  heroOverlayText?: string;
  promoVideoUrl?: string;
  metaTitle?: string;
  metaDescription?: string;
  ctaButtonText?: string;
  cancellationSummary?: string;
  testimonials?: ExperienceTestimonial[];
  featured?: boolean;
  spotsLeftOverride?: number;
  defaultRateId?: string;
  bookingPosition?: "sidebar" | "inline" | "modal";
  galleryAltTexts?: string[];
  /** Date ranges when holiday pricing applies (e.g. July 4, Memorial Day) */
  holidayDates?: ExperienceHolidayDate[];
  /** Day numbers (0=Sun … 6=Sat) that use weekend pricing. Default [0, 6] = Sat–Sun. e.g. [0, 5, 6] = Fri–Sun. */
  weekendDays?: number[];
  /** Display order on website (lower = first). Default undefined = last. */
  sortOrder?: number;
}

// Rates (subcollection experiences/{experienceId}/rates/{rateId}) — spec uses priceCents
export interface ExperienceRate {
  durationHours: number;
  displayName: string;
  priceCents: number;
  /** Weekend price (Sat/Sun); falls back to priceCents if unset */
  priceWeekendCents?: number;
  /** Holiday price; falls back to priceWeekendCents or priceCents if unset */
  priceHolidayCents?: number;
  active: boolean;
}

/** Date range when holiday/special pricing applies (stored on experience doc) */
export interface ExperienceHolidayDate {
  label?: string;
  start: string; // ISO date YYYY-MM-DD
  end: string;
  /** If true, range repeats every year (compare month-day only) */
  recurring?: boolean;
  /** Optional single price in cents for this range (all durations); overrides rate.priceHolidayCents when set */
  priceCents?: number;
  /** Per-duration price overrides (durationHours -> cents). Takes precedence over priceCents when set for a given duration. */
  priceCentsByDuration?: Record<number, number>;
}

// Addons (subcollection experiences/{experienceId}/addons/{addonId})
export interface ExperienceAddon {
  name: string;
  description?: string;
  priceCents: number;
  type: "toggle" | "quantity" | "tip";
  active: boolean;
  maxQty?: number;
  /** If true, show addon more prominently (e.g. damage waiver) */
  highlight?: boolean;
}

// Slots (subcollection experiences/{experienceId}/slots/{slotId}) — same shape as boats slots

// ---------------------------------------------------------------------------
// Rates (subcollection boats/{boatId}/rates/{rateId})
// ---------------------------------------------------------------------------

export interface Rate {
  durationHours: number;
  basePriceCents: number;
  active: boolean;
  displayName: string;
}

// ---------------------------------------------------------------------------
// Addons (subcollection boats/{boatId}/addons/{addonId})
// ---------------------------------------------------------------------------

export interface Addon {
  name: string;
  priceCents: number;
  type: "toggle" | "quantity";
  maxQty?: number;
  active: boolean;
}

export interface AddonSelection {
  addonId: string;
  qty: number;
}

// ---------------------------------------------------------------------------
// Slots (subcollection boats/{boatId}/slots/{slotId})
// ---------------------------------------------------------------------------

export type SlotStatus = "open" | "held" | "booked" | "blocked";

export interface Slot {
  startAt: FirestoreTimestamp;
  endAt: FirestoreTimestamp;
  status: SlotStatus;
  holdId: string | null;
  bookingId: string | null;
  updatedAt: FirestoreTimestamp;
}

// ---------------------------------------------------------------------------
// Holds (top-level collection holds/{holdId})
// ---------------------------------------------------------------------------

export interface CustomerDraft {
  name: string;
  email: string;
  phone: string;
}

export type HoldStatus = "active" | "expired" | "converted";

export interface Hold {
  boatId?: string; // legacy
  experienceId?: string;
  slotId: string;
  rateId: string;
  addonSelections: AddonSelection[];
  partySize: number;
  petsCount: number;
  answers: Record<string, string>;
  customerDraft: CustomerDraft;
  marketingOptIn: boolean;
  status: HoldStatus;
  expiresAt: FirestoreTimestamp;
  createdAt: FirestoreTimestamp;
  checkoutSessionId?: string;
  /** Optional tip (20% when "Tip now" selected). In cents. */
  tipCents?: number;
}

// ---------------------------------------------------------------------------
// Bookings (top-level collection bookings/{bookingId})
// ---------------------------------------------------------------------------

export interface Customer {
  name: string;
  email: string;
  phone: string;
}

export interface BookingPricing {
  subtotalCents: number;
  taxCents: number;
  feesCents: number;
  totalCents: number;
  currency: string;
}

export type BookingStatus = "paid" | "canceled" | "refunded";

export interface Booking {
  boatId?: string;
  experienceId?: string;
  slotId: string;
  rateId: string;
  addonSelections: AddonSelection[];
  partySize: number;
  petsCount: number;
  answers: Record<string, string>;
  customer: Customer;
  marketingOptIn?: boolean;
  /** Special requests / notes from Stripe Checkout custom field (optional). */
  specialNotes?: string;
  pricing: BookingPricing;
  status: BookingStatus;
  stripe: {
    checkoutSessionId?: string;
    paymentIntentId?: string;
    /** Amount charged in Stripe (cents) – for reconciliation with Stripe dashboard */
    amountTotalCents?: number;
    currency?: string;
  };
  createdAt: FirestoreTimestamp;
}

// ---------------------------------------------------------------------------
// API request/response shapes
// ---------------------------------------------------------------------------

export interface CreateHoldInput {
  boatId?: string;
  experienceId?: string;
  slotId: string;
  rateId: string;
  addonSelections: AddonSelection[];
  partySize: number;
  petsCount: number;
  answers: Record<string, string>;
  customerDraft: CustomerDraft;
  marketingOptIn: boolean;
  /** Optional tip in cents (e.g. 20% when "Tip now" selected). */
  tipCents?: number;
}

export interface CreateHoldResponse {
  holdId: string;
  expiresAt: string; // ISO
  pricing: BookingPricing;
}

export interface CreateCheckoutSessionInput {
  holdId: string;
}

export interface CreateCheckoutSessionResponse {
  url: string;
  sessionId: string;
}
