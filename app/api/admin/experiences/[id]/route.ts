import { NextRequest, NextResponse } from "next/server";
import type { QuerySnapshot } from "firebase-admin/firestore";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { collectAllActiveHoldDocsForExperience } from "@/lib/booking/admin-active-holds-query";
import type {
  Experience,
  ExperienceRate,
  ExperienceAddon,
  ExperienceLocation,
  ExperienceCancellationPolicy,
  ExperienceSeasonal,
} from "@/lib/booking/types";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";
import { HOLD_EXPIRY_MINUTES } from "@/lib/booking/constants";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import { runExpiredHoldReleaseTransaction } from "@/lib/booking/cleanup-holds-logic";
import { writeAdminAuditLog } from "@/lib/booking/admin-audit-log";
import { isCanonicalSlug, normalizePublicSlug } from "@/lib/booking/slug";

import { buildExperienceDocUpdate } from "@/lib/booking/experience-doc-update";
import { normalizeTicketedWeekdaysInput, ticketedWeekdaysForFirestore } from "@/lib/booking/ticketed-slot-utils";
import { sanitizeCssObjectPosition } from "@/lib/image-position";
import { getChicagoToday } from "@/lib/booking/booking-date-range";

/** Remove undefined from object (and array elements) so Firestore update/set accepts it. Leaves null and other values. */
function stripUndefined<T>(obj: T): T {
  if (obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) =>
      item !== null && typeof item === "object" && Object.getPrototypeOf(item) === Object.prototype
        ? stripUndefined(item as Record<string, unknown>)
        : item
    ) as T;
  }
  if (obj === null || typeof obj !== "object" || Object.getPrototypeOf(obj) !== Object.prototype) {
    return obj;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v === undefined) continue;
    out[k] =
      v !== null &&
      typeof v === "object" &&
      Object.getPrototypeOf(v) === Object.prototype
        ? stripUndefined(v as Record<string, unknown>)
        : Array.isArray(v)
          ? stripUndefined(v)
          : v;
  }
  return out as T;
}

function normalizeRateForCompare(r: Record<string, unknown>) {
  return {
    durationHours: typeof r.durationHours === "number" ? r.durationHours : 0,
    displayName: typeof r.displayName === "string" ? r.displayName : "",
    priceCents: typeof r.priceCents === "number" ? r.priceCents : 0,
    priceWeekendCents: typeof r.priceWeekendCents === "number" ? r.priceWeekendCents : undefined,
    priceFriSunCents: typeof r.priceFriSunCents === "number" ? r.priceFriSunCents : undefined,
    priceHolidayCents: typeof r.priceHolidayCents === "number" ? r.priceHolidayCents : undefined,
  };
}

function ratesPayloadMatchesFirestore(
  parsedRates: NonNullable<NonNullable<ReturnType<typeof parseBody>>["rates"]>,
  existingRatesSnap: QuerySnapshot
): boolean {
  const fromParsed = [...parsedRates]
    .map((r) => normalizeRateForCompare(r as Record<string, unknown>))
    .sort((a, b) => a.durationHours - b.durationHours);
  const fromDb = existingRatesSnap.docs
    .map((d) => normalizeRateForCompare(d.data() as Record<string, unknown>))
    .sort((a, b) => a.durationHours - b.durationHours);
  return JSON.stringify(fromParsed) === JSON.stringify(fromDb);
}

function normalizeAddonForCompare(r: Record<string, unknown>) {
  return {
    name: typeof r.name === "string" ? r.name : "",
    description: typeof r.description === "string" ? r.description : undefined,
    priceCents: typeof r.priceCents === "number" ? r.priceCents : 0,
    type: r.type === "quantity" || r.type === "tip" ? r.type : "toggle",
    maxQty: typeof r.maxQty === "number" ? r.maxQty : undefined,
    highlight: r.highlight === true,
  };
}

function addonsPayloadMatchesFirestore(
  parsedAddons: NonNullable<NonNullable<ReturnType<typeof parseBody>>["addons"]>,
  existingAddonsSnap: QuerySnapshot
): boolean {
  const fromParsed = [...parsedAddons]
    .map((a) => normalizeAddonForCompare(a as Record<string, unknown>))
    .sort((a, b) => a.name.localeCompare(b.name));
  const fromDb = existingAddonsSnap.docs
    .map((d) => normalizeAddonForCompare(d.data() as Record<string, unknown>))
    .sort((a, b) => a.name.localeCompare(b.name));
  return JSON.stringify(fromParsed) === JSON.stringify(fromDb);
}

