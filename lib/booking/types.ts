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
  /** Historical slugs for redirect/fallback lookup. */
  previousSlugs?: string[];
  description?: string;
  /** Photo URLs for gallery/booking picker */
  photos: string[];
  /** Optional CSS `object-position` for boat cards (first photo). */
  listingCardImagePosition?: string;
  active: boolean;
  /** Experience document IDs this boat is available for */
  experienceIds: string[];
  /** True for admin-created boats tied to experiences (vs legacy standalone boats) */
  isListingBoat?: true;
  /** Custom prices for specific date ranges (e.g. "March 10–19 = $499"). Checked before weekday/weekend/holiday. */
  priceOverrides?: BoatPriceOverride[];
  /** Boat type for the pricing calendar (e.g. "pontoon", "wake", "tritoon"). Calendar overrides apply by boat type. */
  boatType?: string;
  /**
   * When set, only these start times are bookable for this boat (e.g. wakeboard: 9, 9:30, 10, 10:30, 3pm, 3:30pm, 4pm).
   * Omit for default hourly grid. Each entry: { hour: 0–23, minute: 0 | 30 } in America/Mazatlan.
   */
  allowedStartTimes?: { hour: number; minute: number }[];
  /** Optional custom line under the boat name on the public boat page (e.g. "Lake Austin tritoon rental · Captain included"). */
  heroSubtitle?: string;
  /** Max guests for display and generated description (e.g. "up to 6 guests"). Defaults to 6 when omitted. */
  capacity?: number;
  /** Optional color for admin calendar (hex e.g. "#14b8a6"). When set, calendar uses this for the boat. */
  color?: string;
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

/**
 * Customer-facing confirmation/reminder copy that varies by experience.
 * Pickup title, address, and dock notes stay on {@link ExperienceLocation}.
 * Empty optional strings are omitted from emails.
 */
export interface ExperienceConfirmationEmail {
  /** Park/entrance/parking fee instructions. Omit to hide the fee row. */
  entranceFeeText?: string;
  /** e.g. arrive 10–15 minutes before departure. */
  arrivalInstructions?: string;
  /** Lake/boat rules for the email (may differ from listing `rules`). */
  rulesText?: string;
  /** Captain gratuity reminder. */
  gratuityText?: string;
  /** Extra experience-specific notes. */
  additionalNotes?: string;
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
  /** Month-based window (e.g. Nov–Jan). Ignored when startDate/endDate are set. */
  startMonth?: number; // 1-12
  endMonth?: number;
  /** Optional specific date range (YYYY-MM-DD). When both set, only slots on dates in [startDate, endDate] are allowed. */
  startDate?: string;
  endDate?: string;
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
  /** Optional CSS `object-position` for the listing detail hero image (e.g. `center 30%`). */
  heroImagePosition?: string;
  /** Optional CSS `object-position` for homepage / grid listing cards (cover image). */
  listingCardImagePosition?: string;
  gallery: string[];
  location: ExperienceLocation;
  /** Per-experience confirmation/reminder logistics copy (arrival, rules, gratuity). */
  confirmationEmail?: ExperienceConfirmationEmail;
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
  /** Day numbers (0=Sun … 6=Sat) that use weekend pricing (e.g. [6] = Saturday only). */
  weekendDays?: number[];
  /** Day numbers that use Fri/Sun (mid-tier) pricing when priceFriSunCents is set (e.g. [0, 5] = Sun, Fri). */
  friSunDays?: number[];
  /** Display order on website (lower = first). Default undefined = last. */
  sortOrder?: number;
  /** Social proof: star rating (e.g. 4.9). */
  rating?: number;
  /** Social proof: e.g. "500+ 5-star days". */
  ratingCount?: string;
  /** Short stat pills (e.g. "Top-rated on Lake Austin", "Captain-led", "Lily pad included"). */
  stats?: string[];
  /** Tagline above or with title (e.g. "Loved by locals & visitors"). */
  tagline?: string;
  /** "What you'll do" steps: label + description (e.g. Dock → Meet your captain). */
  steps?: { label: string; description: string }[];
  /** Gallery category labels (e.g. "Vibes", "Boat", "Lake Days") — one per image or grouped. */
  galleryLabels?: string[];
  /** charter = flat rate per booking; ticketed = per-person with fixed daily departure. */
  pricingType?: "charter" | "ticketed";
  /** Ticketed: maximum tickets sold per departure. */
  maxCapacity?: number;
  /** Ticketed: departure time hour in 24h format (0–23). */
  departureHour?: number;
  /** Ticketed: departure time minute (0–59). */
  departureMinute?: number;
  /** Ticketed: trip duration in hours (e.g. 1 for a 1-hour sunset cruise). Drives slot end time. */
  tripDurationHours?: number;
  /**
   * Ticketed: optional weekly schedule — departures only on these weekdays (0=Sun … 6=Sat) in listing timezone
   * (slot logic uses America/Mazatlan). Omit or empty = every day.
   */
  ticketedWeekdays?: number[];
  showSpotsRemaining?: boolean;
  /** Denormalized minimum rate price in cents; kept in sync by admin write paths to avoid subcollection reads on list queries. */
  fromPriceCents?: number;
  /** When true, charter customers can choose between 50% deposit and full payment. Defaults to false (full-only). */
  allowDeposit?: boolean;
  /**
   * When true (and BOOKING_ALLOW_ALTERNATIVE_PAYMENT_METHODS is enabled on the server), full-payment
   * PaymentIntents may use automatic_payment_methods (e.g. delayed bank methods). Defaults to false:
   * full pay uses card/wallet card rails only for instant-confirmation UX.
   */
  allowDelayedPaymentMethods?: boolean;
  /** When false, hide "Tip now" option for this listing. Defaults to true. */
  allowTipNow?: boolean;
  /** When false, hide "Tip later" option for this listing. Defaults to true. */
  allowTipLater?: boolean;
}

