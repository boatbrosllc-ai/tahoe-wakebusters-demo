"use client";

import { useState } from "react";
import Link from "next/link";
import { Anchor, Users, Info, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DynamicPricingEditor } from "@/components/admin/DynamicPricingEditor";
import { PhotoUploader } from "@/components/admin/PhotoUploader";

const inputClass =
  "mt-1 block w-full min-h-[44px] rounded-lg border border-brand-dark/20 px-3 py-2.5 text-sm text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary sm:min-h-0 sm:py-2";
const textareaClass =
  "mt-1 block w-full rounded-lg border border-brand-dark/20 px-3 py-2.5 text-sm text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary";

const defaultCancellation = {
  freeCancelDays: 30,
  partialRefundDaysStart: 15,
  partialRefundDaysEnd: 30,
  noRefundWithinDays: 14,
  fullText:
    "Free cancellation up to 30 days before. Partial refund 15–30 days before. No refund within 14 days.",
};

type RateRow = {
  durationHours: number;
  displayName: string;
  priceCents: number;
  priceWeekendCents?: number;
  priceFriSunCents?: number;
  priceHolidayCents?: number;
};
type HolidayDateRow = { label: string; start: string; end: string; recurring?: boolean; priceCents?: number; priceCentsByDuration?: Record<number, number> };
type AddonRow = { name: string; description: string; priceCents: number; type: "toggle" | "quantity" | "tip"; maxQty: number; highlight: boolean };
type FaqRow = { q: string; a: string };
type TestimonialRow = { name: string; quote: string; date: string };

export type ExperienceFormData = {
  slug: string;
  title: string;
  subtitle: string;
  descriptionLong: string;
  heroType: "image" | "video";
  heroUrl: string;
  gallery: string[];
  locationTitle: string;
  locationAddress: string;
  locationNotes: string;
  maxGuests: number;
  petsMax: number;
  included: string[];
  whatToBring: string[];
  rules: string[];
  cancellationPolicy: typeof defaultCancellation;
  faqs: FaqRow[];
  seasonalEnabled: boolean;
  seasonalStartMonth: number;
  seasonalEndMonth: number;
  /** Optional specific date range (YYYY-MM-DD). When both set, overrides month range. */
  seasonalStartDate: string;
  seasonalEndDate: string;
  active: boolean;
  timezone: string;
  rates: RateRow[];
  addons: AddonRow[];
  heroOverlayText: string;
  promoVideoUrl: string;
  metaTitle: string;
  metaDescription: string;
  ctaButtonText: string;
  cancellationSummary: string;
  testimonials: TestimonialRow[];
  featured: boolean;
  spotsLeftOverride: string;
  defaultRateId: string;
  bookingPosition: "sidebar" | "inline" | "modal";
  galleryAltTexts: string[];
  holidayDates: HolidayDateRow[];
  weekendDays: number[];
  friSunDays: number[];
  pricingType: "charter" | "ticketed";
  maxCapacity: number;
  departureHour: number;
  departureMinute: number;
  tripDurationHours: number;
  showSpotsRemaining?: boolean;
  allowDeposit: boolean;
  allowTipNow: boolean;
  allowTipLater: boolean;
};

function getDefaultFormData(): ExperienceFormData {
  return {
    slug: "",
    title: "",
    subtitle: "",
    descriptionLong: "",
    heroType: "image",
    heroUrl: "",
    gallery: [],
    locationTitle: "",
    locationAddress: "",
    locationNotes: "",
    maxGuests: 0,
    petsMax: 0,
    included: [],
    whatToBring: [],
    rules: [],
    cancellationPolicy: defaultCancellation,
    faqs: [],
    seasonalEnabled: false,
    seasonalStartMonth: 1,
    seasonalEndMonth: 12,
    seasonalStartDate: "",
    seasonalEndDate: "",
    active: true,
    timezone: "America/Chicago",
    rates: [],
    addons: [],
    heroOverlayText: "",
    promoVideoUrl: "",
    metaTitle: "",
    metaDescription: "",
    ctaButtonText: "",
    cancellationSummary: "",
    testimonials: [],
    featured: false,
    spotsLeftOverride: "",
    defaultRateId: "",
    bookingPosition: "sidebar",
    galleryAltTexts: [],
    holidayDates: [],
    weekendDays: [0, 6],
    friSunDays: [],
    pricingType: "charter",
    maxCapacity: 0,
    departureHour: 10,
    departureMinute: 0,
    tripDurationHours: 1,
    showSpotsRemaining: false,
    allowDeposit: false,
    allowTipNow: true,
    allowTipLater: true,
  };
}