function parseBody(
  body: unknown
): Partial<{
  slug: string;
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
  timezone: string;
  rates: Omit<ExperienceRate, "active">[];
  addons: Omit<ExperienceAddon, "active">[];
  heroOverlayText: string;
  promoVideoUrl: string;
  metaTitle: string;
  metaDescription: string;
  ctaButtonText: string;
  cancellationSummary: string;
  testimonials: { name: string; quote: string; date?: string }[];
  featured: boolean;
  spotsLeftOverride: number;
  defaultRateId: string;
  bookingPosition: "sidebar" | "inline" | "modal";
  galleryAltTexts: string[];
  holidayDates: { label?: string; start: string; end: string; recurring?: boolean; priceCents?: number; priceCentsByDuration?: Record<number, number> }[];
  weekendDays: number[];
  friSunDays: number[];
  sortOrder: number;
  pricingType: "charter" | "ticketed";
  maxCapacity: number;
  departureHour: number;
  departureMinute: number;
  tripDurationHours: number;
  /** Normalized 0–6; empty array means “every day” on write. */
  ticketedWeekdays: number[];
  allowDeposit: boolean;
  allowTipNow?: boolean;
  allowTipLater?: boolean;
  heroImagePosition?: string;
  listingCardImagePosition?: string;
}> | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const out: ReturnType<typeof parseBody> = {};
  if (typeof b.slug === "string") {
    const normalized = normalizePublicSlug(b.slug);
    out.slug = normalized;
  }
  if (typeof b.title === "string") out.title = b.title.trim();
  if (typeof b.subtitle === "string") out.subtitle = b.subtitle.trim();
  if (typeof b.descriptionLong === "string") out.descriptionLong = b.descriptionLong.trim();
  if (b.heroMedia && typeof b.heroMedia === "object" && "url" in b.heroMedia && typeof (b.heroMedia as { url: unknown }).url === "string") {
    out.heroMedia = {
      type: (b.heroMedia as { type?: string }).type === "video" ? "video" : "image",
      url: (b.heroMedia as { url: string }).url,
    };
  }
  if (Array.isArray(b.gallery)) out.gallery = b.gallery.filter((x): x is string => typeof x === "string");
  if (b.location && typeof b.location === "object") {
    const loc = b.location as Record<string, unknown>;
    out.location = {
      title: typeof loc.title === "string" ? loc.title.trim() : "",
      addressText: typeof loc.addressText === "string" ? loc.addressText.trim() : "",
      notes: typeof loc.notes === "string" ? loc.notes.trim() : undefined,
    };
  }
  if (typeof b.maxGuests === "number" && b.maxGuests >= 0) out.maxGuests = Math.floor(b.maxGuests);
  if (typeof b.petsMax === "number" && b.petsMax >= 0) out.petsMax = Math.floor(b.petsMax);
  if (Array.isArray(b.included)) out.included = b.included.filter((x): x is string => typeof x === "string");
  if (Array.isArray(b.whatToBring)) out.whatToBring = b.whatToBring.filter((x): x is string => typeof x === "string");
  if (Array.isArray(b.rules)) out.rules = b.rules.filter((x): x is string => typeof x === "string");
  if (b.cancellationPolicy && typeof b.cancellationPolicy === "object") {
    const cp = b.cancellationPolicy as Record<string, unknown>;
    out.cancellationPolicy = {
      freeCancelDays: typeof cp.freeCancelDays === "number" ? cp.freeCancelDays : 30,
      partialRefundDaysStart: typeof cp.partialRefundDaysStart === "number" ? cp.partialRefundDaysStart : 15,
      partialRefundDaysEnd: typeof cp.partialRefundDaysEnd === "number" ? cp.partialRefundDaysEnd : 30,
      noRefundWithinDays: typeof cp.noRefundWithinDays === "number" ? cp.noRefundWithinDays : 14,
      fullText: typeof cp.fullText === "string" ? cp.fullText : "",
    };
  }
  if (Array.isArray(b.faqs)) {
    out.faqs = b.faqs
      .filter((x): x is { q?: unknown; a?: unknown } => x != null && typeof x === "object")
      .map((x) => ({ q: typeof x.q === "string" ? x.q : "", a: typeof x.a === "string" ? x.a : "" }));
  }
  if (b.seasonal && typeof b.seasonal === "object") {
    const sea = b.seasonal as Record<string, unknown>;
    out.seasonal = {
      enabled: sea.enabled === true,
      startMonth: typeof sea.startMonth === "number" ? sea.startMonth : undefined,
      endMonth: typeof sea.endMonth === "number" ? sea.endMonth : undefined,
      startDate: typeof sea.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sea.startDate) ? sea.startDate : undefined,
      endDate: typeof sea.endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sea.endDate) ? sea.endDate : undefined,
    };
  }
  if (typeof b.active === "boolean") out.active = b.active;
  if (typeof b.timezone === "string") out.timezone = b.timezone.trim() || "";
  if (Array.isArray(b.rates)) {
    out.rates = b.rates
      .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
      .map((x) => ({
        durationHours: typeof x.durationHours === "number" ? x.durationHours : 0,
        displayName: typeof x.displayName === "string" ? x.displayName : "",
        priceCents: typeof x.priceCents === "number" ? x.priceCents : 0,
        priceWeekendCents: typeof x.priceWeekendCents === "number" ? x.priceWeekendCents : undefined,
        priceFriSunCents: typeof x.priceFriSunCents === "number" ? x.priceFriSunCents : undefined,
        priceHolidayCents: typeof x.priceHolidayCents === "number" ? x.priceHolidayCents : undefined,
      }));
  }
  if (Array.isArray(b.friSunDays)) {
    out.friSunDays = (b.friSunDays as number[]).filter((x) => typeof x === "number" && x >= 0 && x <= 6).sort((a, b) => a - b);
  }
  if (Array.isArray(b.holidayDates)) {
    out.holidayDates = (b.holidayDates as { label?: string; start?: string; end?: string; recurring?: boolean; priceCents?: number; priceCentsByDuration?: Record<string, number> }[])
      .filter((x) => x != null && typeof x === "object" && (typeof (x as { start?: string }).start === "string" || typeof (x as { end?: string }).end === "string"))
      .map((x) => {
        const byDur = x.priceCentsByDuration && typeof x.priceCentsByDuration === "object"
          ? Object.fromEntries(
              Object.entries(x.priceCentsByDuration).filter(
                ([k, v]) => Number.isFinite(Number(k)) && typeof v === "number" && v >= 0
              ).map(([k, v]) => [Number(k), v] as [number, number])
            ) as Record<number, number>
          : undefined;
        const priceCentsByDuration = byDur && Object.keys(byDur).length > 0 ? byDur : undefined;
        const priceCents = typeof (x as { priceCents?: number }).priceCents === "number" ? (x as { priceCents: number }).priceCents : undefined;
        const label = typeof x.label === "string" ? x.label : undefined;
        const recurring = (x as { recurring?: boolean }).recurring === true;
        return {
          start: typeof x.start === "string" ? x.start : "",
          end: typeof x.end === "string" ? x.end : "",
          ...(label != null && label !== "" && { label }),
          ...(recurring && { recurring: true }),
          ...(typeof priceCents === "number" && { priceCents }),
          ...(priceCentsByDuration && { priceCentsByDuration }),
        };
      });
  }
  if (Array.isArray(b.addons)) {
    out.addons = b.addons
      .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
      .map((x) => ({
        name: typeof x.name === "string" ? x.name : "",
        description: typeof x.description === "string" ? x.description : undefined,
        priceCents: typeof x.priceCents === "number" ? x.priceCents : 0,
        type: (x.type === "quantity" || x.type === "tip" ? x.type : "toggle") as "toggle" | "quantity" | "tip",
        maxQty: typeof x.maxQty === "number" ? x.maxQty : undefined,
        highlight: x.highlight === true,
      }));
  }
  if (typeof b.heroOverlayText === "string") out.heroOverlayText = b.heroOverlayText.trim();
  if (typeof b.promoVideoUrl === "string") out.promoVideoUrl = b.promoVideoUrl.trim();
  if (typeof b.metaTitle === "string") out.metaTitle = b.metaTitle.trim();
  if (typeof b.metaDescription === "string") out.metaDescription = b.metaDescription.trim();
  if (typeof b.ctaButtonText === "string") out.ctaButtonText = b.ctaButtonText.trim();
  if (typeof b.cancellationSummary === "string") out.cancellationSummary = b.cancellationSummary.trim();
  if (Array.isArray(b.testimonials)) {
    out.testimonials = b.testimonials
      .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
      .map((x) => ({
        name: typeof x.name === "string" ? x.name : "",
        quote: typeof x.quote === "string" ? x.quote : "",
        date: typeof x.date === "string" ? x.date : undefined,
      }))
      .filter((t) => t.name || t.quote);
  }
  if (typeof b.featured === "boolean") out.featured = b.featured;
  if (typeof b.spotsLeftOverride === "number" && b.spotsLeftOverride >= 0) out.spotsLeftOverride = b.spotsLeftOverride;
  if (typeof b.defaultRateId === "string") out.defaultRateId = b.defaultRateId.trim();
  if (b.bookingPosition === "sidebar" || b.bookingPosition === "inline" || b.bookingPosition === "modal") out.bookingPosition = b.bookingPosition;
  if (Array.isArray(b.galleryAltTexts)) out.galleryAltTexts = b.galleryAltTexts.filter((x): x is string => typeof x === "string");
  if (Array.isArray(b.weekendDays)) {
    const arr = (b.weekendDays as unknown[]).filter((x): x is number => typeof x === "number" && x >= 0 && x <= 6);
    if (arr.length > 0) out.weekendDays = Array.from(new Set(arr)).sort((a, b) => a - b);
  }
  if (typeof b.sortOrder === "number") out.sortOrder = b.sortOrder;
  if (b.pricingType === "ticketed" || b.pricingType === "charter") out.pricingType = b.pricingType;
  // Ticketed experiences must never have allowDeposit: true; clear stale value when saving as ticketed.
  if (out.pricingType === "ticketed") out.allowDeposit = false;
  if (typeof b.maxCapacity === "number" && b.maxCapacity >= 0) out.maxCapacity = Math.floor(b.maxCapacity);
  if (typeof b.departureHour === "number") out.departureHour = Math.min(23, Math.max(0, Math.floor(b.departureHour)));
  if (typeof b.departureMinute === "number") out.departureMinute = Math.min(59, Math.max(0, Math.floor(b.departureMinute)));
  if (typeof b.tripDurationHours === "number" && b.tripDurationHours > 0) out.tripDurationHours = b.tripDurationHours;
  if (Array.isArray(b.ticketedWeekdays)) {
    out.ticketedWeekdays = normalizeTicketedWeekdaysInput(b.ticketedWeekdays);
  }
  if (typeof b.allowDeposit === "boolean") {
    out.allowDeposit = b.pricingType === "ticketed" ? false : b.allowDeposit;
  }
  if (typeof b.allowTipNow === "boolean") out.allowTipNow = b.allowTipNow;
  if (typeof b.allowTipLater === "boolean") out.allowTipLater = b.allowTipLater;
  if (Object.prototype.hasOwnProperty.call(b, "heroImagePosition")) {
    if (b.heroImagePosition === null || b.heroImagePosition === "") {
      out.heroImagePosition = "";
    } else if (typeof b.heroImagePosition === "string") {
      const s = sanitizeCssObjectPosition(b.heroImagePosition);
      if (s) out.heroImagePosition = s;
    }
  }
  if (Object.prototype.hasOwnProperty.call(b, "listingCardImagePosition")) {
    if (b.listingCardImagePosition === null || b.listingCardImagePosition === "") {
      out.listingCardImagePosition = "";
    } else if (typeof b.listingCardImagePosition === "string") {
      const s = sanitizeCssObjectPosition(b.listingCardImagePosition);
      if (s) out.listingCardImagePosition = s;
    }
  }
  return Object.keys(out).length ? out : null;
}

