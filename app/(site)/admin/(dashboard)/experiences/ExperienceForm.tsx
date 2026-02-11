"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

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
    "Free cancellation up to 30 days before. Partial refund 15–30 days before. No refund within 14 days. See full terms on our site.",
};

type RateRow = { durationHours: number; displayName: string; priceCents: number };
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
    active: api.active === true,
    timezone: typeof api.timezone === "string" ? api.timezone : "America/Chicago",
    rates: rates.map((r) => ({
      durationHours: typeof r.durationHours === "number" ? r.durationHours : 0,
      displayName: typeof r.displayName === "string" ? r.displayName : "",
      priceCents: typeof r.priceCents === "number" ? r.priceCents : 0,
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
    petsMax: d.petsMax,
    included: d.included,
    whatToBring: d.whatToBring,
    rules: d.rules,
    cancellationPolicy: d.cancellationPolicy,
    faqs: d.faqs,
    seasonal: {
      enabled: d.seasonalEnabled,
      startMonth: d.seasonalStartMonth,
      endMonth: d.seasonalEndMonth,
    },
    active: d.active,
    timezone: d.timezone || undefined,
    rates: d.rates,
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

  const addRate = () => setData((prev) => ({ ...prev, rates: [...prev.rates, { durationHours: 3, displayName: "", priceCents: 0 }] }));
  const removeRate = (i: number) => setData((prev) => ({ ...prev, rates: prev.rates.filter((_, idx) => idx !== i) }));
  const setRate = (i: number, field: keyof RateRow, value: number | string) => {
    setData((prev) => ({
      ...prev,
      rates: prev.rates.map((r, idx) =>
        idx === i ? { ...r, [field]: (field === "displayName" ? value : (typeof value === "number" ? value : r[field])) } : r
      ),
    }));
  };
  const setRateNum = (i: number, field: "durationHours" | "priceCents", value: number) => {
    setData((prev) => ({
      ...prev,
      rates: prev.rates.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)),
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
        <h2 className="text-lg font-semibold text-brand-dark">Basics</h2>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-hero-type">Hero type</label>
            <select id="exp-hero-type" className={inputClass} value={data.heroType} onChange={(e) => update("heroType", e.target.value as "image" | "video")} aria-label="Hero type">
              <option value="image">Image</option>
              <option value="video">Video</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-hero-url">Hero URL</label>
            <input id="exp-hero-url" className={inputClass} value={data.heroUrl} onChange={(e) => update("heroUrl", e.target.value)} placeholder="/photos/hero.webp" aria-label="Hero URL" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-brand-dark">Gallery URLs (one per line or comma)</label>
          <div className="space-y-2">
            {data.gallery.map((url, i) => (
              <div key={i} className="flex gap-2">
                <input className={inputClass} value={url} onChange={(e) => setListItem("gallery", i, e.target.value)} placeholder="/photos/1.webp" aria-label={`Gallery URL ${i + 1}`} />
                <Button type="button" variant="ghost" size="icon" onClick={() => removeFromList("gallery", i)} aria-label={`Remove gallery URL ${i + 1}`}>−</Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => addToList("gallery")}>Add gallery URL</Button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 lg:p-8 space-y-4">
        <h2 className="text-lg font-semibold text-brand-dark">Display &amp; SEO</h2>
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
      </section>

      <section className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 lg:p-8 space-y-4">
        <h2 className="text-lg font-semibold text-brand-dark">Location</h2>
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
      </section>

      <section className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 lg:p-8 space-y-4">
        <h2 className="text-lg font-semibold text-brand-dark">Capacity &amp; rules</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-max-guests">Max guests</label>
            <input id="exp-max-guests" type="number" min={0} className={inputClass} value={data.maxGuests || ""} onChange={(e) => update("maxGuests", parseInt(e.target.value, 10) || 0)} aria-label="Max guests" />
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-pets-max">Max pets</label>
            <input id="exp-pets-max" type="number" min={0} className={inputClass} value={data.petsMax || ""} onChange={(e) => update("petsMax", parseInt(e.target.value, 10) || 0)} aria-label="Max pets" />
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
      </section>

      <section className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 lg:p-8 space-y-4">
        <h2 className="text-lg font-semibold text-brand-dark">Cancellation policy</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-cp-free">Free cancel days</label>
            <input id="exp-cp-free" type="number" min={0} className={inputClass} value={data.cancellationPolicy.freeCancelDays} onChange={(e) => update("cancellationPolicy", { ...data.cancellationPolicy, freeCancelDays: parseInt(e.target.value, 10) || 0 })} aria-label="Free cancel days" />
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-cp-partial-start">Partial start</label>
            <input id="exp-cp-partial-start" type="number" min={0} className={inputClass} value={data.cancellationPolicy.partialRefundDaysStart} onChange={(e) => update("cancellationPolicy", { ...data.cancellationPolicy, partialRefundDaysStart: parseInt(e.target.value, 10) || 0 })} aria-label="Partial refund start days" />
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-cp-partial-end">Partial end</label>
            <input id="exp-cp-partial-end" type="number" min={0} className={inputClass} value={data.cancellationPolicy.partialRefundDaysEnd} onChange={(e) => update("cancellationPolicy", { ...data.cancellationPolicy, partialRefundDaysEnd: parseInt(e.target.value, 10) || 0 })} aria-label="Partial refund end days" />
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-cp-no-refund">No refund within</label>
            <input id="exp-cp-no-refund" type="number" min={0} className={inputClass} value={data.cancellationPolicy.noRefundWithinDays} onChange={(e) => update("cancellationPolicy", { ...data.cancellationPolicy, noRefundWithinDays: parseInt(e.target.value, 10) || 0 })} aria-label="No refund within days" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-cp-full">Full text</label>
          <textarea id="exp-cp-full" className={textareaClass} rows={2} value={data.cancellationPolicy.fullText} onChange={(e) => update("cancellationPolicy", { ...data.cancellationPolicy, fullText: e.target.value })} aria-label="Cancellation policy full text" />
        </div>
      </section>

      <section className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 lg:p-8 space-y-4">
        <h2 className="text-lg font-semibold text-brand-dark">FAQs</h2>
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
      </section>

      <section className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 lg:p-8 space-y-4">
        <h2 className="text-lg font-semibold text-brand-dark">Seasonal &amp; status</h2>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="seasonal" checked={data.seasonalEnabled} onChange={(e) => update("seasonalEnabled", e.target.checked)} />
          <label htmlFor="seasonal" className="text-sm font-medium text-brand-dark">Seasonal (limit to months)</label>
        </div>
        {data.seasonalEnabled && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-season-start">Start month (1–12)</label>
              <input id="exp-season-start" type="number" min={1} max={12} className={inputClass} value={data.seasonalStartMonth} onChange={(e) => update("seasonalStartMonth", parseInt(e.target.value, 10) || 1)} aria-label="Seasonal start month" />
            </div>
            <div>
              <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-season-end">End month (1–12)</label>
              <input id="exp-season-end" type="number" min={1} max={12} className={inputClass} value={data.seasonalEndMonth} onChange={(e) => update("seasonalEndMonth", parseInt(e.target.value, 10) || 12)} aria-label="Seasonal end month" />
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input type="checkbox" id="active" checked={data.active} onChange={(e) => update("active", e.target.checked)} aria-label="Active (visible on site)" />
          <label htmlFor="active" className="text-sm font-medium text-brand-dark">Active (visible on site)</label>
        </div>
        <div>
          <label className="block text-sm font-medium text-brand-dark" htmlFor="exp-timezone">Timezone</label>
          <input id="exp-timezone" className={inputClass} value={data.timezone} onChange={(e) => update("timezone", e.target.value)} placeholder="America/Chicago" aria-label="Timezone" />
        </div>
      </section>

      <section className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 lg:p-8 space-y-4">
        <h2 className="text-lg font-semibold text-brand-dark">Rates</h2>
        {data.rates.map((r, i) => (
          <div key={i} className="flex flex-wrap gap-2 items-center">
            <input type="number" min={0} step={0.5} className={`${inputClass} w-24`} placeholder="Hours" value={r.durationHours || ""} onChange={(e) => setRateNum(i, "durationHours", parseFloat(e.target.value) || 0)} aria-label={`Rate ${i + 1} duration hours`} />
            <input className={`${inputClass} flex-1 min-w-[120px]`} placeholder="Display name" value={r.displayName} onChange={(e) => setRate(i, "displayName", e.target.value)} aria-label={`Rate ${i + 1} display name`} />
            <input type="number" min={0} className={`${inputClass} w-28`} placeholder="Price cents" value={r.priceCents || ""} onChange={(e) => setRateNum(i, "priceCents", parseInt(e.target.value, 10) || 0)} aria-label={`Rate ${i + 1} price cents`} />
            <Button type="button" variant="ghost" size="icon" onClick={() => removeRate(i)} aria-label={`Remove rate ${i + 1}`}>−</Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addRate}>Add rate</Button>
      </section>

      <section className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 lg:p-8 space-y-4">
        <h2 className="text-lg font-semibold text-brand-dark">Add-ons</h2>
        <p className="text-sm text-brand-muted">Add or remove add-ons. Set a price (cents) and type. &quot;Stand out&quot; makes the add-on more prominent (e.g. damage waiver).</p>
        {data.addons.map((a, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-start p-3 rounded-lg bg-brand-bg/30 border border-brand-dark/10">
            <input className={inputClass} placeholder="Name" value={a.name} onChange={(e) => setAddon(i, "name", e.target.value)} aria-label={`Add-on ${i + 1} name`} />
            <input className={inputClass} placeholder="Description" value={a.description} onChange={(e) => setAddon(i, "description", e.target.value)} aria-label={`Add-on ${i + 1} description`} />
            <input type="number" min={0} className={inputClass} placeholder="Price cents" value={a.priceCents || ""} onChange={(e) => setAddon(i, "priceCents", parseInt(e.target.value, 10) || 0)} aria-label={`Add-on ${i + 1} price cents`} />
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
