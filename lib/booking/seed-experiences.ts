import { brand } from "@/content/brand";
import { siteConfig } from "@/config/site";
/**
 * Seed / reconcile Firestore experiences, rates, and addons.
 * Slot documents are not created — the slots API returns synthetic "open" slots until hold/booking.
 *
 * Preserves experience document IDs (lookup by slug).
 * Rates: reconcile by durationHours — deactivate unused; never delete (historical bookings may reference rateIds).
 * Addons: upsert by catalogKey (or name fallback).
 */

import type { Experience, ExperienceAddon, ExperienceRate } from "@/lib/booking/types";
import { getDb } from "@/lib/booking/firebase-admin";
import {
  CHARTER_INCLUDED,
  FOUNDING_ANGLER_RATE_ACTIVE,
  FOUNDING_ANGLER_LABEL,
  getActiveCatalogRateCents,
  PEAK_FULL_DAY_CENTS,
  STANDARD_RATE_CENTS,
} from "@/content/catalog-pricing";
import { NSF_EXTENSION_HOUR_CENTS } from "@/content/charter-windows";
import { CHARTER_UPSELLS } from "@/content/upsells";

import { DEFAULT_EXPERIENCE_CANCELLATION_POLICY } from "@/lib/booking/cancellation-policy";
import { reconcileAddons, reconcileRates, type AddonSeed, type RateSeed } from "@/lib/booking/seed-reconcile";

const CANCELLATION_POLICY = DEFAULT_EXPERIENCE_CANCELLATION_POLICY;
const WHAT_TO_BRING = ["Sunscreen", "Sunglasses", "Hat", "Soft-soled shoes", "Valid ID"];
const RULES = ["Follow captain instructions", "No glass on deck"];

/** Current bookable / catalog upsells from content/upsells.ts */
const ACTIVE_UPSELL_ADDONS: AddonSeed[] = CHARTER_UPSELLS.map((u) => ({
  catalogKey: u.catalogKey,
  name: u.name,
  description: u.howItWorks,
  priceCents: u.seedPriceCents,
  type: u.seedType,
  ...(u.maxQty != null ? { maxQty: u.maxQty } : {}),
  active: true,
  ...(u.bookable ? {} : { hiddenFromBookingUI: true as const }),
  ...(u.partnerFulfilled ? { partnerFulfilled: true as const } : {}),
  ...(u.highlight ? { highlight: true as const } : {}),
}));

/** Legacy keys kept in Firestore (reconcile updates) but deactivated. Template has none. */
const LEGACY_ADDONS: AddonSeed[] = [];

const CATALOG_ADDONS: AddonSeed[] = [...ACTIVE_UPSELL_ADDONS, ...LEGACY_ADDONS];

function halfDayRates(): RateSeed[] {
  const priceCents = getActiveCatalogRateCents("half");
  return [
    {
      durationHours: 5,
      displayName: `${siteConfig.catalog.halfDay.title} (${siteConfig.catalog.halfDay.durationLabel})`,
      priceCents,
      active: true,
    },
    // Historical / unused — keep docs, hide from new bookings
    { durationHours: 4, displayName: "Half-Day (4 Hours)", priceCents: STANDARD_RATE_CENTS.half, active: false },
    { durationHours: 8, displayName: "Full-Day (8 Hours)", priceCents: STANDARD_RATE_CENTS.full, active: false },
    { durationHours: 10, displayName: "Full-Day (10 Hours)", priceCents: STANDARD_RATE_CENTS.full, active: false },
  ];
}

function fullDayRates(): RateSeed[] {
  const base = getActiveCatalogRateCents("full");
  return [
    {
      durationHours: 8,
      displayName: `${siteConfig.catalog.fullDay.title} (${siteConfig.catalog.fullDay.durationLabel})`,
      priceCents: base,
      priceHolidayCents: PEAK_FULL_DAY_CENTS,
      active: true,
    },
    {
      durationHours: 9,
      displayName: "Full Day +1 Hour (until ~3:00 PM)",
      priceCents: base + NSF_EXTENSION_HOUR_CENTS,
      priceHolidayCents: PEAK_FULL_DAY_CENTS + NSF_EXTENSION_HOUR_CENTS,
      active: true,
    },
    {
      durationHours: 10,
      displayName: "Full Day +2 Hours (until ~4:00 PM)",
      priceCents: base + 2 * NSF_EXTENSION_HOUR_CENTS,
      priceHolidayCents: PEAK_FULL_DAY_CENTS + 2 * NSF_EXTENSION_HOUR_CENTS,
      active: true,
    },
    {
      durationHours: 11,
      displayName: "Full Day +3 Hours (until ~5:00 PM)",
      priceCents: base + 3 * NSF_EXTENSION_HOUR_CENTS,
      priceHolidayCents: PEAK_FULL_DAY_CENTS + 3 * NSF_EXTENSION_HOUR_CENTS,
      active: true,
    },
    { durationHours: 4, displayName: "Half-Day (4 Hours)", priceCents: STANDARD_RATE_CENTS.half, active: false },
    { durationHours: 5, displayName: "Half-Day (5 Hours)", priceCents: STANDARD_RATE_CENTS.half, active: false },
  ];
}