function validateRates(
  rates: Array<{ durationHours: number }>,
  options?: { pricingType?: "ticketed" | "charter"; tripDurationHours?: number }
): string | null {
  if (options?.pricingType === "ticketed") {
    if (rates.length !== 1) return "Ticketed experiences must include exactly one rate.";
    const tripDurationHours = options.tripDurationHours;
    if (tripDurationHours != null && tripDurationHours > 0 && rates[0].durationHours !== tripDurationHours) {
      return "Ticketed rate durationHours must match tripDurationHours.";
    }
  }
  const durations = new Set<number>();
  for (const rate of rates) {
    if (!(rate.durationHours > 0)) return "Each rate must have durationHours > 0.";
    if (durations.has(rate.durationHours)) return "Duplicate rate durationHours are not allowed.";
    durations.add(rate.durationHours);
  }
  return null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const db = getDb();
    const expRef = db.collection("experiences").doc(id);
    const expSnap = await expRef.get();
    if (!expSnap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const data = expSnap.data() as Record<string, unknown>;
    const [ratesSnap, addonsSnap] = await Promise.all([
      expRef.collection("rates").get(),
      expRef.collection("addons").get(),
    ]);
    const rates = ratesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const addons = addonsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ id: expSnap.id, ...data, updatedAt: (data as { updatedAt?: unknown }).updatedAt ?? null, rates, addons });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebaseConfig ? 503 : 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseBody(body);
  const force = body != null && typeof body === "object" && (body as { force?: unknown }).force === true;
  const hasLastKnownUpdatedAt =
    body != null &&
    typeof body === "object" &&
    Object.prototype.hasOwnProperty.call(body as Record<string, unknown>, "lastKnownUpdatedAt");
  const lastKnownUpdatedAtRaw =
    body != null && typeof body === "object"
      ? (body as { lastKnownUpdatedAt?: unknown }).lastKnownUpdatedAt
      : undefined;
  const lastKnownUpdatedAt =
    typeof lastKnownUpdatedAtRaw === "number"
      ? lastKnownUpdatedAtRaw
      : typeof lastKnownUpdatedAtRaw === "string" && lastKnownUpdatedAtRaw.trim()
        ? Number(lastKnownUpdatedAtRaw)
        : null;
  if (!parsed) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }
  if (typeof parsed.slug === "string" && (!parsed.slug || !isCanonicalSlug(parsed.slug))) {
    return NextResponse.json({ error: "Slug must be URL-safe lowercase (letters, numbers, hyphens)." }, { status: 400 });
  }

  try {
    const db = getDb();
    const { FieldValue } = getFirestoreExports();
    const expRef = db.collection("experiences").doc(id);
    const expSnap = await expRef.get();
    if (!expSnap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const expData = expSnap.data() as Experience;
    const currentUpdatedAt = typeof (expData as { updatedAt?: unknown }).updatedAt === "number"
      ? ((expData as { updatedAt?: number }).updatedAt as number)
      : null;
    if (!hasLastKnownUpdatedAt) {
      return NextResponse.json({ error: "Missing lastKnownUpdatedAt revision token." }, { status: 400 });
    }
    if (
      (currentUpdatedAt == null && lastKnownUpdatedAt != null) ||
      (currentUpdatedAt != null && !Number.isFinite(lastKnownUpdatedAt as number)) ||
      (currentUpdatedAt != null && currentUpdatedAt !== lastKnownUpdatedAt)
    ) {
      return NextResponse.json(
        { error: "This experience was updated in another tab. Refresh and retry your changes.", code: "STALE_WRITE" },
        { status: 409 }
      );
    }
    const storedPricingType = expData?.pricingType as string | undefined;
    const currentSlug = typeof expData?.slug === "string" ? expData.slug.trim() : "";
    const experienceIdVariants = getExperienceIdVariants(id, currentSlug);

    if (typeof parsed.slug === "string" && parsed.slug.trim() !== currentSlug) {
      const slugConflict = await db.collection("experiences").where("slug", "==", parsed.slug).limit(1).get();
      const conflicting = slugConflict.docs.find((d) => d.id !== id);
      if (conflicting) {
        return NextResponse.json({ error: "Slug already in use" }, { status: 409 });
      }
      const slugChangeBlockingBooking = await db
        .collection("bookings")
        .where("experienceId", "in", experienceIdVariants.slice(0, 10))
        .where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN))
        .limit(1)
        .get();
      if (!slugChangeBlockingBooking.empty) {
        return NextResponse.json(
          {
            error:
              "Cannot change slug while active bookings exist. Existing bookings still reference this listing by its current slug. Migrate booking/hold/slot experienceId values first, then rename.",
          },
          { status: 409 }
        );
      }
    }

    if (parsed.pricingType && parsed.pricingType !== storedPricingType) {
      const [bookingConflict, holdConflict] = await Promise.all([
        db
          .collection("bookings")
          .where("experienceId", "in", experienceIdVariants.slice(0, 10))
          .where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN))
          .limit(1)
          .get(),
        db
          .collection("holds")
          .where("experienceId", "in", experienceIdVariants.slice(0, 10))
          .where("status", "==", "active")
          .limit(1)
          .get(),
      ]);
      if (!bookingConflict.empty || !holdConflict.empty) {
        return NextResponse.json(
          {
            error:
              "Cannot change pricingType while active bookings or holds exist. Cancel/release reservations and migrate inventory first.",
            migrationHint:
              "For ticketed -> charter, clean up stale departure inventory after reservations are fully cleared.",
          },
          { status: 409 }
        );
      }
    }

    const effectivePricingType = parsed.pricingType ?? storedPricingType;
    const resultingActive = parsed.active ?? expData.active;
    if (resultingActive) {
      const ratesSource: Array<{ priceCents?: number; active?: boolean }> = Array.isArray(parsed.rates)
        ? parsed.rates.map((r) => ({ ...r, active: true }))
        : (
            await expRef.collection("rates").where("active", "==", true).get()
          ).docs.map((d) => d.data() as ExperienceRate);
      const activeRates = ratesSource.filter((r) => (r.active ?? true) && typeof r.priceCents === "number" && r.priceCents > 0);
      if (activeRates.length === 0) {
        return NextResponse.json(
          { error: "Active listings require at least one active rate with a positive price." },
          { status: 409 }
        );
      }
      if (effectivePricingType === "ticketed") {
        const maxCapacity = parsed.maxCapacity ?? expData.maxCapacity;
        const departureHour = parsed.departureHour ?? expData.departureHour;
        const departureMinute = parsed.departureMinute ?? expData.departureMinute;
        const tripDurationHours = parsed.tripDurationHours ?? expData.tripDurationHours;
        if (!maxCapacity || maxCapacity <= 0) {
          return NextResponse.json({ error: "Ticketed active listings require maxCapacity > 0." }, { status: 400 });
        }
        if (departureHour == null || departureMinute == null) {
          return NextResponse.json(
            { error: "Ticketed active listings require a departure time (hour and minute)." },
            { status: 400 }
          );
        }
        if (!tripDurationHours || tripDurationHours <= 0) {
          return NextResponse.json(
            { error: "Ticketed active listings require tripDurationHours > 0." },
            { status: 400 }
          );
        }
      }
    }
    const departureConfigChanged =
      effectivePricingType === "ticketed" &&
      ((typeof parsed.departureHour === "number" && parsed.departureHour !== expData.departureHour) ||
        (typeof parsed.departureMinute === "number" && parsed.departureMinute !== expData.departureMinute) ||
        (typeof parsed.tripDurationHours === "number" && parsed.tripDurationHours !== expData.tripDurationHours));
    if (departureConfigChanged) {
      const todayStr = getChicagoToday();
      const variants = experienceIdVariants.slice(0, 10);
      const [bookingSnap, holdsSnap] = await Promise.all([
        db
          .collection("bookings")
          .where("experienceId", "in", variants)
          .where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN))
          .where("startDateStr", ">=", todayStr)
          .limit(25)
          .get(),
        db
          .collection("holds")
          .where("experienceId", "in", variants)
          .where("status", "==", "active")
          .where("startDateStr", ">=", todayStr)
          .limit(25)
          .get(),
      ]);
      const bookingIds = bookingSnap.docs.map((d) => d.id);
      const nowMs = Date.now();
      const upcomingHoldDocs = holdsSnap.docs.filter((d) => {
        const expiresAt = (d.data() as { expiresAt?: { toMillis?: () => number } }).expiresAt;
        const expiresMs = expiresAt?.toMillis?.();
        return typeof expiresMs !== "number" || expiresMs > nowMs;
      });
      const holdIds = upcomingHoldDocs.map((d) => d.id);

      if (bookingIds.length > 0) {
        return NextResponse.json(
          {
            error:
              "Cannot change departure time or trip duration while upcoming bookings exist. Cancel or reschedule those trips in Admin → Bookings first.",
            bookingIds,
            ...(holdIds.length > 0 ? { holdIds } : {}),
          },
          { status: 409 }
        );
      }

      if (holdIds.length > 0 && !force) {
        return NextResponse.json(
          {
            error:
              "Cannot change departure time or trip duration while customers have active checkout holds for upcoming trips. Confirm to release those holds and save.",
            holdIds,
            activeHoldCount: holdIds.length,
            forceRequired: true,
          },
          { status: 409 }
        );
      }

      if (holdIds.length > 0 && force) {
        for (const holdDoc of upcomingHoldDocs) {
          try {
            const releaseResult = await runExpiredHoldReleaseTransaction(db, FieldValue, holdDoc.ref);
            await writeAdminAuditLog("experience_departure_config_release_hold", {
              experienceId: id,
              holdId: holdDoc.id,
              releaseResult,
            });
          } catch (releaseErr) {
            console.error("[admin/experiences/:id] departure-config release hold failed", {
              experienceId: id,
              holdId: holdDoc.id,
              error: releaseErr instanceof Error ? releaseErr.message : String(releaseErr),
            });
          }
        }
      }
    }

    const pricingDayConfigChanged =
      (Array.isArray(parsed.holidayDates) &&
        JSON.stringify(parsed.holidayDates) !== JSON.stringify(expData.holidayDates ?? [])) ||
      (Array.isArray(parsed.weekendDays) &&
        JSON.stringify(parsed.weekendDays) !== JSON.stringify(expData.weekendDays ?? [])) ||
      (Array.isArray(parsed.friSunDays) &&
        JSON.stringify(parsed.friSunDays) !== JSON.stringify(expData.friSunDays ?? []));
    let pricingDayHoldRelease:
      | {
          attempted: number;
          processed: string[];
          skipped: string[];
          failed: Array<{ holdId: string; error?: string }>;
          partialFailure: boolean;
        }
      | undefined;
    if (pricingDayConfigChanged) {
      const holdDocs = await collectAllActiveHoldDocsForExperience(db, experienceIdVariants);
      if (holdDocs.length > 0 && !force) {
        return NextResponse.json(
          {
            error:
              "Cannot change holiday/weekend pricing-day settings while active holds exist. Re-submit with { force: true } to release active holds first.",
            holdIds: holdDocs.map((d) => d.id),
            activeHoldCount: holdDocs.length,
            forceRequired: true,
          },
          { status: 409 }
        );
      }
      if (holdDocs.length > 0 && force) {
        const processed: string[] = [];
        const skipped: string[] = [];
        const failed: Array<{ holdId: string; error?: string }> = [];
        for (const holdDoc of holdDocs) {
          try {
            const releaseResult = await runExpiredHoldReleaseTransaction(db, FieldValue, holdDoc.ref);
            if (releaseResult === "processed") processed.push(holdDoc.id);
            else if (releaseResult === "skipped") skipped.push(holdDoc.id);
            else failed.push({ holdId: holdDoc.id });
            await writeAdminAuditLog("experience_pricing_day_release_hold", {
              experienceId: id,
              holdId: holdDoc.id,
              releaseResult,
            });
          } catch (releaseErr) {
            failed.push({
              holdId: holdDoc.id,
              error: releaseErr instanceof Error ? releaseErr.message : String(releaseErr),
            });
          }
        }
        pricingDayHoldRelease = {
          attempted: holdDocs.length,
          processed,
          skipped,
          failed,
          partialFailure: failed.length > 0,
        };
        console.log("[admin/experiences/:id] pricing-day release holds", { experienceId: id, ...pricingDayHoldRelease });
      }
    }

    if (parsed.seasonal) {
      const oldSeasonal = expData.seasonal;
      const newSeasonal = parsed.seasonal;
      const oldStart = typeof oldSeasonal?.startDate === "string" ? oldSeasonal.startDate : null;
      const oldEnd = typeof oldSeasonal?.endDate === "string" ? oldSeasonal.endDate : null;
      const newStart = typeof newSeasonal.startDate === "string" ? newSeasonal.startDate : oldStart;
      const newEnd = typeof newSeasonal.endDate === "string" ? newSeasonal.endDate : oldEnd;
      const narrowsWindow =
        (oldSeasonal?.enabled !== true && newSeasonal.enabled === true) ||
        (oldStart != null && newStart != null && newStart > oldStart) ||
        (oldEnd != null && newEnd != null && newEnd < oldEnd);
      if (narrowsWindow && newStart && newEnd) {
        const holdsSnap = await db
          .collection("holds")
          .where("experienceId", "in", experienceIdVariants.slice(0, 10))
          .where("status", "==", "active")
          .get();
        const affectedHoldIds = holdsSnap.docs
          .filter((d) => {
            const s = (d.data() as { startDateStr?: string }).startDateStr;
            return typeof s === "string" && (s < newStart || s > newEnd);
          })
          .map((d) => d.id);
        if (affectedHoldIds.length > 0) {
          return NextResponse.json(
            {
              error:
                "Cannot narrow seasonal availability while active holds exist outside the new date window. Cancel/release those holds first.",
              holdIds: affectedHoldIds,
            },
            { status: 409 }
          );
        }
      }
    }
    const ratesRef = expRef.collection("rates");
    const addonsRef = expRef.collection("addons");
    const wantsRatesArray = Array.isArray(parsed.rates);
    const wantsAddonsArray = Array.isArray(parsed.addons);
    const [existingRatesSnap, existingAddonsSnap] = await Promise.all([
      wantsRatesArray ? ratesRef.get() : Promise.resolve(null),
      wantsAddonsArray ? addonsRef.get() : Promise.resolve(null),
    ]);
    const rates =
      wantsRatesArray && parsed.rates && existingRatesSnap && !ratesPayloadMatchesFirestore(parsed.rates, existingRatesSnap)
        ? parsed.rates
        : undefined;
    if (rates) {
      const effectiveTripDurationHours =
        (typeof parsed.tripDurationHours === "number" && parsed.tripDurationHours > 0
          ? parsed.tripDurationHours
          : typeof expData.tripDurationHours === "number" && expData.tripDurationHours > 0
            ? expData.tripDurationHours
            : undefined);
      const ratesError = validateRates(rates, {
        pricingType: effectivePricingType === "ticketed" ? "ticketed" : "charter",
        tripDurationHours: effectiveTripDurationHours,
      });
      if (ratesError) {
        return NextResponse.json({ error: ratesError }, { status: 400 });
      }
    }
    const addons =
      wantsAddonsArray && parsed.addons && existingAddonsSnap && !addonsPayloadMatchesFirestore(parsed.addons, existingAddonsSnap)
        ? parsed.addons
        : undefined;

    const expFieldsForUpdate = buildExperienceDocUpdate(parsed as Parameters<typeof buildExperienceDocUpdate>[0], storedPricingType) as Record<string, unknown>;
    for (const key of ["heroImagePosition", "listingCardImagePosition"] as const) {
      if (expFieldsForUpdate[key] === "") {
        expFieldsForUpdate[key] = FieldValue.delete();
      }
    }

    // Accumulate all writes into a single batch for one round-trip.
    const batch = db.batch();
    const expUpdate: Record<string, unknown> = {};

    if (Object.keys(expFieldsForUpdate).length > 0) {
      Object.assign(expUpdate, stripUndefined(expFieldsForUpdate));
    }
    expUpdate.updatedAt = Date.now();

    if (effectivePricingType === "charter") {
      expUpdate.ticketedWeekdays = FieldValue.delete();
    } else if (effectivePricingType === "ticketed" && "ticketedWeekdays" in expUpdate) {
      const tw = expUpdate.ticketedWeekdays;
      if (!Array.isArray(tw)) {
        delete expUpdate.ticketedWeekdays;
      } else {
        const stored = ticketedWeekdaysForFirestore(normalizeTicketedWeekdaysInput(tw));
        expUpdate.ticketedWeekdays = stored == null ? FieldValue.delete() : stored;
      }
    }

    if (Array.isArray(rates) && existingRatesSnap) {
      let minPriceCents: number | null = null;
      const existingByDuration = new Map<number, FirebaseFirestore.QueryDocumentSnapshot>();
      for (const d of existingRatesSnap.docs) {
        const duration = (d.data() as { durationHours?: number }).durationHours;
        if (typeof duration === "number") existingByDuration.set(duration, d);
      }
      const incomingDurations = new Set<number>();
      for (const r of rates) {
        const duration = r.durationHours;
        incomingDurations.add(duration);
        const payload = { ...stripUndefined(r as Record<string, unknown>), active: true };
        const existing = existingByDuration.get(duration);
        if (existing) {
          batch.set(existing.ref, payload, { merge: true });
        } else {
          batch.set(ratesRef.doc(), payload);
        }
        if (typeof r.priceCents === "number" && r.priceCents > 0 && (minPriceCents === null || r.priceCents < minPriceCents)) {
          minPriceCents = r.priceCents;
        }
      }
      const rateIdsToDelete: string[] = [];
      for (const d of existingRatesSnap.docs) {
        const duration = (d.data() as { durationHours?: number }).durationHours;
        if (typeof duration === "number" && !incomingDurations.has(duration)) {
          rateIdsToDelete.push(d.id);
        }
      }
      if (rateIdsToDelete.length > 0) {
        const bookingSnap = await db
          .collection("bookings")
          .where("experienceId", "in", experienceIdVariants.slice(0, 10))
          .where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN))
          .get();
        const blockingBookingIds: string[] = [];
        for (const doc of bookingSnap.docs) {
          const rateId = (doc.data() as { rateId?: string }).rateId;
          if (typeof rateId === "string" && rateIdsToDelete.includes(rateId)) {
            blockingBookingIds.push(doc.id);
          }
        }
        if (blockingBookingIds.length > 0) {
          return NextResponse.json(
            {
              error: "Cannot remove rate durations referenced by active bookings.",
              bookingIds: blockingBookingIds,
              rateIds: rateIdsToDelete,
            },
            { status: 409 }
          );
        }
        const activeHoldsSnap = await db
          .collection("holds")
          .where("experienceId", "in", experienceIdVariants.slice(0, 10))
          .where("status", "==", "active")
          .get();
        const rateIdSet = new Set(rateIdsToDelete);
        const blockingHoldIds = activeHoldsSnap.docs
          .filter((doc) => {
            const holdRateId = (doc.data() as { rateId?: string }).rateId;
            return typeof holdRateId === "string" && rateIdSet.has(holdRateId);
          })
          .map((doc) => doc.id);
        if (blockingHoldIds.length > 0) {
          return NextResponse.json(
            {
              error:
                "Cannot remove rate durations referenced by active holds. Wait for holds to expire before deleting this duration option.",
              holdIds: blockingHoldIds,
              rateIds: rateIdsToDelete,
              holdExpiryMinutes: HOLD_EXPIRY_MINUTES,
            },
            { status: 409 }
          );
        }
        for (const d of existingRatesSnap.docs) {
          if (rateIdsToDelete.includes(d.id)) batch.delete(d.ref);
        }
      }
      expUpdate.fromPriceCents = minPriceCents ?? null;
    }

    if (Array.isArray(addons) && existingAddonsSnap) {
      const existingAddonIds = new Set(existingAddonsSnap.docs.map((d) => d.id));
      const activeHoldsSnap = await db
        .collection("holds")
        .where("experienceId", "in", experienceIdVariants.slice(0, 10))
        .where("status", "==", "active")
        .get();
      const blockingAddonsHoldIds = activeHoldsSnap.docs
        .filter((doc) => {
          const hold = doc.data() as {
            addonSelections?: { addonId?: string }[];
            pricing?: { subtotalCents?: number; taxCents?: number; feesCents?: number; totalCents?: number };
          };
          const referencesOldAddon =
            Array.isArray(hold.addonSelections) &&
            hold.addonSelections.some((s) => typeof s.addonId === "string" && existingAddonIds.has(s.addonId));
          if (!referencesOldAddon) return false;
          const p = hold.pricing;
          const hasCompletePricingSnapshot =
            p != null &&
            typeof p.subtotalCents === "number" &&
            typeof p.taxCents === "number" &&
            typeof p.feesCents === "number" &&
            typeof p.totalCents === "number";
          return !hasCompletePricingSnapshot;
        })
        .map((doc) => doc.id);
      if (blockingAddonsHoldIds.length > 0) {
        return NextResponse.json(
          {
            error:
              "Cannot replace addons while active holds reference current addon IDs without a complete pricing snapshot.",
            holdIds: blockingAddonsHoldIds,
          },
          { status: 409 }
        );
      }
      for (const d of existingAddonsSnap.docs) batch.delete(d.ref);
      for (const a of addons) {
        batch.set(addonsRef.doc(), { ...stripUndefined(a as Record<string, unknown>), active: true });
      }
    }

    if (Object.keys(expUpdate).length > 0) {
      batch.update(expRef, expUpdate as Partial<Experience>);
    }

    const isDeactivatingExperience = parsed.active === false && expData.active === true;
    if (isDeactivatingExperience) {
      const activeHoldsSnap = await db
        .collection("holds")
        .where("experienceId", "in", experienceIdVariants.slice(0, 10))
        .where("status", "==", "active")
        .limit(50)
        .get();
      if (!force && !activeHoldsSnap.empty) {
        return NextResponse.json(
          {
            error:
              "Deactivating this experience would release active customer holds. Re-submit with { force: true } to confirm hold release.",
            activeHoldCount: activeHoldsSnap.size,
            holdIds: activeHoldsSnap.docs.map((d) => d.id),
            forceRequired: true,
          },
          { status: 409 }
        );
      }
    }

    await batch.commit();
    let holdRelease:
      | {
          attempted: number;
          processed: string[];
          skipped: string[];
          failed: Array<{ holdId: string; error?: string }>;
          partialFailure: boolean;
        }
      | undefined;
    if (isDeactivatingExperience && force) {
      const activeHoldsSnap = await db
        .collection("holds")
        .where("experienceId", "in", experienceIdVariants.slice(0, 10))
        .where("status", "==", "active")
        .get();
      const processed: string[] = [];
      const skipped: string[] = [];
      const failed: Array<{ holdId: string; error?: string }> = [];
      for (const holdDoc of activeHoldsSnap.docs) {
        try {
          const releaseResult = await runExpiredHoldReleaseTransaction(db, FieldValue, holdDoc.ref);
          if (releaseResult === "processed") processed.push(holdDoc.id);
          else if (releaseResult === "skipped") skipped.push(holdDoc.id);
          else failed.push({ holdId: holdDoc.id });
          await writeAdminAuditLog("experience_deactivate_release_hold", {
            experienceId: id,
            holdId: holdDoc.id,
            releaseResult,
          });
        } catch (releaseErr) {
          failed.push({
            holdId: holdDoc.id,
            error: releaseErr instanceof Error ? releaseErr.message : String(releaseErr),
          });
        }
      }
      holdRelease = {
        attempted: activeHoldsSnap.size,
        processed,
        skipped,
        failed,
        partialFailure: failed.length > 0,
      };
      console.log("[admin/experiences/:id] deactivate release holds", { experienceId: id, ...holdRelease });
    }
    return NextResponse.json({
      id,
      ...(pricingDayHoldRelease ? { pricingDayHoldRelease } : {}),
      ...(holdRelease ? { holdRelease } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebaseConfig ? 503 : 500 }
    );
  }
}