// Rates (subcollection experiences/{experienceId}/rates/{rateId}) — spec uses priceCents
export interface ExperienceRate {
  durationHours: number;
  displayName: string;
  priceCents: number;
  /** Weekend price (e.g. Saturday when weekendDays = [6]); falls back to priceCents if unset */
  priceWeekendCents?: number;
  /** Fri/Sun price when experience.friSunDays includes that day (e.g. [0, 5]); falls back to priceCents if unset */
  priceFriSunCents?: number;
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
  /** When true, omit from customer booking UIs (replaces fragile client-side name filtering). */
  hiddenFromBookingUI?: boolean;
  /** Stable key for seed reconcile + bundle presets (not the Firestore doc id). */
  catalogKey?: string;
  /** When true, fulfilled by a vetted local partner (display/ops only). */
  partnerFulfilled?: boolean;
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
  /** Unit price in cents captured at hold creation (authoritative for checkout / conversion). */
  priceCents?: number;
  /** Display name captured at hold creation for Stripe line items without re-fetching prices. */
  name?: string;
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
// Blocks (top-level collection blocks/{blockId}) — admin-only unavailability
// ---------------------------------------------------------------------------

export interface Block {
  experienceId: string;
  /** Omit for "all boats" (experience-level block); set for one boat. */
  boatId: string | null;
  startAt: FirestoreTimestamp;
  endAt: FirestoreTimestamp;
  /** Optional label (e.g. "Maintenance", "Private"). */
  note?: string | null;
  /** When created from "block slot" UI, stored for easy unblock lookup. */
  slotId?: string | null;
  /**
   * Ticketed only: hold back this many tickets for overlapping departures without closing the whole departure.
   * Omit for legacy/full blocks.
   */
  ticketsBlocked?: number | null;
  createdAt: FirestoreTimestamp;
  createdBy?: string | null;
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
  /** Mirrors experience.pricingType at hold creation — used by checkout to build correct Stripe line items. */
  pricingType?: "charter" | "ticketed";
  /** Mirrors experience.allowDeposit at hold creation so payment eligibility is immutable. */
  allowDeposit?: boolean;
  bookingMode?: "shared" | "charter";
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
  /** Set when hold is converted to a booking; used for receipt claim-token resolution. */
  bookingId?: string;
  checkoutSessionId?: string;
  /** Embedded vs hosted checkout; used with checkoutSessionId for mode-matching before Stripe. */
  checkoutSessionMode?: "embedded" | "redirect";
  /** Optional tip (20% when "Tip now" selected). In cents. */
  tipCents?: number;
  /** Discount code applied at checkout (uppercase). */
  discountCode?: string;
  /** Discount amount in cents (saved for record). */
  discountCents?: number;
  /** Canonical pricing at hold creation (rate + addons + tax). Used by checkout and webhook so amount never drifts. */
  pricing?: BookingPricing;
  /** Effective rate price (cents) used for this hold (date-based). Enables checkout to use hold.pricing without recomputing. */
  effectiveRateCents?: number;
  /** Stripe PaymentIntent id for deposit (reused on retry). */
  depositPaymentIntentId?: string;
  /** Stripe PaymentIntent id for full/final payment (reused on retry). */
  fullPaymentIntentId?: string;
  /**
   * Set on the first create-payment-intent extension of expiresAt; further PI retries must not extend again
   * (prevents unbounded inventory locks via repeated intent creation).
   */
  paymentIntentExpiryExtendedAt?: FirestoreTimestamp;
  /** Client idempotency key for shared-ticketed create-hold (dedupe rapid double-submit). */
  clientHoldRequestId?: string;
  /**
   * Monotonic counter incremented on every hold create/resume; Stripe metadata must match so stale
   * PaymentIntents cannot convert after intent id fields are cleared.
   */
  paymentAttemptVersion?: number;
  /**
   * Set while a Stripe Checkout Session is being created, to serialize concurrent
   * create-checkout-session calls. Cleared when checkoutSessionId is persisted or on rollback.
   */
  sessionCreationInFlight?: FirestoreTimestamp;
  /**
   * True when discount usage was committed but checkout rollback may still fail; cleanup/release must
   * compensate discount exactly once.
   */
  rollbackPending?: boolean;
  /** After this time, cron may auto-release the slot if no succeeded PaymentIntent is observed (see cleanup-holds-logic). */
  rollbackPendingExpiresAt?: FirestoreTimestamp;
  /** Paid-click attribution from the landing URL (Google Ads gclid / UTMs). */
  adsAttribution?: import("@/lib/ads/attribution").AdsAttribution;
  adsChannel?: import("@/lib/ads/attribution").AdsChannel;
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

/** Legacy: full payment in one charge. New 50/50 flow uses final_* statuses. Deposit flow jumps straight to final_due at creation; deposit_paid is not used. */
export type BookingStatus =
  | "paid"
  | "canceled"
  | "refunded"
  | "final_due"
  | "final_processing"
  | "final_paid"
  | "final_requires_action"
  | "final_failed";

/**
 * Statuses that mean the slot is taken (used by slots API, create-hold, create-checkout-session-direct).
 * At runtime only paid, final_due, final_processing, final_paid, final_requires_action, final_failed are assigned; deposit_paid is not used.
 *
 * Operational note:
 * - `final_failed` continues to occupy inventory until remediation runs.
 * - `POST /api/admin/cron/reconcile-final-failed-bookings` enforces SLA-based release
 *   (default 6h via `FINAL_FAILED_RELEASE_SLA_HOURS`), else emits an ops alert for manual review.
 */
export const BOOKING_STATUSES_SLOT_TAKEN: ReadonlySet<BookingStatus> = new Set<BookingStatus>([
  "paid",
  "final_due",
  "final_paid",
  "final_processing",
  "final_requires_action",
  "final_failed",
]);

/**
 * Whether a booking without `boatId` should count toward dashboard / integrity alerts for
 * listing-boat occupancy. Shared ticketed inventory (and legacy ticketed rows without explicit
 * `bookingMode: "charter"`) does not use per-boat attribution on the booking doc.
 */
export function bookingRequiresBoatIdForOccupancyAlert(
  bookingMode: Booking["bookingMode"],
  experiencePricingType: Experience["pricingType"]
): boolean {
  if (experiencePricingType === "ticketed") {
    return bookingMode === "charter";
  }
  return true;
}

/** Admin cancel + Stripe refund outcome vs Firestore summary counters. */
export type BookingCancellationRefundStatus =
  | "pending"
  | "partial"
  | "succeeded"
  | "failed"
  | "skipped";

export interface BookingCancellationRefund {
  status: BookingCancellationRefundStatus;
  /** Set when summaries.revenue decrements for this cancellation were applied. */
  summaryAppliedAt?: FirestoreTimestamp;
}

/** Display-only card info (never store raw card data). */
export interface BookingCardDisplay {
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
}

export interface BookingStripe {
  checkoutSessionId?: string;
  paymentIntentId?: string;
  /** Amount charged in Stripe (cents) – for reconciliation; legacy full payment */
  amountTotalCents?: number;
  currency?: string;
  /** 50/50 deposit flow */
  customerId?: string;
  paymentMethodId?: string;
  depositPaymentIntentId?: string;
  finalPaymentIntentId?: string;
  depositAmountCents?: number;
  /** When true, summaries/revenue already includes the final payment increment (deposit+final). */
  finalRevenueSummaryApplied?: boolean;
  finalAmountCents?: number;
  /** Set when `finalAmountCents` was corrected to match total − deposit (shared resolver). */
  finalBalanceNormalizedAt?: FirestoreTimestamp;
  totalAmountCents?: number;
  depositPaidAt?: FirestoreTimestamp;
  finalChargedAt?: FirestoreTimestamp;
  finalChargeAttemptedAt?: FirestoreTimestamp;
  finalChargeLockAt?: FirestoreTimestamp;
  /** Set when customer uses pay-remaining; cron skips cancel/recreate for ~30m. */
  customerPayLockAt?: FirestoreTimestamp;
  /** Set in a transaction immediately before Stripe creates a customer final PI; cleared on success/failure (TTL fallback in cron). */
  customerFinalPiInFlightAt?: FirestoreTimestamp;
  /** Idempotency key string reserved in Firestore before Stripe PI create (customer path); cleared when PI id is stored. */
  pendingFinalPaymentIntentKey?: string;
  /** When final charge failed (code/message for admin). */
  finalError?: { code?: string; message?: string };
  /** When final-charge failure notification was sent (dedupe: only one sender per payment intent). */
  finalFailureNotifiedAt?: FirestoreTimestamp;
  finalFailureNotifiedPaymentIntentId?: string;
  /** Short lease while a failure email send is in flight; cleared after send or on failure so retries can occur. */
  finalFailureNotifyLeaseUntil?: FirestoreTimestamp;
  /** Set when cron final charge cannot run because waiver is unsigned (see run-final-charges). */
  finalChargeWaiverBlockedReason?: string;
}

export interface Booking {
  boatId?: string;
  experienceId?: string;
  /** Mirrors experience `pricingType` when known (shared ticketed admin bookings, hold conversion). */
  pricingType?: "charter" | "ticketed";
  bookingMode?: "shared" | "charter";
  /** Source hold ID when booking was created from a hold; used for receipt claim-token resolution. */
  holdId?: string;
  slotId: string;
  rateId: string;
  /**
   * Display snapshots at conversion time. Historical money remains in `pricing`;
   * these fields prevent live package renames from rewriting old booking labels.
   * Older bookings may omit them — fall back to live experience/rate lookup.
   */
  experienceTitle?: string;
  rateDisplayName?: string;
  addonSelections: AddonSelection[];
  partySize: number;
  petsCount: number;
  answers: Record<string, string>;
  customer: Customer;
  marketingOptIn?: boolean;
  /** Special requests / notes from Stripe Checkout custom field (optional). */
  specialNotes?: string;
  pricing: BookingPricing;
  /** Cancellation policy snapshot at booking creation time. */
  cancellationPolicy?: ExperienceCancellationPolicy;
  status: BookingStatus;
  stripe: BookingStripe;
  /** Trip date YYYY-MM-DD from slotId; used for admin calendar query by trip date range */
  startDateStr?: string;
  /** Revenue summary month key at booking creation (e.g. revenue_2026_03). */
  summaryMonthKey?: string;
  /** True after global/monthly/experience revenue counters were incremented for this booking. */
  summaryCountersApplied?: boolean;
  /** Customer notification pipeline exhausted retries or dead-lettered (ops triage / filters). */
  notificationFailed?: boolean;
  notificationFailedAt?: FirestoreTimestamp;
  notificationFailureDetail?: string;
  /** Set when admin cancel could not resolve a slot path; cron retries release. */
  slotResetPending?: boolean;
  /** Discount code applied at checkout (if any). */
  discountCode?: string;
  /** Discount amount in cents (if any). */
  discountCents?: number;
  /**
   * Internal notes for the assigned captain / ops.
   * `operatorNotes` is the latest entry; `operatorNotesLog` is the full timeline.
   * Never sent to guests.
   */
  operatorNotes?: string;
  operatorNotesUpdatedAt?: FirestoreTimestamp;
  operatorNotesBy?: string;
  operatorNotesLog?: Array<{
    id: string;
    text: string;
    by: string;
    byName?: string;
    at: string;
  }>;
  /** Denormalized captain email for calendar queries. Keep in sync with assignedCaptain.email. */
  captainEmail?: string;
  /** Captain assigned by Super Admin or an operator. */
  assignedCaptain?: {
    email: string;
    name: string;
    assignedAt?: FirestoreTimestamp;
    assignedBy?: string;
  };
  /** Tip amount in cents (if any). */
  tipCents?: number;
  /** When to run final charge (bookingStartAt - 48h). */
  finalChargeAt?: FirestoreTimestamp;
  /** When heads-up reminder email was sent (optional). */
  finalReminderSentAt?: FirestoreTimestamp;
  /** When "1 week before trip" reminder was sent. */
  reminder1WeekSentAt?: FirestoreTimestamp;
  /** When "24 hours before" reminder was sent. */
  reminder24hSentAt?: FirestoreTimestamp;
  /** When "day of, 3 hours before" reminder was sent. */
  reminderDayOfSentAt?: FirestoreTimestamp;
  /** When 48h final payment request was sent (email). */
  finalPaymentRequestSentAt?: FirestoreTimestamp;
  /** Channel-specific SMS sent markers (when SMS notifications are enabled). */
  confirmationSmsSentAt?: FirestoreTimestamp;
  finalReminderSmsSentAt?: FirestoreTimestamp;
  reminder1WeekSmsSentAt?: FirestoreTimestamp;
  reminder24hSmsSentAt?: FirestoreTimestamp;
  reminderDayOfSmsSentAt?: FirestoreTimestamp;
  finalPaymentRequestSmsSentAt?: FirestoreTimestamp;
  cancellationSmsSentAt?: FirestoreTimestamp;
  /** Display-only card (brand, last4, exp). */
  card?: BookingCardDisplay;
  /** Billing address (e.g. for manual/admin-added bookings). */
  billingAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  /** Waiver request pointer (when in-app waiver is used). */
  waiver?: {
    requestId: string;
    status: string;
    templateId: string;
    templateVersion: number;
  };
  /** Set when marketing opt-in Brevo subscribe succeeds (recovery idempotency). */
  brevoSubscribedAt?: FirestoreTimestamp;
  /** Admin cancel: refund vs summary reconciliation (see POST /api/admin/bookings/[id]/cancel). */
  cancellationRefund?: BookingCancellationRefund;
  /** Direct site, admin, or inbound marketplace email sync. */
  source?: "website" | "admin" | "boatsetter" | "getmyboat" | "viator" | string;
  /** Paid-click attribution from the landing URL (Google Ads gclid / UTMs). */
  adsAttribution?: import("@/lib/ads/attribution").AdsAttribution;
  adsChannel?: import("@/lib/ads/attribution").AdsChannel;
  externalProvider?: "boatsetter" | "getmyboat" | "viator";
  externalBookingId?: string;
  /** `${provider}:${externalBookingId}` for idempotent marketplace lookup. */
  externalKey?: string;
  externalListingId?: string;
  externalListingName?: string;
  externalProductCode?: string;
  externalMessageId?: string;
  externalThreadId?: string;
  /** Labeled fields copied from the marketplace confirmation email. */
  marketplaceDetails?: Record<string, string>;
  /** Booking-details excerpt from the marketplace email. */
  marketplaceEmailExcerpt?: string;
  /**
   * Admin reschedule marker. `rescheduledAt` is the latest move;
   * `rescheduleHistory` is the timeline shown on the booking.
   */
  rescheduledAt?: FirestoreTimestamp;
  rescheduledFromSlotId?: string;
  rescheduledFromStartDateStr?: string;
  rescheduleCount?: number;
  rescheduleHistory?: Array<{
    fromSlotId: string;
    toSlotId: string;
    fromDateStr?: string;
    toDateStr?: string;
    at: string;
    by?: string;
  }>;
  createdAt: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
}

/** Pending refund record (e.g. duplicate charge or hold paid after expiry). */
export interface PendingRefund {
  bookingId?: string;
  holdId?: string;
  duplicatePaymentIntentId?: string;
  paymentIntentId?: string;
  /** When set and less than PI amount_received, processor issues a partial refund of this many cents. */
  refundAmountCents?: number;
  /** When true, automated processor skips; admin must decide before any refund. */
  requiresReview?: boolean;
  reason: string;
  status: "pending" | "resolved" | "failed";
  createdAt?: FirestoreTimestamp;
  /** Legacy rows may only have firstSeenAt; admin API falls back for display ordering. */
  firstSeenAt?: FirestoreTimestamp;
  resolvedAt?: FirestoreTimestamp;
  notes?: string;
  /** Set when a Stripe refund object exists; may still be asynchronous (`status: pending`) before success. */
  stripeRefundId?: string;
  lastProcessorError?: string;
  /** When set on `status: pending`, the ordered processor query includes this document; backfilled if missing. */
  nextRetryAt?: FirestoreTimestamp;
  processorAttempts?: number;
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
  /** Optional discount code (validated at hold creation). */
  discountCode?: string;
  bookingMode?: "shared" | "charter";
  /** The hold ID the client wants to resume/extend. Required to reuse an existing active hold on a held slot. */
  resumeHoldId?: string;
  /** Optional client-generated idempotency key (shared ticketed holds: reuse active hold for same key). */
  holdRequestId?: string;
  /** Proves ownership of `resumeHoldId` when hold-request claim does not (signed `RELEASE_TOKEN_SECRET`). */
  release_token?: string;
  adsAttribution?: import("@/lib/ads/attribution").AdsAttribution;
}

export interface CreateHoldResponse {
  holdId: string;
  expiresAt: string; // ISO
  /**
   * Line-item / tax breakdown uses `subtotalCents`, `taxCents`, `feesCents` from `computePricing`.
   * `totalCents` is the final amount to charge: base + tax + fees + tip − discount (same as persisted on the hold doc).
   */
  pricing: BookingPricing;
  /** Signed token for release-hold (cancel URL). Omitted when RELEASE_TOKEN_SECRET (or MANAGE_BOOKING_SECRET) is unset. */
  releaseToken?: string;
  /** Confirmed discount from server repricing (weekend/holiday rate, etc.). */
  discountCents?: number;
  discountCode?: string;
  /** Deposit option is available only when trip start is at least this many hours away. */
  depositLeadTimeHours?: number;
}

export interface CreateCheckoutSessionInput {
  holdId: string;
}

export interface CreateCheckoutSessionResponse {
  url: string;
  sessionId: string;
}

// ---------------------------------------------------------------------------
// Discounts (top-level collection discounts/{discountId})
// ---------------------------------------------------------------------------

export type DiscountType = "percent" | "fixed";

/** Who a promo code is connected to for conversion reporting (free-text `assignedTo`). */
export type DiscountAssignedToType = "internal" | "partner" | "influencer" | "campaign" | "other";

export interface Discount {
  /** Code customers enter (stored uppercase). */
  code: string;
  type: DiscountType;
  /** For type "percent": 1–100. For type "fixed": not used. */
  percent?: number;
  /** For type "fixed": amount off in cents. For type "percent": not used. */
  valueCents?: number;
  /** Optional expiry (Firestore Timestamp). */
  expiresAt?: FirestoreTimestamp;
  /** Max number of times this code can be used (optional). */
  maxRedemptions?: number;
  /** Number of times applied (incremented on successful payment). */
  usedCount: number;
  active: boolean;
  /** Optional description for admin. */
  description?: string;
  /** Free-text owner for reporting (partner name, influencer handle, etc.). */
  assignedTo?: string;
  /** Category for `assignedTo` (reporting rollups). */
  assignedToType?: DiscountAssignedToType;
  createdAt: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
}

// ---------------------------------------------------------------------------
// Notification outbox (confirmation sends with retry)
// ---------------------------------------------------------------------------

export type NotificationOutboxStatus = "pending" | "claimed" | "sent" | "failed" | "dead_letter";

export interface NotificationOutboxEntry {
  bookingId: string;
  type:
    | "booking_confirmation"
    | "final_charge_success"
    | "discount_limit_exceeded_notification"
    | "waiver_invite_send"
    | "amount_integrity_mismatch_customer"
    | "payment_under_manual_review_customer";
  payload: Record<string, unknown>;
  status: NotificationOutboxStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: FirestoreTimestamp;
  lastError?: string;
  lastAttemptAt?: FirestoreTimestamp;
  claimedAt?: FirestoreTimestamp;
  /** When status is `claimed`, worker must finish or refresh before this time or the row is reset to `pending`. */
  claimExpiresAt?: FirestoreTimestamp;
  claimedBy?: string;
  sentAt?: FirestoreTimestamp;
  /** Brevo transactional `messageId` after confirmed customer email delivery (idempotency / dedupe). */
  providerMessageId?: string;
  createdAt: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
}

// ---------------------------------------------------------------------------
// Notification send claim (idempotent per-booking-per-template)
// ---------------------------------------------------------------------------

export type NotificationClaimStatus = "claimed" | "sent" | "failed" | "skipped";

export interface NotificationSendClaim {
  bookingId: string;
  templateKey: string;
  status: NotificationClaimStatus;
  claimedAt: FirestoreTimestamp;
  claimedBy?: string;
  sentAt?: FirestoreTimestamp;
  failedAt?: FirestoreTimestamp;
  lastError?: string;
  /** When status is `skipped`, terminal reason (e.g. booking no longer eligible). */
  skipReason?: string;
  skippedAt?: FirestoreTimestamp;
  /** Brevo `messageId` after confirmed email delivery. */
  providerMessageId?: string;
  attemptCount: number;
  updatedAt: FirestoreTimestamp;
}

// ---------------------------------------------------------------------------
// Reminder retry queue (failed reminders with nextAttemptAt)
// ---------------------------------------------------------------------------

export type ReminderRetryStatus = "pending" | "claimed" | "sent" | "failed" | "dead_letter" | "skipped";

export interface ReminderRetryEntry {
  bookingId: string;
  templateKey: "reminder_1week" | "reminder_24h" | "reminder_dayof" | "final_payment_request" | "final_charge_success";
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: FirestoreTimestamp;
  status: ReminderRetryStatus;
  lastError?: string;
  lastAttemptAt?: FirestoreTimestamp;
  claimedAt?: FirestoreTimestamp;
  sentAt?: FirestoreTimestamp;
  /** When status is `skipped`, terminal reason (e.g. eligibility lost before resend). */
  skipReason?: string;
  /** Brevo `messageId` after confirmed email delivery. */
  providerMessageId?: string;
  createdAt: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
}