const EXPERIENCES: (Omit<Experience, "id"> & { _rates: RateSeed[] })[] = [
  {
    slug: "pontoon",
    title: siteConfig.catalog.halfDay.title,
    subtitle: `${siteConfig.catalog.halfDay.durationLabel} · Private Captained Charter`,
    descriptionLong:
      "Private half-day captained charter. Captain and mate included. Confirm inclusions when you book.",
    heroMedia: { type: "image", url: siteConfig.media.welcome },
    gallery: [
      siteConfig.media.welcome,
      "/photos/stock/charter/anglers-on-boat-pexels.jpg",
      siteConfig.media.galleryFallback,
      siteConfig.media.hero,
    ],
    location: {
      title: "Marina / dock",
      addressText: siteConfig.contact.marinaMeetNote,
      notes: "Meet at the dock — soft-soled shoes recommended.",
    },
    maxGuests: 6,
    petsMax: 0,
    included: CHARTER_INCLUDED,
    whatToBring: WHAT_TO_BRING,
    rules: RULES,
    cancellationPolicy: CANCELLATION_POLICY,
    faqs: [
      { q: "Is a captain included?", a: "Yes. Every charter includes a licensed captain and mate." },
      { q: "What should we bring?", a: "Sunscreen, sunglasses, hat, soft-soled shoes. Specific inclusions are listed when you book." },
    ],
    seasonal: { enabled: false },
    active: true,
    timezone: brand.timezone,
    pricingType: "charter",
    allowDeposit: true,
    featured: false,
    fromPriceCents: getActiveCatalogRateCents("half"),
    sortOrder: 1,
    metaTitle: `${siteConfig.catalog.halfDay.title} | ${siteConfig.catalog.halfDay.durationLabel}`,
    metaDescription: `Book ${siteConfig.catalog.halfDay.title} — private captained charter. ${brand.companyName}.`,
    tagline: FOUNDING_ANGLER_RATE_ACTIVE ? FOUNDING_ANGLER_LABEL : "Private Captained Charter",
    _rates: halfDayRates(),
  },
  {
    slug: "watersports",
    title: siteConfig.catalog.fullDay.title,
    subtitle: `${siteConfig.catalog.fullDay.durationLabel} · Private Captained Charter`,
    descriptionLong:
      "Private full-day captained charter. More time on the water. Captain and mate included. Confirm inclusions when you book.",
    heroMedia: { type: "image", url: siteConfig.media.boats },
    gallery: [
      siteConfig.media.boats,
      siteConfig.media.hero,
      "/photos/stock/charter/anglers-on-boat-pexels.jpg",
      siteConfig.media.galleryFallback,
    ],
    location: {
      title: "Marina / dock",
      addressText: siteConfig.contact.marinaMeetNote,
    },
    maxGuests: 6,
    petsMax: 0,
    included: CHARTER_INCLUDED,
    whatToBring: WHAT_TO_BRING,
    rules: RULES,
    cancellationPolicy: CANCELLATION_POLICY,
    faqs: [
      { q: "How long is the trip?", a: "Full-day trips run the duration listed on the package. We'll confirm dock details after you book." },
    ],
    seasonal: { enabled: false },
    active: true,
    timezone: brand.timezone,
    pricingType: "charter",
    allowDeposit: true,
    featured: true,
    fromPriceCents: getActiveCatalogRateCents("full"),
    sortOrder: 0,
    metaTitle: `${siteConfig.catalog.fullDay.title} | ${siteConfig.catalog.fullDay.durationLabel}`,
    metaDescription: `Book ${siteConfig.catalog.fullDay.title} — private captained charter. ${brand.companyName}.`,
    tagline: FOUNDING_ANGLER_RATE_ACTIVE ? FOUNDING_ANGLER_LABEL : "MOST POPULAR",
    stats: ["MOST POPULAR"],
    // Peak windows: set date ranges in admin (holidayDates) or pricing calendar.
    holidayDates: [],
    _rates: fullDayRates(),
  },
  {
    slug: "sunset",
    title: "Sunset",
    subtitle: "Evening charter — specialty listing (inactive by default).",
    descriptionLong:
      "Shorter evening trip timed around sunset. Inactive in the template — activate in admin if this customer offers it.",
    heroMedia: { type: "image", url: siteConfig.media.hero },
    gallery: [siteConfig.media.hero, siteConfig.media.galleryFallback],
    location: {
      title: "Marina / dock",
      addressText: siteConfig.contact.marinaMeetNote,
    },
    maxGuests: 6,
    petsMax: 0,
    included: CHARTER_INCLUDED,
    whatToBring: ["Light layer", "Camera", "Valid ID"],
    rules: RULES,
    cancellationPolicy: CANCELLATION_POLICY,
    faqs: [],
    seasonal: { enabled: false },
    active: false,
    timezone: brand.timezone,
    pricingType: "charter",
    sortOrder: 90,
    _rates: [
      { durationHours: 4, displayName: "Sunset (4 Hours)", priceCents: getActiveCatalogRateCents("half"), active: true },
    ],
  },
  {
    slug: "holiday",
    title: "Holiday Special",
    subtitle: "Seasonal specialty listing (inactive by default).",
    descriptionLong:
      "Seasonal specialty charter. Inactive in the template — activate in admin if this customer offers it.",
    heroMedia: { type: "image", url: siteConfig.media.boats },
    gallery: [siteConfig.media.boats, siteConfig.media.galleryFallback],
    location: {
      title: "Marina / dock",
      addressText: siteConfig.contact.marinaMeetNote,
    },
    maxGuests: 6,
    petsMax: 0,
    included: CHARTER_INCLUDED,
    whatToBring: WHAT_TO_BRING,
    rules: RULES,
    cancellationPolicy: CANCELLATION_POLICY,
    faqs: [],
    seasonal: { enabled: false },
    active: false,
    timezone: brand.timezone,
    pricingType: "charter",
    sortOrder: 91,
    _rates: [
      {
        durationHours: 8,
        displayName: "Holiday Day (8 Hours)",
        priceCents: getActiveCatalogRateCents("full"),
        priceHolidayCents: PEAK_FULL_DAY_CENTS,
        active: true,
      },
    ],
  },
];

