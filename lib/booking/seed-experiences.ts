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

const CATALOG_ADDONS: AddonSeed[] = [
  {
    catalogKey: "extra-fishing-hour",
    name: "Extra Fishing Hour",
    description:
      "Add additional fishing time when the boat schedule, captain, and conditions allow. Subject to same-day availability.",
    priceCents: 300_00, // mid of $250–$350
    type: "toggle",
    active: true,
    highlight: true,
  },
  {
    catalogKey: "resort-transportation",
    name: "Resort / Airport Transportation",
    description: "Private transportation between Cabo accommodations and the marina. Partner fulfilled.",
    priceCents: 225_00, // mid of $150–$300
    type: "toggle",
    active: true,
    partnerFulfilled: true,
  },
  {
    catalogKey: "offshore-run",
    name: "Offshore Run Upgrade",
    description: "Additional fuel allowance for significantly longer runs to distant fishing grounds.",
    priceCents: 450_00, // mid of $300–$600
    type: "toggle",
    active: true,
  },
  {
    catalogKey: "premium-breakfast",
    name: "Premium Breakfast",
    description: "Upgraded breakfast spread for the crew and anglers.",
    priceCents: 110_00, // mid of $75–$150
    type: "toggle",
    active: true,
  },
  {
    catalogKey: "beverage-package",
    name: "Beverage Package",
    description: "Expanded soft drinks and non-alcoholic refreshments for the trip.",
    priceCents: 145_00, // mid of $95–$195
    type: "toggle",
    active: true,
  },
  {
    catalogKey: "premium-lunch",
    name: "Premium Lunch",
    description: "Heartier lunch provisioning for a full day offshore.",
    priceCents: 185_00, // mid of $125–$250
    type: "toggle",
    active: true,
  },
  {
    catalogKey: "celebration-package",
    name: "Celebration Package",
    description: "Onboard celebration touches for birthdays, proposals, and special occasions.",
    priceCents: 225_00, // mid of $149–$299
    type: "toggle",
    active: true,
    highlight: true,
  },
  {
    catalogKey: "cook-your-catch",
    name: "Cook Your Catch",
    description: "Partner-fulfilled cook-your-catch experience after the trip (availability varies).",
    priceCents: 125_00, // mid of $95–$150
    type: "toggle",
    active: true,
    partnerFulfilled: true,
  },
  {
    catalogKey: "fish-processing-delivery",
    name: "Fish Processing & Delivery",
    description: "Partner-fulfilled processing and local delivery when available.",
    priceCents: 135_00, // mid of $75–$200
    type: "toggle",
    active: true,
    partnerFulfilled: true,
  },
  {
    catalogKey: "nasty-gear-pack",
    name: "Nasty Gear Pack",
    description: "Per-person gear pack (hat, buff, and trip essentials). Select quantity for your group.",
    priceCents: 110_00, // mid of $75–$150 per person
    type: "quantity",
    maxQty: 8,
    active: true,
  },
  {
    catalogKey: "framed-catch-print",
    name: "Framed Catch Print",
    description: "Framed print of your catch photo — produced after the trip.",
    priceCents: 149_00, // mid of $99–$199
    type: "toggle",
    active: true,
  },
  // Legacy addons kept available but de-emphasized
  {
    catalogKey: "extra-ice",
    name: "Extra ice",
    description: "Additional ice for the cooler",
    priceCents: 1000,
    type: "toggle",
    active: true,
    hiddenFromBookingUI: true,
  },
  {
    catalogKey: "fish-cleaning",
    name: "Fish cleaning",
    description: "Filet service when available — prefer Fish Processing & Delivery for full service.",
    priceCents: 2500,
    type: "toggle",
    active: true,
    hiddenFromBookingUI: true,
  },
];

function halfDayRates(): RateSeed[] {
  const priceCents = getActiveCatalogRateCents("half");
  return [
    {
      durationHours: 5,
      displayName: "Nasty Half Day (5 Hours)",
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
  const priceCents = getActiveCatalogRateCents("full");
  return [
    {
      durationHours: 8,
      displayName: "Nasty Full Day (8 Hours)",
      priceCents,
      priceHolidayCents: PEAK_FULL_DAY_CENTS,
      active: true,
    },
    { durationHours: 4, displayName: "Half-Day (4 Hours)", priceCents: STANDARD_RATE_CENTS.half, active: false },
    { durationHours: 5, displayName: "Half-Day (5 Hours)", priceCents: STANDARD_RATE_CENTS.half, active: false },
    { durationHours: 10, displayName: "Full-Day (10 Hours)", priceCents: STANDARD_RATE_CENTS.full, active: false },
  ];
}

const EXPERIENCES: (Omit<Experience, "id"> & { _rates: RateSeed[] })[] = [
  {
    slug: "pontoon",
    title: "Nasty Half Day",
    subtitle: "5 Hours · Private Cabo Fishing Charter",
    descriptionLong:
      "Private half-day Cabo sport fishing charter. Captain and mate, premium tackle, live bait allowance, licenses for up to four anglers, water, soft drinks, snacks, light breakfast, crew photos, and local-grounds fuel.",
    heroMedia: { type: "image", url: "/photos/nsf/yellowfin-marina-duo.png" },
    gallery: [
      "/photos/nsf/yellowfin-marina-duo.png",
      "/photos/stock/charter/anglers-on-boat-pexels.jpg",
      "/photos/nsf/yellowfin-marina-catch.png",
      "/photos/stock/cabo/el-arco-from-boat-pexels.jpg",
    ],
    location: {
      title: "Marina Cabo San Lucas",
      addressText: "We'll send exact slip / meet-up after booking.",
      notes: "Meet at the marina — soft-soled shoes recommended.",
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
    metaTitle: "Nasty Half Day Cabo Fishing Charter | 5 Hours",
    metaDescription:
      "Book Nasty Half Day — 5-hour private Cabo fishing charter with captain, tackle, bait, and provisions. Nasty Sport Fishing.",
    tagline: FOUNDING_ANGLER_RATE_ACTIVE ? FOUNDING_ANGLER_LABEL : "Private Cabo Fishing Charter",
    _rates: halfDayRates(),
  },
  {
    slug: "watersports",
    title: "Nasty Full Day",
    subtitle: "8 Hours · Private Offshore Charter",
    descriptionLong:
      "Private full-day Cabo offshore charter. More range for the banks and edges when conditions allow. Captain and mate, premium tackle, live bait allowance, licenses for up to four anglers, water, soft drinks, snacks, light breakfast, crew photos, and local-grounds fuel.",
    heroMedia: { type: "image", url: "/photos/nsf/yellowfin-ocean-duo.png" },
    gallery: [
      "/photos/nsf/yellowfin-ocean-duo.png",
      "/photos/nsf/sailfish-baitball.png",
      "/photos/stock/species/tuna-underwater-bacanek.jpg",
      "/photos/nsf/yellowfin-marina-catch.png",
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
    metaTitle: "Nasty Full Day Cabo Fishing Charter | 8 Hours Most Popular",
    metaDescription:
      "Book Nasty Full Day — 8-hour private Cabo offshore charter. Most popular trip. Captain, tackle, bait, and provisions included.",
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
      "Shorter evening trip timed around sunset. Available as a specialty charter — primary packages are Nasty Half Day and Nasty Full Day.",
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
      "Targeted billfish charter. Primary bookable products are Nasty Half Day and Nasty Full Day; ask us about billfish-focused days.",
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