function dataFromApi(api: Record<string, unknown>): ExperienceFormData {
  const loc = (api.location as Record<string, unknown>) ?? {};
  const cp = (api.cancellationPolicy as Record<string, unknown>) ?? {};
  const sea = (api.seasonal as Record<string, unknown>) ?? {};
  const hero = (api.heroMedia as { type?: string; url?: string }) ?? {};
  const rates = (api.rates as Array<Record<string, unknown>>) ?? [];
  const addons = (api.addons as Array<Record<string, unknown>>) ?? [];
  const faqs = (api.faqs as Array<{ q?: string; a?: string }>) ?? [];
  return {
    slug: typeof api.slug === "string" ? api.slug : "",
    title: typeof api.title === "string" ? api.title : "",
    subtitle: typeof api.subtitle === "string" ? api.subtitle : "",
    descriptionLong: typeof api.descriptionLong === "string" ? api.descriptionLong : "",
    heroType: hero.type === "video" ? "video" : "image",
    heroUrl: typeof hero.url === "string" ? hero.url : "",
    gallery: Array.isArray(api.gallery) ? api.gallery.filter((x): x is string => typeof x === "string") : [],
    locationTitle: typeof loc.title === "string" ? loc.title : "",
    locationAddress: typeof loc.addressText === "string" ? loc.addressText : "",
    locationNotes: typeof loc.notes === "string" ? loc.notes : "",
    maxGuests: typeof api.maxGuests === "number" ? api.maxGuests : 0,
    petsMax: typeof api.petsMax === "number" ? api.petsMax : 0,
    included: Array.isArray(api.included) ? api.included.filter((x): x is string => typeof x === "string") : [],
    whatToBring: Array.isArray(api.whatToBring) ? api.whatToBring.filter((x): x is string => typeof x === "string") : [],
    rules: Array.isArray(api.rules) ? api.rules.filter((x): x is string => typeof x === "string") : [],
    cancellationPolicy: {
      freeCancelDays: typeof cp.freeCancelDays === "number" ? cp.freeCancelDays : 30,
      partialRefundDaysStart: typeof cp.partialRefundDaysStart === "number" ? cp.partialRefundDaysStart : 15,
      partialRefundDaysEnd: typeof cp.partialRefundDaysEnd === "number" ? cp.partialRefundDaysEnd : 30,
      noRefundWithinDays: typeof cp.noRefundWithinDays === "number" ? cp.noRefundWithinDays : 14,
      fullText: typeof cp.fullText === "string" ? cp.fullText : defaultCancellation.fullText,
    },
    faqs: faqs.map((x) => ({ q: typeof x.q === "string" ? x.q : "", a: typeof x.a === "string" ? x.a : "" })),
    seasonalEnabled: sea.enabled === true,
    seasonalStartMonth: typeof sea.startMonth === "number" ? sea.startMonth : 1,
    seasonalEndMonth: typeof sea.endMonth === "number" ? sea.endMonth : 12,
    seasonalStartDate: typeof (sea as { startDate?: string }).startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test((sea as { startDate: string }).startDate) ? (sea as { startDate: string }).startDate : "",
    seasonalEndDate: typeof (sea as { endDate?: string }).endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test((sea as { endDate: string }).endDate) ? (sea as { endDate: string }).endDate : "",
    active: api.active === true,
    timezone: typeof api.timezone === "string" ? api.timezone : "America/Chicago",
    rates: rates.map((r) => ({
      durationHours: typeof r.durationHours === "number" ? r.durationHours : 0,
      displayName: typeof r.displayName === "string" ? r.displayName : "",
      priceCents: typeof r.priceCents === "number" ? r.priceCents : 0,
      priceWeekendCents: typeof (r as { priceWeekendCents?: number }).priceWeekendCents === "number" ? (r as { priceWeekendCents: number }).priceWeekendCents : undefined,
      priceFriSunCents: typeof (r as { priceFriSunCents?: number }).priceFriSunCents === "number" ? (r as { priceFriSunCents: number }).priceFriSunCents : undefined,
      priceHolidayCents: typeof (r as { priceHolidayCents?: number }).priceHolidayCents === "number" ? (r as { priceHolidayCents: number }).priceHolidayCents : undefined,
    })),
    addons: addons.map((a) => ({
      name: typeof a.name === "string" ? a.name : "",
      description: typeof a.description === "string" ? a.description : "",
      priceCents: typeof a.priceCents === "number" ? a.priceCents : 0,
      type: (a.type === "quantity" || a.type === "tip" ? a.type : "toggle") as "toggle" | "quantity" | "tip",
      maxQty: typeof a.maxQty === "number" ? a.maxQty : 0,
      highlight: a.highlight === true,
    })),
    heroOverlayText: typeof api.heroOverlayText === "string" ? api.heroOverlayText : "",
    promoVideoUrl: typeof api.promoVideoUrl === "string" ? api.promoVideoUrl : "",
    metaTitle: typeof api.metaTitle === "string" ? api.metaTitle : "",
    metaDescription: typeof api.metaDescription === "string" ? api.metaDescription : "",
    ctaButtonText: typeof api.ctaButtonText === "string" ? api.ctaButtonText : "",
    cancellationSummary: typeof api.cancellationSummary === "string" ? api.cancellationSummary : "",
    testimonials: Array.isArray(api.testimonials)
      ? (api.testimonials as { name?: string; quote?: string; date?: string }[]).map((t) => ({
          name: typeof t.name === "string" ? t.name : "",
          quote: typeof t.quote === "string" ? t.quote : "",
          date: typeof t.date === "string" ? t.date : "",
        }))
      : [],
    featured: api.featured === true,
    spotsLeftOverride: typeof api.spotsLeftOverride === "number" ? String(api.spotsLeftOverride) : "",
    defaultRateId: typeof api.defaultRateId === "string" ? api.defaultRateId : "",
    bookingPosition: api.bookingPosition === "inline" || api.bookingPosition === "modal" ? api.bookingPosition : "sidebar",
    galleryAltTexts: Array.isArray(api.galleryAltTexts) ? api.galleryAltTexts.filter((x): x is string => typeof x === "string") : [],
    holidayDates: Array.isArray(api.holidayDates)
      ? (api.holidayDates as { label?: string; start?: string; end?: string; recurring?: boolean; priceCents?: number; priceCentsByDuration?: Record<string, number> }[]).map((h) => {
          const byDur = h.priceCentsByDuration && typeof h.priceCentsByDuration === "object"
            ? Object.fromEntries(
                Object.entries(h.priceCentsByDuration).filter(
                  ([k, v]) => Number.isFinite(Number(k)) && typeof v === "number"
                ).map(([k, v]) => [Number(k), v] as [number, number])
              ) as Record<number, number>
            : undefined;
          return {
            label: typeof h.label === "string" ? h.label : "",
            start: typeof h.start === "string" ? h.start : "",
            end: typeof h.end === "string" ? h.end : "",
            recurring: h.recurring === true,
            priceCents: typeof h.priceCents === "number" ? h.priceCents : undefined,
            ...(byDur && Object.keys(byDur).length > 0 && { priceCentsByDuration: byDur }),
          };
        })
      : [],
    weekendDays: Array.isArray(api.weekendDays)
      ? (api.weekendDays as number[]).filter((x) => typeof x === "number" && x >= 0 && x <= 6).sort((a, b) => a - b)
      : [0, 6],
    friSunDays: Array.isArray(api.friSunDays)
      ? (api.friSunDays as number[]).filter((x) => typeof x === "number" && x >= 0 && x <= 6).sort((a, b) => a - b)
      : [],
    pricingType: api.pricingType === "ticketed" ? "ticketed" : "charter",
    maxCapacity: typeof api.maxCapacity === "number" ? api.maxCapacity : 0,
    departureHour: typeof api.departureHour === "number" ? api.departureHour : 10,
    departureMinute: typeof api.departureMinute === "number" ? api.departureMinute : 0,
    tripDurationHours: typeof api.tripDurationHours === "number" && api.tripDurationHours > 0 ? api.tripDurationHours : 1,
    showSpotsRemaining: api.showSpotsRemaining === true,
    allowDeposit: api.allowDeposit === true,
    allowTipNow: api.allowTipNow !== false,
    allowTipLater: api.allowTipLater !== false,
  };
}

