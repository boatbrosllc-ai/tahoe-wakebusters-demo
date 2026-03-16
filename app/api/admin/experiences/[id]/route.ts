import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import type {
  Experience,
  ExperienceRate,
  ExperienceAddon,
  ExperienceLocation,
  ExperienceCancellationPolicy,
  ExperienceSeasonal,
} from "@/lib/booking/types";

import { buildExperienceDocUpdate } from "@/lib/booking/experience-doc-update";

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
  allowDeposit: boolean;
}> | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const out: ReturnType<typeof parseBody> = {};
  if (typeof b.slug === "string") out.slug = b.slug.trim();
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
  if (typeof b.allowDeposit === "boolean") {
    out.allowDeposit = b.pricingType === "ticketed" ? false : b.allowDeposit;
  }
  return Object.keys(out).length ? out : null;
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
    return NextResponse.json({ id: expSnap.id, ...data, rates, addons });
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
  if (!parsed) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  try {
    const db = getDb();
    const expRef = db.collection("experiences").doc(id);
    const expSnap = await expRef.get();
    if (!expSnap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const storedPricingType = expSnap.data()?.pricingType as string | undefined;
    const expFieldsForUpdate = buildExperienceDocUpdate(parsed as Parameters<typeof buildExperienceDocUpdate>[0], storedPricingType);
    const { rates, addons } = parsed;
    const ratesRef = expRef.collection("rates");
    const addonsRef = expRef.collection("addons");

    // Fetch existing sub-collections only when we're replacing them, in parallel.
    const [existingRatesSnap, existingAddonsSnap] = await Promise.all([
      Array.isArray(rates) ? ratesRef.get() : Promise.resolve(null),
      Array.isArray(addons) ? addonsRef.get() : Promise.resolve(null),
    ]);

    // Accumulate all writes into a single batch for one round-trip.
    const batch = db.batch();
    const expUpdate: Record<string, unknown> = {};

    if (Object.keys(expFieldsForUpdate).length > 0) {
      Object.assign(expUpdate, stripUndefined(expFieldsForUpdate));
    }

    if (Array.isArray(rates) && existingRatesSnap) {
      let minPriceCents: number | null = null;
      for (const d of existingRatesSnap.docs) batch.delete(d.ref);
      for (const r of rates) {
        batch.set(ratesRef.doc(), { ...stripUndefined(r as Record<string, unknown>), active: true });
        if (typeof r.priceCents === "number" && (minPriceCents === null || r.priceCents < minPriceCents)) {
          minPriceCents = r.priceCents;
        }
      }
      expUpdate.fromPriceCents = minPriceCents ?? null;
    }

    if (Array.isArray(addons) && existingAddonsSnap) {
      for (const d of existingAddonsSnap.docs) batch.delete(d.ref);
      for (const a of addons) {
        batch.set(addonsRef.doc(), { ...stripUndefined(a as Record<string, unknown>), active: true });
      }
    }

    if (Object.keys(expUpdate).length > 0) {
      batch.update(expRef, expUpdate as Partial<Experience>);
    }

    await batch.commit();
    return NextResponse.json({ id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebaseConfig ? 503 : 500 }
    );
  }
}
