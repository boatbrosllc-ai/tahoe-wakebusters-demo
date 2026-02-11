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
}

/** Boat rate for listing boats — same shape as ExperienceRate (priceCents). Subcollection boats/{boatId}/rates */
export interface BoatRate {
  durationHours: number;
  displayName: string;
  priceCents: number;
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
}

// Rates (subcollection experiences/{experienceId}/rates/{rateId}) — spec uses priceCents
export interface ExperienceRate {
  durationHours: number;
  displayName: string;
  priceCents: number;
  active: boolean;
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