function formDataToBody(d: ExperienceFormData): Record<string, unknown> {
  return {
    slug: d.slug,
    title: d.title,
    subtitle: d.subtitle,
    descriptionLong: d.descriptionLong,
    heroMedia: { type: d.heroType, url: d.heroUrl },
    gallery: d.gallery,
    location: { title: d.locationTitle, addressText: d.locationAddress, notes: d.locationNotes || undefined },
    maxGuests: d.maxGuests,
    petsMax: 0, // Pets are offered as add-ons only; no separate max-pets field
    included: d.included,
    whatToBring: d.whatToBring,
    rules: d.rules,
    cancellationPolicy: d.cancellationPolicy,
    faqs: d.faqs,
    seasonal: {
      enabled: d.seasonalEnabled,
      startMonth: d.seasonalStartMonth,
      endMonth: d.seasonalEndMonth,
      ...(d.seasonalStartDate && d.seasonalEndDate && /^\d{4}-\d{2}-\d{2}$/.test(d.seasonalStartDate) && /^\d{4}-\d{2}-\d{2}$/.test(d.seasonalEndDate) && { startDate: d.seasonalStartDate, endDate: d.seasonalEndDate }),
    },
    active: d.active,
    timezone: d.timezone || undefined,
    rates: d.rates.map((r) => ({
      durationHours: r.durationHours,
      displayName: r.displayName,
      priceCents: r.priceCents,
      ...(r.priceWeekendCents != null && { priceWeekendCents: r.priceWeekendCents }),
      ...(r.priceFriSunCents != null && { priceFriSunCents: r.priceFriSunCents }),
      ...(r.priceHolidayCents != null && { priceHolidayCents: r.priceHolidayCents }),
    })),
    addons: d.addons.map((a) => ({
      name: a.name,
      description: a.description || undefined,
      priceCents: a.priceCents,
      type: a.type,
      maxQty: a.maxQty || undefined,
      ...(a.highlight && { highlight: true }),
    })),
    ...(d.heroOverlayText && { heroOverlayText: d.heroOverlayText }),
    ...(d.promoVideoUrl && { promoVideoUrl: d.promoVideoUrl }),
    ...(d.metaTitle && { metaTitle: d.metaTitle }),
    ...(d.metaDescription && { metaDescription: d.metaDescription }),
    ...(d.ctaButtonText && { ctaButtonText: d.ctaButtonText }),
    ...(d.cancellationSummary && { cancellationSummary: d.cancellationSummary }),
    ...(d.testimonials.length > 0 && { testimonials: d.testimonials.map((t) => ({ name: t.name, quote: t.quote, ...(t.date && { date: t.date }) })) }),
    featured: d.featured,
    ...(d.spotsLeftOverride !== "" ? (() => { const n = parseInt(d.spotsLeftOverride, 10); return !isNaN(n) ? { spotsLeftOverride: n } : {}; })() : {}),
    ...(d.defaultRateId && { defaultRateId: d.defaultRateId }),
    ...(d.bookingPosition !== "sidebar" && { bookingPosition: d.bookingPosition }),
    ...(d.galleryAltTexts.length > 0 && { galleryAltTexts: d.galleryAltTexts }),
    ...(d.holidayDates.length > 0 && { holidayDates: d.holidayDates.filter((h) => h.start || h.end) }),
    weekendDays: d.weekendDays.length > 0 ? d.weekendDays : [0, 6],
    ...(d.friSunDays?.length ? { friSunDays: d.friSunDays } : {}),
    pricingType: d.pricingType,
    ...(d.pricingType === "charter" && { allowDeposit: d.allowDeposit ?? false }),
    allowTipNow: d.allowTipNow !== false,
    allowTipLater: d.allowTipLater !== false,
    ...(d.pricingType === "ticketed" && {
      allowDeposit: false,
      maxCapacity: d.maxCapacity || undefined,
      departureHour: d.departureHour,
      departureMinute: d.departureMinute,
      tripDurationHours: d.tripDurationHours > 0 ? d.tripDurationHours : 1,
      showSpotsRemaining: d.showSpotsRemaining ?? false,
    }),
  };
}

interface ExperienceFormProps {
  initialData?: ExperienceFormData | null;
  experienceId?: string | null;
  backHref: string;
  submitLabel: string;
  onSubmit: (body: Record<string, unknown>) => Promise<{ id?: string }>;
}

