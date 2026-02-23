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

function parseBody(
  body: unknown
): { slug: string; title: string; subtitle: string; descriptionLong: string; heroMedia: { type: "image" | "video"; url: string }; gallery: string[]; location: ExperienceLocation; maxGuests: number; petsMax: number; included: string[]; whatToBring: string[]; rules: string[]; cancellationPolicy: ExperienceCancellationPolicy; faqs: { q: string; a: string }[]; seasonal: ExperienceSeasonal; active: boolean; timezone?: string; rates?: Omit<ExperienceRate, "active">[]; addons?: Omit<ExperienceAddon, "active">[]; heroOverlayText?: string; promoVideoUrl?: string; metaTitle?: string; metaDescription?: string; ctaButtonText?: string; cancellationSummary?: string; testimonials?: { name: string; quote: string; date?: string }[]; featured?: boolean; spotsLeftOverride?: number; defaultRateId?: string; bookingPosition?: "sidebar" | "inline" | "modal"; galleryAltTexts?: string[]; holidayDates?: { label?: string; start: string; end: string }[] } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const slug = typeof b.slug === "string" ? b.slug.trim() : "";
  if (!slug) return null;
  const title = typeof b.title === "string" ? b.title.trim() : "";
  const subtitle = typeof b.subtitle === "string" ? b.subtitle.trim() : "";
  const descriptionLong = typeof b.descriptionLong === "string" ? b.descriptionLong.trim() : "";
  const heroMedia =
    b.heroMedia && typeof b.heroMedia === "object" && "url" in b.heroMedia && typeof (b.heroMedia as { url: unknown }).url === "string"
      ? { type: (b.heroMedia as { type?: string }).type === "video" ? "video" as const : "image" as const, url: (b.heroMedia as { url: string }).url }
      : { type: "image" as const, url: "" };
  const gallery = Array.isArray(b.gallery) ? b.gallery.filter((x): x is string => typeof x === "string") : [];
  const loc = b.location && typeof b.location === "object" ? (b.location as Record<string, unknown>) : {};
  const location: ExperienceLocation = {
    title: typeof loc.title === "string" ? loc.title.trim() : "",
    addressText: typeof loc.addressText === "string" ? loc.addressText.trim() : "",
    notes: typeof loc.notes === "string" ? loc.notes.trim() : undefined,
  };
  const maxGuests = typeof b.maxGuests === "number" && b.maxGuests >= 0 ? Math.floor(b.maxGuests) : 0;
  const petsMax = typeof b.petsMax === "number" && b.petsMax >= 0 ? Math.floor(b.petsMax) : 0;
  const included = Array.isArray(b.included) ? b.included.filter((x): x is string => typeof x === "string") : [];
  const whatToBring = Array.isArray(b.whatToBring) ? b.whatToBring.filter((x): x is string => typeof x === "string") : [];
  const rules = Array.isArray(b.rules) ? b.rules.filter((x): x is string => typeof x === "string") : [];
  const cp = b.cancellationPolicy && typeof b.cancellationPolicy === "object" ? (b.cancellationPolicy as Record<string, unknown>) : {};
  const cancellationPolicy: ExperienceCancellationPolicy = {
    freeCancelDays: typeof cp.freeCancelDays === "number" ? cp.freeCancelDays : 30,
    partialRefundDaysStart: typeof cp.partialRefundDaysStart === "number" ? cp.partialRefundDaysStart : 15,
    partialRefundDaysEnd: typeof cp.partialRefundDaysEnd === "number" ? cp.partialRefundDaysEnd : 30,
    noRefundWithinDays: typeof cp.noRefundWithinDays === "number" ? cp.noRefundWithinDays : 14,
    fullText: typeof cp.fullText === "string" ? cp.fullText : "",
  };
  const faqs = Array.isArray(b.faqs)
    ? b.faqs
        .filter((x): x is { q?: unknown; a?: unknown } => x != null && typeof x === "object")
        .map((x) => ({ q: typeof x.q === "string" ? x.q : "", a: typeof x.a === "string" ? x.a : "" }))
    : [];
  const sea = b.seasonal && typeof b.seasonal === "object" ? (b.seasonal as Record<string, unknown>) : {};
  const seasonal: ExperienceSeasonal = {
    enabled: sea.enabled === true,
    startMonth: typeof sea.startMonth === "number" ? sea.startMonth : undefined,
    endMonth: typeof sea.endMonth === "number" ? sea.endMonth : undefined,
  };
  const active = b.active === true;
  const timezone = typeof b.timezone === "string" ? b.timezone.trim() || undefined : undefined;
  const rates = Array.isArray(b.rates)
    ? b.rates
        .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
        .map((x) => ({
          durationHours: typeof x.durationHours === "number" ? x.durationHours : 0,
          displayName: typeof x.displayName === "string" ? x.displayName : "",
          priceCents: typeof x.priceCents === "number" ? x.priceCents : 0,
          priceWeekendCents: typeof x.priceWeekendCents === "number" ? x.priceWeekendCents : undefined,
          priceHolidayCents: typeof x.priceHolidayCents === "number" ? x.priceHolidayCents : undefined,
        }))
    : undefined;
  const holidayDates = Array.isArray(b.holidayDates)
    ? (b.holidayDates as { label?: string; start?: string; end?: string; recurring?: boolean; priceCents?: number; priceCentsByDuration?: Record<string, number> }[])
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
        })
    : undefined;
  const addons = Array.isArray(b.addons)
    ? b.addons
        .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
        .map((x) => ({
          name: typeof x.name === "string" ? x.name : "",
          description: typeof x.description === "string" ? x.description : undefined,
          priceCents: typeof x.priceCents === "number" ? x.priceCents : 0,
          type: (x.type === "quantity" || x.type === "tip" ? x.type : "toggle") as "toggle" | "quantity" | "tip",
          maxQty: typeof x.maxQty === "number" ? x.maxQty : undefined,
          highlight: x.highlight === true,
        }))
    : undefined;
  const heroOverlayText = typeof b.heroOverlayText === "string" ? b.heroOverlayText.trim() || undefined : undefined;
  const promoVideoUrl = typeof b.promoVideoUrl === "string" ? b.promoVideoUrl.trim() || undefined : undefined;
  const metaTitle = typeof b.metaTitle === "string" ? b.metaTitle.trim() || undefined : undefined;
  const metaDescription = typeof b.metaDescription === "string" ? b.metaDescription.trim() || undefined : undefined;
  const ctaButtonText = typeof b.ctaButtonText === "string" ? b.ctaButtonText.trim() || undefined : undefined;
  const cancellationSummary = typeof b.cancellationSummary === "string" ? b.cancellationSummary.trim() || undefined : undefined;
  const testimonials = Array.isArray(b.testimonials)
    ? b.testimonials
        .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
        .map((x) => ({
          name: typeof x.name === "string" ? x.name : "",
          quote: typeof x.quote === "string" ? x.quote : "",
          date: typeof x.date === "string" ? x.date : undefined,
        }))
        .filter((t) => t.name || t.quote)
    : undefined;
  const featured = b.featured === true;
  const spotsLeftOverride = typeof b.spotsLeftOverride === "number" && b.spotsLeftOverride >= 0 ? b.spotsLeftOverride : undefined;
  const defaultRateId = typeof b.defaultRateId === "string" ? b.defaultRateId.trim() || undefined : undefined;
  const bookingPosition = b.bookingPosition === "inline" || b.bookingPosition === "modal" ? b.bookingPosition : b.bookingPosition === "sidebar" ? "sidebar" : undefined;
  const galleryAltTexts = Array.isArray(b.galleryAltTexts) ? b.galleryAltTexts.filter((x): x is string => typeof x === "string") : undefined;
  const pricingType = b.pricingType === "ticketed" ? "ticketed" as const : undefined;
  const maxCapacity = b.pricingType === "ticketed" && typeof b.maxCapacity === "number" && b.maxCapacity > 0 ? b.maxCapacity : undefined;
  const departureHour = b.pricingType === "ticketed" && typeof b.departureHour === "number" ? Math.min(23, Math.max(0, Math.floor(b.departureHour))) : undefined;
  const departureMinute = b.pricingType === "ticketed" && typeof b.departureMinute === "number" ? Math.min(59, Math.max(0, Math.floor(b.departureMinute))) : undefined;
  const tripDurationHours = b.pricingType === "ticketed" && typeof b.tripDurationHours === "number" && b.tripDurationHours > 0 ? b.tripDurationHours : undefined;
  return {
    slug,
    title,
    subtitle,
    descriptionLong,
    heroMedia,
    gallery,
    location,
    maxGuests,
    petsMax,
    included,
    whatToBring,
    rules,
    cancellationPolicy,
    faqs,
    seasonal,
    active,
    timezone,
    rates,
    addons,
    heroOverlayText,
    promoVideoUrl,
    metaTitle,
    metaDescription,
    ctaButtonText,
    cancellationSummary,
    testimonials,
    featured: featured || undefined,
    spotsLeftOverride,
    defaultRateId,
    bookingPosition,
    galleryAltTexts,
    holidayDates,
    pricingType,
    maxCapacity,
    departureHour,
    departureMinute,
    tripDurationHours,
  };
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const db = getDb();
    const snap = await db.collection("experiences").get();
    const list = snap.docs.map((d) => {
      const data = d.data();
      const heroMedia = data.heroMedia && typeof data.heroMedia === "object" && (data.heroMedia as { url?: string }).url;
      return {
        id: d.id,
        slug: data.slug ?? "",
        title: data.title ?? "",
        active: data.active === true,
        pricingType: data.pricingType === "ticketed" ? "ticketed" : undefined,
        heroUrl: typeof heroMedia === "string" ? heroMedia : undefined,
        sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : undefined,
      };
    });
    list.sort((a, b) => {
      const orderA = a.sortOrder ?? 999;
      const orderB = b.sortOrder ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return (a.title ?? "").localeCompare(b.title ?? "");
    });
    return NextResponse.json(list);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: message, hint: FIREBASE_SETUP_HINT },
      { status: 503 }
    );
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseBody(body);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid body: slug required" }, { status: 400 });
  }

  try {
    const db = getDb();
    const existing = await db.collection("experiences").where("slug", "==", parsed.slug).limit(1).get();
    if (!existing.empty) {
      return NextResponse.json({ error: "Slug already in use" }, { status: 409 });
    }
    const exp: Omit<Experience, "id"> = {
      slug: parsed.slug,
      title: parsed.title,
      subtitle: parsed.subtitle,
      descriptionLong: parsed.descriptionLong,
      heroMedia: parsed.heroMedia,
      gallery: parsed.gallery,
      location: parsed.location,
      maxGuests: parsed.maxGuests,
      petsMax: parsed.petsMax,
      included: parsed.included,
      whatToBring: parsed.whatToBring,
      rules: parsed.rules,
      cancellationPolicy: parsed.cancellationPolicy,
      faqs: parsed.faqs,
      seasonal: parsed.seasonal,
      active: parsed.active,
      timezone: parsed.timezone,
      ...(parsed.heroOverlayText != null && { heroOverlayText: parsed.heroOverlayText }),
      ...(parsed.promoVideoUrl != null && { promoVideoUrl: parsed.promoVideoUrl }),
      ...(parsed.metaTitle != null && { metaTitle: parsed.metaTitle }),
      ...(parsed.metaDescription != null && { metaDescription: parsed.metaDescription }),
      ...(parsed.ctaButtonText != null && { ctaButtonText: parsed.ctaButtonText }),
      ...(parsed.cancellationSummary != null && { cancellationSummary: parsed.cancellationSummary }),
      ...(parsed.testimonials != null && parsed.testimonials.length > 0 && { testimonials: parsed.testimonials }),
      ...(parsed.featured && { featured: true }),
      ...(parsed.spotsLeftOverride != null && { spotsLeftOverride: parsed.spotsLeftOverride }),
      ...(parsed.defaultRateId != null && { defaultRateId: parsed.defaultRateId }),
      ...(parsed.bookingPosition != null && { bookingPosition: parsed.bookingPosition }),
      ...(parsed.galleryAltTexts != null && parsed.galleryAltTexts.length > 0 && { galleryAltTexts: parsed.galleryAltTexts }),
      ...(parsed.holidayDates != null && parsed.holidayDates.length > 0 && { holidayDates: parsed.holidayDates }),
      ...(parsed.pricingType != null && { pricingType: parsed.pricingType }),
      ...(parsed.maxCapacity != null && { maxCapacity: parsed.maxCapacity }),
      ...(parsed.departureHour != null && { departureHour: parsed.departureHour }),
      ...(parsed.tripDurationHours != null && { tripDurationHours: parsed.tripDurationHours }),
      ...(parsed.departureMinute != null && { departureMinute: parsed.departureMinute }),
    };
    const ref = db.collection("experiences").doc();
    await ref.set(exp);
    const expId = ref.id;
    if (parsed.rates?.length) {
      for (const r of parsed.rates) {
        await ref.collection("rates").doc().set({ ...r, active: true });
      }
    }
    if (parsed.addons?.length) {
      for (const a of parsed.addons) {
        await ref.collection("addons").doc().set({ ...a, active: true });
      }
    }
    return NextResponse.json({ id: expId, slug: parsed.slug });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: message, hint: FIREBASE_SETUP_HINT },
      { status: 503 }
    );
  }
}