export async function runSeedExperiences(): Promise<
  { ok: true; experienceIds: string[] } | { ok: false; error: string }
> {
  try {
    const db = getDb();
    const experienceIds: string[] = [];

    for (const expConfig of EXPERIENCES) {
      const { _rates, ...expFields } = expConfig;
      const expSnap = await db.collection("experiences").where("slug", "==", expFields.slug).limit(1).get();
      let expId: string;
      if (!expSnap.empty) {
        expId = expSnap.docs[0].id;
        await db.collection("experiences").doc(expId).update({
          title: expFields.title,
          subtitle: expFields.subtitle,
          descriptionLong: expFields.descriptionLong,
          heroMedia: expFields.heroMedia,
          gallery: expFields.gallery,
          location: expFields.location,
          maxGuests: expFields.maxGuests ?? 6,
          included: expFields.included,
          whatToBring: expFields.whatToBring,
          rules: expFields.rules,
          faqs: expFields.faqs,
          timezone: expFields.timezone,
          seasonal: expFields.seasonal,
          active: expFields.active,
          pricingType: expFields.pricingType ?? "charter",
          allowDeposit: expFields.allowDeposit !== false,
          featured: expFields.featured === true,
          fromPriceCents: expFields.fromPriceCents ?? null,
          sortOrder: expFields.sortOrder ?? 999,
          ...(expFields.metaTitle ? { metaTitle: expFields.metaTitle } : {}),
          ...(expFields.metaDescription ? { metaDescription: expFields.metaDescription } : {}),
          ...(expFields.tagline ? { tagline: expFields.tagline } : {}),
          ...(expFields.stats ? { stats: expFields.stats } : {}),
          ...(Array.isArray(expFields.holidayDates) ? { holidayDates: expFields.holidayDates } : {}),
        });
      } else {
        const ref = db.collection("experiences").doc();
        expId = ref.id;
        await ref.set(expFields);
      }
      experienceIds.push(expId);

      const expRef = db.collection("experiences").doc(expId);
      await reconcileRates(expRef.collection("rates"), _rates);
      // Core charter products get the full addon catalog; specialty listings get a lighter set if inactive.
      if (expFields.slug === "pontoon" || expFields.slug === "watersports") {
        await reconcileAddons(expRef.collection("addons"), CATALOG_ADDONS);
      }
    }

    return { ok: true, experienceIds };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[seed-experiences]", err);
    return { ok: false, error: message };
  }
}