export function ExperienceForm({
  initialData,
  experienceId,
  backHref,
  submitLabel,
  onSubmit,
}: ExperienceFormProps) {
  const [data, setData] = useState<ExperienceFormData>(() => initialData ?? getDefaultFormData());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const toggleSection = (name: string) => setCollapsedSections((prev) => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  const update = <K extends keyof ExperienceFormData>(key: K, value: ExperienceFormData[K]) => {
    setData((prev) => ({ ...prev, [key]: value }));
  };

  const addToList = (key: "gallery" | "included" | "whatToBring" | "rules", value = "") => {
    setData((prev) => ({ ...prev, [key]: [...prev[key], value] }));
  };
  const removeFromList = (key: "gallery" | "included" | "whatToBring" | "rules", index: number) => {
    setData((prev) => ({ ...prev, [key]: prev[key].filter((_, i) => i !== index) }));
  };
  const setListItem = (key: "gallery" | "included" | "whatToBring" | "rules", index: number, value: string) => {
    setData((prev) => ({
      ...prev,
      [key]: prev[key].map((v, i) => (i === index ? value : v)),
    }));
  };

  const addFaq = () => setData((prev) => ({ ...prev, faqs: [...prev.faqs, { q: "", a: "" }] }));
  const removeFaq = (i: number) => setData((prev) => ({ ...prev, faqs: prev.faqs.filter((_, idx) => idx !== i) }));
  const setFaq = (i: number, field: "q" | "a", value: string) => {
    setData((prev) => ({
      ...prev,
      faqs: prev.faqs.map((f, idx) => (idx === i ? { ...f, [field]: value } : f)),
    }));
  };
  const addTestimonial = () => setData((prev) => ({ ...prev, testimonials: [...prev.testimonials, { name: "", quote: "", date: "" }] }));
  const removeTestimonial = (i: number) => setData((prev) => ({ ...prev, testimonials: prev.testimonials.filter((_, idx) => idx !== i) }));
  const setTestimonial = (i: number, field: keyof TestimonialRow, value: string) => {
    setData((prev) => ({
      ...prev,
      testimonials: prev.testimonials.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)),
    }));
  };
  const setGalleryAlt = (index: number, value: string) => {
    setData((prev) => {
      const next = [...(prev.galleryAltTexts || [])];
      while (next.length < prev.gallery.length) next.push("");
      next[index] = value;
      return { ...prev, galleryAltTexts: next };
    });
  };

  const addRate = () =>
    setData((prev) => ({
      ...prev,
      rates: [...prev.rates, { durationHours: 3, displayName: "", priceCents: 0 }],
    }));
  const removeRate = (i: number) => setData((prev) => ({ ...prev, rates: prev.rates.filter((_, idx) => idx !== i) }));
  const setRate = (i: number, field: keyof RateRow, value: number | string) => {
    setData((prev) => ({
      ...prev,
      rates: prev.rates.map((r, idx) =>
        idx === i ? { ...r, [field]: (field === "displayName" ? value : (typeof value === "number" ? value : r[field])) } : r
      ),
    }));
  };
  const setRateNum = (i: number, field: "durationHours" | "priceCents" | "priceWeekendCents" | "priceFriSunCents" | "priceHolidayCents", value: number) => {
    setData((prev) => ({
      ...prev,
      rates: prev.rates.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)),
    }));
  };
  const setRateOptionalCents = (i: number, field: "priceWeekendCents" | "priceFriSunCents" | "priceHolidayCents", value: number | undefined) => {
    setData((prev) => ({
      ...prev,
      rates: prev.rates.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)),
    }));
  };
  const addHoliday = () =>
    setData((prev) => ({
      ...prev,
      holidayDates: [...prev.holidayDates, { label: "", start: "", end: "" }],
    }));
  const removeHoliday = (i: number) =>
    setData((prev) => ({ ...prev, holidayDates: prev.holidayDates.filter((_, idx) => idx !== i) }));
  const setHoliday = (i: number, field: keyof HolidayDateRow, value: string) => {
    setData((prev) => ({
      ...prev,
      holidayDates: prev.holidayDates.map((h, idx) => (idx === i ? { ...h, [field]: value } : h)),
    }));
  };

  const addAddon = () =>
    setData((prev) => ({
      ...prev,
      addons: [...prev.addons, { name: "", description: "", priceCents: 0, type: "toggle", maxQty: 0, highlight: false }],
    }));
  const removeAddon = (i: number) => setData((prev) => ({ ...prev, addons: prev.addons.filter((_, idx) => idx !== i) }));
  const setAddon = (i: number, field: keyof AddonRow, value: string | number | boolean) => {
    setData((prev) => ({
      ...prev,
      addons: prev.addons.map((a, idx) =>
        idx === i ? { ...a, [field]: value } : a
      ),
    }));
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (data.pricingType === "ticketed" && data.rates.some((r) => r.priceCents === 0)) {
      setError("Ticketed experiences cannot have a rate with $0 price. Set a positive price for each active rate.");
      setLoading(false);
      return;
    }
    try {
      const body = formDataToBody(data);
      const result = await onSubmit(body);
      if (result.id) {
        window.location.href = experienceId ? `/admin/experiences` : `/admin/experiences/${result.id}`;
      } else {
        window.location.href = "/admin/experiences";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Link href={backHref}>
          <Button type="button" variant="ghost" size="sm" className="min-h-[44px] sm:min-h-0">Back</Button>
        </Link>
        <Button type="submit" disabled={loading} className="min-h-[44px] sm:min-h-0">{loading ? "Saving…" : submitLabel}</Button>
      </div>
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <section className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 lg:p-8 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-brand-dark">Basics</h2>
          <button type="button" onClick={() => toggleSection("basics")} className="lg:hidden flex items-center gap-1 text-sm text-brand-muted hover:text-brand-dark" aria-expanded={!collapsedSections.has("basics")}>
            {collapsedSections.has("basics") ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
        {!collapsedSections.has("basics") && <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-slug">Slug (URL id)</label>
            <input id="exp-slug" className={inputClass} value={data.slug} onChange={(e) => update("slug", e.target.value)} required placeholder="pontoon-party" aria-label="Slug (URL id)" />
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-title">Title</label>
            <input id="exp-title" className={inputClass} value={data.title} onChange={(e) => update("title", e.target.value)} required aria-label="Title" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-subtitle">Subtitle</label>
          <input id="exp-subtitle" className={inputClass} value={data.subtitle} onChange={(e) => update("subtitle", e.target.value)} aria-label="Subtitle" />
        </div>
        <div>
          <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-desc">Description (long)</label>
          <textarea id="exp-desc" className={textareaClass} rows={4} value={data.descriptionLong} onChange={(e) => update("descriptionLong", e.target.value)} aria-label="Description" />
        </div>
        <div>
          <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-hero-type">Hero type</label>
          <select id="exp-hero-type" className={inputClass} value={data.heroType} onChange={(e) => update("heroType", e.target.value as "image" | "video")} aria-label="Hero type">
            <option value="image">Image</option>
            <option value="video">Video</option>
          </select>
        </div>
        {data.heroType === "image" ? (
          <div>
            <label className="block text-sm font-medium text-brand-dark mb-2">Hero image</label>
            <p className="text-sm text-brand-muted mb-2">Upload one image or paste a URL. Drag to upload, or use Browse uploads / Paste URL.</p>
            <PhotoUploader
              value={data.heroUrl ? [data.heroUrl] : []}
              onChange={(urls) => update("heroUrl", urls[0] ?? "")}
              maxPhotos={1}
              listPrefix="experiences/heroes/"
              mainLabel="Hero"
            />
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-hero-url">Hero video URL</label>
            <input id="exp-hero-url" className={inputClass} value={data.heroUrl} onChange={(e) => update("heroUrl", e.target.value)} placeholder="https://..." aria-label="Hero video URL" />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-brand-dark mb-2">Gallery</label>
          <p className="text-sm text-brand-muted mb-2">Upload or paste URLs. Drag photos to reorder. First image can be used as the listing cover.</p>
          <PhotoUploader
            value={data.gallery}
            onChange={(urls) => update("gallery", urls)}
            maxPhotos={24}
            listPrefix="experiences/gallery/"
            reorderable
          />
        </div>
        </div>}
      </section>

      <section className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 lg:p-8 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-brand-dark">Display &amp; SEO</h2>
          <button type="button" onClick={() => toggleSection("seo")} className="lg:hidden flex items-center gap-1 text-sm text-brand-muted hover:text-brand-dark" aria-expanded={!collapsedSections.has("seo")}>
            {collapsedSections.has("seo") ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
        {!collapsedSections.has("seo") && <div className="space-y-4">
        <p className="text-sm text-brand-muted">Optional: hero overlay, meta, CTA text, testimonials, and listing page behavior.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-hero-overlay">Hero overlay line</label>
            <input id="exp-hero-overlay" className={inputClass} value={data.heroOverlayText} onChange={(e) => update("heroOverlayText", e.target.value)} placeholder="e.g. From $450 · 3–8 hr charters" aria-label="Hero overlay" />
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-promo-video">Promo video URL</label>
            <input id="exp-promo-video" className={inputClass} value={data.promoVideoUrl} onChange={(e) => update("promoVideoUrl", e.target.value)} placeholder="https://..." aria-label="Promo video URL" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-meta-title">Meta title</label>
            <input id="exp-meta-title" className={inputClass} value={data.metaTitle} onChange={(e) => update("metaTitle", e.target.value)} placeholder="Defaults to experience title" aria-label="Meta title" />
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-cta-text">CTA button text</label>
            <input id="exp-cta-text" className={inputClass} value={data.ctaButtonText} onChange={(e) => update("ctaButtonText", e.target.value)} placeholder="e.g. Book now / Reserve your charter" aria-label="CTA button text" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-meta-desc">Meta description</label>
          <input id="exp-meta-desc" className={inputClass} value={data.metaDescription} onChange={(e) => update("metaDescription", e.target.value)} placeholder="SEO description" aria-label="Meta description" />
        </div>
        <div>
          <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-cancel-summary">Cancellation summary (short)</label>
          <input id="exp-cancel-summary" className={inputClass} value={data.cancellationSummary} onChange={(e) => update("cancellationSummary", e.target.value)} placeholder="e.g. Free cancel 7+ days before" aria-label="Cancellation summary" />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <input type="checkbox" id="exp-featured" checked={data.featured} onChange={(e) => update("featured", e.target.checked)} aria-label="Featured" />
            <label htmlFor="exp-featured" className="text-sm font-medium text-brand-dark">Featured listing</label>
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-spots-left">Spots left (override)</label>
            <input id="exp-spots-left" type="number" min={0} className={`${inputClass} w-24`} value={data.spotsLeftOverride} onChange={(e) => update("spotsLeftOverride", e.target.value)} placeholder="—" aria-label="Spots left override" />
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-booking-pos">Booking position</label>
            <select id="exp-booking-pos" className={inputClass} value={data.bookingPosition} onChange={(e) => update("bookingPosition", e.target.value as "sidebar" | "inline" | "modal")} aria-label="Booking position">
              <option value="sidebar">Sidebar (desktop) / sheet (mobile)</option>
              <option value="inline">Inline below hero</option>
              <option value="modal">Modal only</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-default-rate">Default rate ID</label>
            <input id="exp-default-rate" className={inputClass} value={data.defaultRateId} onChange={(e) => update("defaultRateId", e.target.value)} placeholder="Rate doc ID to highlight first" aria-label="Default rate ID" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-brand-dark mb-2">Testimonials</label>
          {data.testimonials.map((t, i) => (
            <div key={i} className="flex flex-wrap gap-2 items-start mb-2 p-3 rounded-lg bg-brand-bg/50">
              <input className={`${inputClass} flex-1 min-w-[120px]`} placeholder="Name" value={t.name} onChange={(e) => setTestimonial(i, "name", e.target.value)} aria-label={`Testimonial ${i + 1} name`} />
              <input className={`${inputClass} flex-1 min-w-[120px]`} placeholder="Date (optional)" value={t.date} onChange={(e) => setTestimonial(i, "date", e.target.value)} aria-label={`Testimonial ${i + 1} date`} />
              <textarea className={`${textareaClass} w-full`} rows={2} placeholder="Quote" value={t.quote} onChange={(e) => setTestimonial(i, "quote", e.target.value)} aria-label={`Testimonial ${i + 1} quote`} />
              <Button type="button" variant="ghost" size="icon" onClick={() => removeTestimonial(i)} aria-label={`Remove testimonial ${i + 1}`}>−</Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addTestimonial}>Add testimonial</Button>
        </div>
        {data.gallery.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-brand-dark mb-2">Gallery alt text (one per image, for SEO)</label>
            {data.gallery.map((_, i) => (
              <div key={i} className="flex gap-2 mt-1">
                <span className="text-xs text-brand-muted w-8 shrink-0 pt-2.5">#{i + 1}</span>
                <input className={inputClass} value={data.galleryAltTexts?.[i] ?? ""} onChange={(e) => setGalleryAlt(i, e.target.value)} placeholder={`Alt for image ${i + 1}`} aria-label={`Gallery image ${i + 1} alt`} />
              </div>
            ))}
          </div>
        )}
        </div>}
      </section>

      <section className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 lg:p-8 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-brand-dark">Location</h2>
          <button type="button" onClick={() => toggleSection("location")} className="lg:hidden flex items-center gap-1 text-sm text-brand-muted hover:text-brand-dark" aria-expanded={!collapsedSections.has("location")}>
            {collapsedSections.has("location") ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
        {!collapsedSections.has("location") && <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-loc-title">Location title</label>
          <input id="exp-loc-title" className={inputClass} value={data.locationTitle} onChange={(e) => update("locationTitle", e.target.value)} aria-label="Location title" />
        </div>
        <div>
          <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-loc-address">Address text</label>
          <input id="exp-loc-address" className={inputClass} value={data.locationAddress} onChange={(e) => update("locationAddress", e.target.value)} aria-label="Address text" />
        </div>
        <div>
          <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-loc-notes">Notes</label>
          <input id="exp-loc-notes" className={inputClass} value={data.locationNotes} onChange={(e) => update("locationNotes", e.target.value)} aria-label="Location notes" />
        </div>
        </div>}
      </section>

      <section className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 lg:p-8 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-brand-dark">Capacity &amp; rules</h2>
          <button type="button" onClick={() => toggleSection("capacity")} className="lg:hidden flex items-center gap-1 text-sm text-brand-muted hover:text-brand-dark" aria-expanded={!collapsedSections.has("capacity")}>
            {collapsedSections.has("capacity") ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
        {!collapsedSections.has("capacity") && <div className="space-y-4">
        <p className="text-sm text-brand-muted mb-3">To offer pets, add an add-on (e.g. &quot;Pet&quot; or &quot;Pets&quot;) in the Add-ons section below.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-max-guests">Max guests</label>
            <input id="exp-max-guests" type="number" min={0} className={inputClass} value={data.maxGuests || ""} onChange={(e) => update("maxGuests", parseInt(e.target.value, 10) || 0)} aria-label="Max guests" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-brand-dark">Included (one per line)</label>
          {data.included.map((v, i) => (
            <div key={i} className="flex gap-2 mt-1">
              <input className={inputClass} value={v} onChange={(e) => setListItem("included", i, e.target.value)} aria-label={`Included item ${i + 1}`} />
              <Button type="button" variant="ghost" size="icon" onClick={() => removeFromList("included", i)} aria-label={`Remove included ${i + 1}`}>−</Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => addToList("included")}>Add</Button>
        </div>
        <div>
          <label className="block text-sm font-medium text-brand-dark">What to bring</label>
          {data.whatToBring.map((v, i) => (
            <div key={i} className="flex gap-2 mt-1">
              <input className={inputClass} value={v} onChange={(e) => setListItem("whatToBring", i, e.target.value)} aria-label={`What to bring ${i + 1}`} />
              <Button type="button" variant="ghost" size="icon" onClick={() => removeFromList("whatToBring", i)} aria-label={`Remove what to bring ${i + 1}`}>−</Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => addToList("whatToBring")}>Add</Button>
        </div>
        <div>
          <label className="block text-sm font-medium text-brand-dark">Rules</label>
          {data.rules.map((v, i) => (
            <div key={i} className="flex gap-2 mt-1">
              <input className={inputClass} value={v} onChange={(e) => setListItem("rules", i, e.target.value)} aria-label={`Rule ${i + 1}`} />
              <Button type="button" variant="ghost" size="icon" onClick={() => removeFromList("rules", i)} aria-label={`Remove rule ${i + 1}`}>−</Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => addToList("rules")}>Add</Button>
        </div>
        </div>}
      </section>

      <section className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 lg:p-8 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-brand-dark">Cancellation policy</h2>
          <button type="button" onClick={() => toggleSection("cancellation")} className="lg:hidden flex items-center gap-1 text-sm text-brand-muted hover:text-brand-dark" aria-expanded={!collapsedSections.has("cancellation")}>
            {collapsedSections.has("cancellation") ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
        {!collapsedSections.has("cancellation") && <div className="space-y-4">
        <p className="text-sm text-brand-muted">Only three refund options: free cancellation, partial refund, and no refund. Set the day cutoffs below.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-cp-free">Free cancellation — up to (days before)</label>
            <input id="exp-cp-free" type="number" min={0} className={inputClass} value={data.cancellationPolicy.freeCancelDays} onChange={(e) => update("cancellationPolicy", { ...data.cancellationPolicy, freeCancelDays: parseInt(e.target.value, 10) || 0 })} aria-label="Free cancellation up to how many days before" />
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-cp-partial-start">Partial refund — from (days before)</label>
            <input id="exp-cp-partial-start" type="number" min={0} className={inputClass} value={data.cancellationPolicy.partialRefundDaysStart} onChange={(e) => update("cancellationPolicy", { ...data.cancellationPolicy, partialRefundDaysStart: parseInt(e.target.value, 10) || 0 })} aria-label="Partial refund from days before" />
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-cp-partial-end">Partial refund — to (days before)</label>
            <input id="exp-cp-partial-end" type="number" min={0} className={inputClass} value={data.cancellationPolicy.partialRefundDaysEnd} onChange={(e) => update("cancellationPolicy", { ...data.cancellationPolicy, partialRefundDaysEnd: parseInt(e.target.value, 10) || 0 })} aria-label="Partial refund to days before" />
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-cp-no-refund">No refund — within (days)</label>
            <input id="exp-cp-no-refund" type="number" min={0} className={inputClass} value={data.cancellationPolicy.noRefundWithinDays} onChange={(e) => update("cancellationPolicy", { ...data.cancellationPolicy, noRefundWithinDays: parseInt(e.target.value, 10) || 0 })} aria-label="No refund within how many days" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-cp-full">Full text (shown to guests)</label>
          <textarea id="exp-cp-full" className={textareaClass} rows={2} value={data.cancellationPolicy.fullText} onChange={(e) => update("cancellationPolicy", { ...data.cancellationPolicy, fullText: e.target.value })} placeholder="e.g. Free cancellation up to 30 days before. Partial refund 15–30 days before. No refund within 14 days." aria-label="Cancellation policy full text" />
        </div>
        </div>}
      </section>

      <section className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 lg:p-8 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-brand-dark">FAQs</h2>
          <button type="button" onClick={() => toggleSection("faqs")} className="lg:hidden flex items-center gap-1 text-sm text-brand-muted hover:text-brand-dark" aria-expanded={!collapsedSections.has("faqs")}>
            {collapsedSections.has("faqs") ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
        {!collapsedSections.has("faqs") && <div className="space-y-4">
        {data.faqs.map((f, i) => (
          <div key={i} className="flex gap-2 items-start">
            <div className="flex-1 space-y-1">
              <input className={inputClass} placeholder="Question" value={f.q} onChange={(e) => setFaq(i, "q", e.target.value)} aria-label={`FAQ ${i + 1} question`} />
              <input className={inputClass} placeholder="Answer" value={f.a} onChange={(e) => setFaq(i, "a", e.target.value)} aria-label={`FAQ ${i + 1} answer`} />
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => removeFaq(i)} aria-label={`Remove FAQ ${i + 1}`}>−</Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addFaq}>Add FAQ</Button>
        </div>}
      </section>

      <section className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 lg:p-8 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-brand-dark">Availability &amp; status</h2>
            <p className="text-sm text-brand-muted mt-0.5">Control when this experience can be booked and whether it appears on the site.</p>
          </div>
          <button type="button" onClick={() => toggleSection("seasonal")} className="lg:hidden flex items-center gap-1 text-sm text-brand-muted hover:text-brand-dark" aria-expanded={!collapsedSections.has("seasonal")}>
            {collapsedSections.has("seasonal") ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
        {!collapsedSections.has("seasonal") && <div className="space-y-6">
        {/* Booking window: year-round vs specific date range */}
        <div className="rounded-xl border border-brand-dark/10 bg-brand-bg/30 p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-sm font-medium text-brand-dark">Booking window</span>
              <p className="text-xs text-brand-muted mt-0.5">Year-round = book any date. Otherwise choose a start and end date.</p>
            </div>
            <label className="flex items-center gap-2 shrink-0 cursor-pointer">
              <input type="checkbox" id="seasonal" checked={!data.seasonalEnabled} onChange={(e) => update("seasonalEnabled", !e.target.checked)} className="rounded border-brand-dark/30" />
              <span className="text-sm font-medium text-brand-dark">Year-round</span>
            </label>
          </div>

          {data.seasonalEnabled && (
            <div className="pt-2 space-y-3">
              <p className="text-sm font-medium text-brand-dark">Only allow booking between these dates</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-brand-muted mb-1" htmlFor="exp-season-start-date">From date</label>
                  <input
                    id="exp-season-start-date"
                    type="date"
                    className={inputClass}
                    value={data.seasonalStartDate}
                    onChange={(e) => update("seasonalStartDate", e.target.value)}
                    aria-label="First date of booking season"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-brand-muted mb-1" htmlFor="exp-season-end-date">To date</label>
                  <input
                    id="exp-season-end-date"
                    type="date"
                    className={inputClass}
                    value={data.seasonalEndDate}
                    onChange={(e) => update("seasonalEndDate", e.target.value)}
                    aria-label="Last date of booking season"
                  />
                </div>
              </div>
              <p className="text-xs text-brand-muted">Dates outside this range won’t show on the calendar.</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" id="active" checked={data.active} onChange={(e) => update("active", e.target.checked)} className="rounded border-brand-dark/30" aria-label="Listed on site" />
          <label htmlFor="active" className="text-sm font-medium text-brand-dark">Listed on site — experience is visible and bookable</label>
        </div>
        <div>
          <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-timezone">Timezone</label>
          <input id="exp-timezone" className={inputClass} value={data.timezone} onChange={(e) => update("timezone", e.target.value)} placeholder="America/Chicago" aria-label="Timezone for times and dates" />
          <p className="text-xs text-brand-muted mt-1">Used for departure times and calendar dates (e.g. America/Chicago).</p>
        </div>
        </div>}
      </section>

      <section className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 lg:p-8 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-brand-dark">Booking type</h2>
            <p className="text-sm text-brand-muted mt-1">Choose how customers book and pay for this experience.</p>
          </div>
          <button type="button" onClick={() => toggleSection("bookingType")} className="lg:hidden flex items-center gap-1 text-sm text-brand-muted hover:text-brand-dark" aria-expanded={!collapsedSections.has("bookingType")}>
            {collapsedSections.has("bookingType") ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
        {!collapsedSections.has("bookingType") && <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => update("pricingType", "charter")}
            className={cn(
              "rounded-xl border-2 p-4 text-left transition-all",
              data.pricingType === "charter"
                ? "border-brand-primary bg-brand-primary/5 ring-2 ring-brand-primary/20"
                : "border-brand-dark/15 bg-white hover:border-brand-primary/40"
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <Anchor className="h-5 w-5 text-brand-primary shrink-0" aria-hidden />
              <span className="font-semibold text-brand-dark">Charter</span>
              {data.pricingType === "charter" && (
                <span className="ml-auto text-[10px] font-bold bg-brand-primary text-white rounded px-1.5 py-0.5 uppercase tracking-wide">Selected</span>
              )}
            </div>
            <p className="text-sm text-brand-muted">Flat rate per booking — the whole boat is reserved exclusively for one group.</p>
          </button>
          <button
            type="button"
            onClick={() => update("pricingType", "ticketed")}
            className={cn(
              "rounded-xl border-2 p-4 text-left transition-all",
              data.pricingType === "ticketed"
                ? "border-brand-primary bg-brand-primary/5 ring-2 ring-brand-primary/20"
                : "border-brand-dark/15 bg-white hover:border-brand-primary/40"
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-5 w-5 text-brand-primary shrink-0" aria-hidden />
              <span className="font-semibold text-brand-dark">Ticketed</span>
              {data.pricingType === "ticketed" && (
                <span className="ml-auto text-[10px] font-bold bg-brand-primary text-white rounded px-1.5 py-0.5 uppercase tracking-wide">Selected</span>
              )}
            </div>
            <p className="text-sm text-brand-muted">Per-person pricing with a fixed daily departure time and capacity limit.</p>
          </button>
        </div>

        {data.pricingType === "charter" && (
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-brand-dark/20 text-brand-primary focus:ring-brand-primary"
              checked={data.allowDeposit ?? false}
              onChange={(e) => update("allowDeposit", e.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium text-brand-dark">Allow 50/50 deposit</span>
              <span className="block text-xs text-brand-muted mt-0.5">Customers can pay 50% now, remainder charged 48h before trip</span>
            </span>
          </label>
        )}

        <div className="space-y-3 pt-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted">Tip options</p>
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-brand-dark/20 text-brand-primary focus:ring-brand-primary"
              checked={data.allowTipNow !== false}
              onChange={(e) => update("allowTipNow", e.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium text-brand-dark">Allow &quot;Tip now&quot;</span>
              <span className="block text-xs text-brand-muted mt-0.5">Customers can add a tip (20–35%) at checkout</span>
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-brand-dark/20 text-brand-primary focus:ring-brand-primary"
              checked={data.allowTipLater !== false}
              onChange={(e) => update("allowTipLater", e.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium text-brand-dark">Allow &quot;Tip later&quot;</span>
              <span className="block text-xs text-brand-muted mt-0.5">Customers can choose to tip the crew directly later</span>
            </span>
          </label>
        </div>

        {data.pricingType === "ticketed" && (
          <div className="rounded-xl bg-sky-50 border border-sky-200 p-4 space-y-5">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-sky-600 mt-0.5 shrink-0" aria-hidden />
              <p className="text-sm text-sky-800">
                Each option is <strong>per ticket</strong>. In Rates below: set your base price, then optional higher prices for weekends and holidays. Use “Raise prices on these dates” to add specific date ranges (e.g. July 4).
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-brand-dark mb-1" htmlFor="exp-max-capacity">
                  Max tickets per departure
                </label>
                <input
                  id="exp-max-capacity"
                  type="number"
                  min={1}
                  className={inputClass}
                  value={data.maxCapacity || ""}
                  onChange={(e) => update("maxCapacity", parseInt(e.target.value, 10) || 0)}
                  placeholder="e.g. 35"
                  aria-label="Max tickets per departure"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-dark mb-1" htmlFor="exp-trip-duration">
                  Trip duration (hours)
                </label>
                <input
                  id="exp-trip-duration"
                  type="number"
                  min={0.5}
                  step={0.5}
                  className={inputClass}
                  value={data.tripDurationHours || ""}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    update("tripDurationHours", isNaN(val) || val <= 0 ? 1 : val);
                  }}
                  placeholder="e.g. 1"
                  aria-label="Trip duration in hours"
                />
                <p className="text-xs text-sky-700 mt-1">Sets the slot end time (e.g. 1 = 1 hour)</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-dark mb-1">
                  Departure time
                </label>
                <div className="flex items-center gap-2">
                  <select
                    className={cn(inputClass, "flex-1 mt-0")}
                    value={data.departureHour % 12 === 0 ? 12 : data.departureHour % 12}
                    onChange={(e) => {
                      const h12 = parseInt(e.target.value, 10);
                      const isPm = data.departureHour >= 12;
                      const h24 = isPm ? (h12 === 12 ? 12 : h12 + 12) : h12 === 12 ? 0 : h12;
                      update("departureHour", h24);
                    }}
                    aria-label="Departure hour"
                  >
                    {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <span className="text-brand-dark font-semibold text-sm select-none">:</span>
                  <select
                    className={cn(inputClass, "flex-1 mt-0")}
                    value={data.departureMinute}
                    onChange={(e) => update("departureMinute", parseInt(e.target.value, 10))}
                    aria-label="Departure minute"
                  >
                    {[0, 30].map((m) => (
                      <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
                    ))}
                  </select>
                  <select
                    className={cn(inputClass, "w-20 mt-0")}
                    value={data.departureHour >= 12 ? "PM" : "AM"}
                    onChange={(e) => {
                      const isPm = e.target.value === "PM";
                      const h12 = data.departureHour % 12 === 0 ? 12 : data.departureHour % 12;
                      const h24 = isPm ? (h12 === 12 ? 12 : h12 + 12) : h12 === 12 ? 0 : h12;
                      update("departureHour", h24);
                    }}
                    aria-label="AM or PM"
                  >
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>
                <p className="text-xs text-sky-700 mt-1.5">
                  {(() => {
                    const h = data.departureHour;
                    const m = data.departureMinute;
                    const h12 = h % 12 === 0 ? 12 : h % 12;
                    const ampm = h >= 12 ? "PM" : "AM";
                    return `Daily departure at ${h12}:${String(m).padStart(2, "0")} ${ampm} · ${data.timezone || "set timezone above"}`;
                  })()}
                </p>
              </div>
            </div>
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-sky-400 text-sky-600 focus:ring-sky-500"
                checked={data.showSpotsRemaining ?? false}
                onChange={(e) => update("showSpotsRemaining", e.target.checked)}
              />
              <span>
                <span className="block text-sm font-medium text-sky-800">Show spots remaining on booking calendar</span>
                <span className="block text-xs text-sky-700 mt-0.5">When enabled, customers see &lsquo;X of 12 spots left&rsquo; on the calendar</span>
              </span>
            </label>
          </div>
        )}
        </div>}
      </section>

      <section className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-brand-dark">Rates & calendar</h2>
            <p className="text-sm text-brand-muted mt-1">
              {data.pricingType === "ticketed"
                ? "Set your ticket price, then when to charge more (weekends, holidays, or specific dates)."
                : "Choose which days count as weekend, add your charter lengths and prices, then add holidays or special dates. The calendar at the bottom shows how each day is priced."}
            </p>
          </div>
          <button type="button" onClick={() => toggleSection("rates")} className="lg:hidden flex items-center gap-1 text-sm text-brand-muted hover:text-brand-dark shrink-0" aria-expanded={!collapsedSections.has("rates")}>
            {collapsedSections.has("rates") ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
        {!collapsedSections.has("rates") && <DynamicPricingEditor
          rates={data.rates}
          onRatesChange={(rates) => setData((prev) => ({ ...prev, rates }))}
          holidayDates={data.holidayDates}
          onHolidayDatesChange={(holidayDates) => setData((prev) => ({ ...prev, holidayDates }))}
          weekendDays={data.weekendDays}
          onWeekendDaysChange={(weekendDays) => setData((prev) => ({ ...prev, weekendDays }))}
          friSunDays={data.friSunDays}
          onFriSunDaysChange={(friSunDays) => setData((prev) => ({ ...prev, friSunDays }))}
          boatHint={false}
          hideCalendar={false}
          pricingMode={data.pricingType}
        />}
      </section>

      <section className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 lg:p-8 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-brand-dark">Add-ons</h2>
          <button type="button" onClick={() => toggleSection("addons")} className="lg:hidden flex items-center gap-1 text-sm text-brand-muted hover:text-brand-dark" aria-expanded={!collapsedSections.has("addons")}>
            {collapsedSections.has("addons") ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
        {!collapsedSections.has("addons") && <div className="space-y-4">
        <p className="text-sm text-brand-muted">Optional extras customers can add (e.g. damage waiver). Name, price in dollars, and type. Check &quot;Stand out&quot; to highlight one.</p>
        {data.addons.map((a, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-start p-3 rounded-lg bg-brand-bg/30 border border-brand-dark/10">
            <input className={inputClass} placeholder="Name" value={a.name} onChange={(e) => setAddon(i, "name", e.target.value)} aria-label={`Add-on ${i + 1} name`} />
            <input className={inputClass} placeholder="Description" value={a.description} onChange={(e) => setAddon(i, "description", e.target.value)} aria-label={`Add-on ${i + 1} description`} />
            <div className="flex flex-col gap-0.5">
              <label className="text-xs font-medium text-brand-muted">Price ($)</label>
              <input
                type="number"
                min={0}
                step={0.01}
                className={inputClass}
                placeholder="0.00"
                value={a.priceCents ? (a.priceCents / 100).toFixed(2) : ""}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  if (raw === "") {
                    setAddon(i, "priceCents", 0);
                    return;
                  }
                  const dollars = parseFloat(raw);
                  if (!Number.isNaN(dollars) && dollars >= 0) {
                    setAddon(i, "priceCents", Math.round(dollars * 100));
                  }
                }}
                aria-label={`Add-on ${i + 1} price in dollars`}
              />
            </div>
            <select className={inputClass} value={a.type} onChange={(e) => setAddon(i, "type", e.target.value as AddonRow["type"])} aria-label={`Add-on ${i + 1} type`}>
              <option value="toggle">Toggle</option>
              <option value="quantity">Quantity</option>
              <option value="tip">Tip (legacy – use booking tip buttons)</option>
            </select>
            <input type="number" min={0} className={inputClass} placeholder="Max qty" value={a.maxQty || ""} onChange={(e) => setAddon(i, "maxQty", parseInt(e.target.value, 10) || 0)} aria-label={`Add-on ${i + 1} max quantity`} />
            <label className="flex items-center gap-2 cursor-pointer pt-2 sm:pt-0">
              <input type="checkbox" checked={a.highlight ?? false} onChange={(e) => setAddon(i, "highlight", e.target.checked)} aria-label={`Add-on ${i + 1} stand out`} />
              <span className="text-sm font-medium text-brand-dark">Stand out (e.g. damage waiver)</span>
            </label>
            <Button type="button" variant="ghost" size="sm" onClick={() => removeAddon(i)} aria-label={`Remove add-on ${i + 1}`}>Remove</Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addAddon}>Add add-on</Button>
        </div>}
      </section>

      <div className="flex gap-3">
        <Link href={backHref}>
          <Button type="button" variant="ghost">Cancel</Button>
        </Link>
        <Button type="submit" disabled={loading}>{loading ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  );
}

export function experienceFormDataFromApi(api: Record<string, unknown>): ExperienceFormData {
  return dataFromApi(api);
}

export function getDefaultExperienceFormData(): ExperienceFormData {
  return getDefaultFormData();
}
