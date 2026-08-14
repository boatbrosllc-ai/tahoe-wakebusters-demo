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

import type { CollectionReference, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getDb } from "@/lib/booking/firebase-admin";
import type { Experience, ExperienceRate, ExperienceAddon } from "@/lib/booking/types";
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

const CANCELLATION_POLICY = {
  freeCancelDays: 30,
  partialRefundDaysStart: 15,
  partialRefundDaysEnd: 30,
  noRefundWithinDays: 14,
  fullText:
    "Free cancellation up to 30 days before. Partial refund 15–30 days before. No refund within 14 days.",
};

const WHAT_TO_BRING = ["Sunscreen", "Sunglasses", "Hat", "Soft-soled shoes", "Valid ID"];
const RULES = ["Follow captain instructions", "No glass on deck", "Release billfish when required"];

type RateSeed = Omit<ExperienceRate, "active"> & { active: boolean };
type AddonSeed = Omit<ExperienceAddon, "active"> & { active: boolean; catalogKey: string };

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

/** Legacy keys kept in Firestore (reconcile updates) but deactivated. */
const LEGACY_ADDONS: AddonSeed[] = [
  {
    catalogKey: "extra-fishing-hour",
    name: "Extra Fishing Hour",
    description: "Superseded by Full Day +1/+2/+3 hour extensions.",
    priceCents: 300_00,
    type: "toggle",
    active: false,
    hiddenFromBookingUI: true,
  },
  {
    catalogKey: "offshore-run",
    name: "Offshore Run Upgrade",
    description: "Ask when booking if you want additional fuel range for longer runs.",
    priceCents: 450_00,
    type: "toggle",
    active: false,
    hiddenFromBookingUI: true,
  },
  {
    catalogKey: "celebration-package",
    name: "Celebration Package",
    description: "Legacy celebration add-on — no longer offered.",
    priceCents: 225_00,
    type: "toggle",
    active: false,
    hiddenFromBookingUI: true,
  },
  {
    catalogKey: "cook-your-catch",
    name: "Cook Your Catch",
    description: "Legacy partner cook-your-catch — no longer offered at checkout.",
    priceCents: 125_00,
    type: "toggle",
    active: false,
    hiddenFromBookingUI: true,
    partnerFulfilled: true,
  },
  {
    catalogKey: "fish-processing-delivery",
    name: "Fish Processing & Delivery",
    description: "Replaced by Nasty In-House Fish Processing + Resort Fish Delivery.",
    priceCents: 135_00,
    type: "toggle",
    active: false,
    hiddenFromBookingUI: true,
  },
  {
    catalogKey: "framed-catch-print",
    name: "Framed Catch Print",
    description: "Replaced by Trophy Replica Concierge.",
    priceCents: 149_00,
    type: "toggle",
    active: false,
    hiddenFromBookingUI: true,
  },
  {
    catalogKey: "extra-ice",
    name: "Extra ice",
    description: "Additional ice for the cooler",
    priceCents: 1000,
    type: "toggle",
    active: false,
    hiddenFromBookingUI: true,
  },
  {
    catalogKey: "fish-cleaning",
    name: "Fish cleaning",
    description: "Prefer Nasty In-House Fish Processing for full service.",
    priceCents: 2500,
    type: "toggle",
    active: false,
    hiddenFromBookingUI: true,
  },
];

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
      { q: "What should we bring?", a: "Sunscreen, sunglasses, hat, soft-soled shoes. We provide tackle, bait, snacks, and drinks listed in what's included." },
    ],
    seasonal: { enabled: false },
    active: true,
    timezone: "America/Mazatlan",
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
      { q: "How far offshore do we go?", a: "Depends on the bite and conditions. Full-day trips give us range to work multiple grounds." },
    ],
    seasonal: { enabled: false },
    active: true,
    timezone: "America/Mazatlan",
    pricingType: "charter",
    allowDeposit: true,
    featured: true,
    fromPriceCents: getActiveCatalogRateCents("full"),
    sortOrder: 0,
    metaTitle: `${siteConfig.catalog.fullDay.title} | ${siteConfig.catalog.fullDay.durationLabel}`,
    metaDescription: `Book ${siteConfig.catalog.fullDay.title} — private captained charter. ${brand.companyName}.`,
    tagline: FOUNDING_ANGLER_RATE_ACTIVE ? FOUNDING_ANGLER_LABEL : "MOST POPULAR",
    stats: ["MOST POPULAR"],
    // Peak/tournament windows: set date ranges in admin (holidayDates) or pricing calendar.
    // priceHolidayCents on the 8h rate = $2,395 when those dates apply.
    holidayDates: [],
    _rates: fullDayRates(),
  },
  {
    slug: "sunset",
    title: "Sunset Bite",
    subtitle: "Evening charter — golden hour, rods out, Cabo skyline.",
    descriptionLong:
      "Shorter evening trip timed around sunset. Available as a specialty charter — primary packages are Half Day and Full Day.",
    heroMedia: { type: "image", url: "/photos/stock/cabo/el-arco-sunset-jarvis.jpg" },
    gallery: [
      "/photos/stock/cabo/el-arco-sunset-jarvis.jpg",
      "/photos/stock/charter/fishing-boat-sunset.jpg",
      "/photos/nsf/rods-wake-sunset.png",
      "/photos/nsf/reel-sunset.png",
    ],
    location: {
      title: "Marina Cabo San Lucas",
      addressText: "We'll send exact slip / meet-up after booking.",
    },
    maxGuests: 6,
    petsMax: 0,
    included: CHARTER_INCLUDED.slice(0, 6),
    whatToBring: ["Light layer", "Camera", "Valid ID"],
    rules: RULES,
    cancellationPolicy: CANCELLATION_POLICY,
    faqs: [],
    seasonal: { enabled: false },
    active: false,
    timezone: "America/Mazatlan",
    pricingType: "charter",
    sortOrder: 90,
    _rates: [
      { durationHours: 4, displayName: "Sunset (4 Hours)", priceCents: getActiveCatalogRateCents("half"), active: true },
    ],
  },
  {
    slug: "holiday",
    title: "Billfish Special",
    subtitle: "Marlin and sailfish days when Cabo is on fire.",
    descriptionLong:
      "Targeted billfish charter. Primary bookable products are Half Day and Full Day; ask us about billfish-focused days.",
    heroMedia: { type: "image", url: "/photos/nsf/sailfish-baitball.png" },
    gallery: [
      "/photos/nsf/sailfish-baitball.png",
      "/photos/stock/species/tuna-underwater-bacanek.jpg",
      "/photos/nsf/yellowfin-marina-catch.png",
      "/photos/stock/cabo/aerial-lands-end-clark.jpg",
    ],
    location: {
      title: "Marina Cabo San Lucas",
      addressText: "We'll send exact slip / meet-up after booking.",
    },
    maxGuests: 6,
    petsMax: 0,
    included: CHARTER_INCLUDED,
    whatToBring: WHAT_TO_BRING,
    rules: RULES,
    cancellationPolicy: CANCELLATION_POLICY,
    faqs: [],
    seasonal: { enabled: true, startMonth: 5, endMonth: 11 },
    active: false,
    timezone: "America/Mazatlan",
    pricingType: "charter",
    sortOrder: 91,
    _rates: [
      {
        durationHours: 8,
        displayName: "Billfish Day (8 Hours)",
        priceCents: getActiveCatalogRateCents("full"),
        priceHolidayCents: PEAK_FULL_DAY_CENTS,
        active: true,
      },
    ],
  },
];

async function reconcileRates(
  ratesRef: CollectionReference,
  desired: RateSeed[]
): Promise<void> {
  const existing = await ratesRef.get();
  const byHours = new Map<number, QueryDocumentSnapshot>();
  for (const doc of existing.docs) {
    const hours = (doc.data() as ExperienceRate).durationHours;
    if (typeof hours === "number" && !byHours.has(hours)) byHours.set(hours, doc);
  }

  const desiredHours = new Set(desired.map((r) => r.durationHours));

  for (const rate of desired) {
    const hit = byHours.get(rate.durationHours);
    if (hit) {
      await hit.ref.update({
        displayName: rate.displayName,
        priceCents: rate.priceCents,
        active: rate.active,
        ...(rate.priceHolidayCents != null ? { priceHolidayCents: rate.priceHolidayCents } : {}),
        ...(rate.priceWeekendCents != null ? { priceWeekendCents: rate.priceWeekendCents } : {}),
        ...(rate.priceFriSunCents != null ? { priceFriSunCents: rate.priceFriSunCents } : {}),
      });
    } else {
      await ratesRef.doc().set(rate);
    }
  }

  // Deactivate any leftover duration tiers not in the desired set (do not delete).
  for (const [hours, doc] of Array.from(byHours.entries())) {
    if (!desiredHours.has(hours)) {
      await doc.ref.update({ active: false });
    }
  }
}

async function reconcileAddons(
  addonsRef: CollectionReference,
  desired: AddonSeed[]
): Promise<void> {
  const existing = await addonsRef.get();
  const byKey = new Map<string, QueryDocumentSnapshot>();
  for (const doc of existing.docs) {
    const data = doc.data() as ExperienceAddon & { catalogKey?: string };
    const key = (data.catalogKey ?? data.name ?? "").toLowerCase().trim();
    if (key && !byKey.has(key)) byKey.set(key, doc);
  }

  for (const addon of desired) {
    const key = addon.catalogKey.toLowerCase();
    const nameKey = addon.name.toLowerCase();
    const hit = byKey.get(key) ?? byKey.get(nameKey);
    const payload = { ...addon, active: addon.active };
    if (hit) {
      await hit.ref.update(payload);
    } else {
      await addonsRef.doc().set(payload);
    }
  }
}

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
