/**
 * Seed Firestore with experiences, rates, and addons.
 * Slot documents are not created — the slots API returns synthetic "open" slots for all dates
 * until a hold/booking exists. This keeps the seed under Firestore quota.
 */

import { getDb } from "@/lib/booking/firebase-admin";
import type { Experience, ExperienceRate, ExperienceAddon } from "@/lib/booking/types";

const CANCELLATION_POLICY = {
  freeCancelDays: 30,
  partialRefundDaysStart: 15,
  partialRefundDaysEnd: 30,
  noRefundWithinDays: 14,
  fullText:
    "Free cancellation up to 30 days before. Partial refund 15–30 days before. No refund within 14 days.",
};

const SHARED_RATES: Omit<ExperienceRate, "active">[] = [
  { durationHours: 3, displayName: "Three Hour Charter", priceCents: 45000 },
  { durationHours: 4, displayName: "Four Hour Charter", priceCents: 60000 },
  { durationHours: 5, displayName: "Five Hour Charter", priceCents: 75000 },
  { durationHours: 6, displayName: "Six Hour Charter", priceCents: 90000 },
  { durationHours: 8, displayName: "Eight Hour Charter", priceCents: 120000 },
];

const SHARED_ADDONS: Omit<ExperienceAddon, "active">[] = [
  { name: "Damage waiver", description: "Covers accidental damage to the boat", priceCents: 3500, type: "toggle", highlight: true },
  { name: "Snack pack", description: "Light snacks and water", priceCents: 2500, type: "toggle" },
  { name: "Ice", description: "Cooler ice", priceCents: 500, type: "toggle" },
  { name: "Towels", description: "Beach towels", priceCents: 1500, type: "quantity", maxQty: 10 },
];

const EXPERIENCES: Omit<Experience, "id">[] = [
  {
    slug: "pontoon",
    title: "Lake Austin Pontoon Charter",
    subtitle: "Spacious pontoon for groups. Coolers, Bluetooth, shade.",
    descriptionLong:
      "Our most popular experience. Roomy pontoon with Bluetooth stereo, built-in cooler, and plenty of shade. Perfect for friends, families, or bachelor/bachelorette groups. Captain included.",
    heroMedia: { type: "image", url: "/photos/DSC00427.webp" },
    gallery: ["/photos/DSC00452.webp", "/photos/DSC00456.webp", "/photos/DSC00461.webp"],
    location: { title: "Lake Austin", addressText: "We'll send exact meeting point after booking.", notes: "Parking available nearby." },
    maxGuests: 14,
    petsMax: 4,
    included: ["Captain", "Cooler", "Bluetooth stereo", "Shade canopy", "Life vests"],
    whatToBring: ["Sunscreen", "Water-friendly shoes", "Valid ID"],
    rules: ["No glass on board", "No smoking", "Follow captain instructions"],
    cancellationPolicy: CANCELLATION_POLICY,
    faqs: [
      { q: "Is a captain included?", a: "Yes. Every charter includes a licensed captain so you can relax and enjoy the day." },
      { q: "Can we bring food and drinks?", a: "Yes. Bring your own cooler and drinks. Glass is not allowed on the boat." },
    ],
    seasonal: { enabled: false },
    active: true,
    timezone: "America/Chicago",
  },
  {
    slug: "watersports",
    title: "Lake Austin WaterSports Charter",
    subtitle: "Tow boats for wakeboarding, surfing, and tubing.",
    descriptionLong:
      "Purpose-built tow boats for wakeboarding, wakesurfing, and tubing. Experienced drivers available. Great for thrill-seekers and families who want action on the water.",
    heroMedia: { type: "image", url: "/photos/DSC00462.webp" },
    gallery: ["/photos/DSC00484.webp", "/photos/DSC00513.webp"],
    location: { title: "Lake Austin", addressText: "We'll send exact meeting point after booking." },
    maxGuests: 8,
    petsMax: 0,
    included: ["Wakeboard & surf gear", "Tubes", "Life vests", "Driver optional"],
    whatToBring: ["Swimwear", "Sunscreen", "Valid ID"],
    rules: ["No glass", "Life vests when in water", "Follow driver instructions"],
    cancellationPolicy: CANCELLATION_POLICY,
    faqs: [
      { q: "Is equipment included?", a: "Yes. Wakeboards, surf board, and tubes are included. Life vests in all sizes provided." },
    ],
    seasonal: { enabled: false },
    active: true,
    timezone: "America/Chicago",
  },
  {
    slug: "sunset",
    title: "Lake Austin Sunset Cruise",
    subtitle: "Chill evening cruise. Best views and golden hour.",
    descriptionLong:
      "Evening cruise timed for sunset over Lake Austin. Relaxed pace, great for couples or small groups. Bring a bottle and enjoy the view.",
    heroMedia: { type: "image", url: "/photos/DSC09255.webp" },
    gallery: ["/photos/DSC09270.webp", "/photos/DSC09285.webp"],
    location: { title: "Lake Austin", addressText: "We'll send exact meeting point after booking." },
    maxGuests: 6,
    petsMax: 0,
    included: ["Captain", "Life vests", "Bluetooth"],
    whatToBring: ["Light jacket", "Camera", "Valid ID"],
    rules: ["No glass", "No smoking"],
    cancellationPolicy: CANCELLATION_POLICY,
    faqs: [{ q: "What time does the cruise start?", a: "We time departures for sunset; exact time varies by season. You'll see the slot when booking." }],
    seasonal: { enabled: false },
    active: true,
    timezone: "America/Chicago",
  },
  {
    slug: "holiday",
    title: "Lake Austin Holiday Boat Tour",
    subtitle: "Seasonal holiday lights and festive cruises.",
    descriptionLong:
      "Seasonal holiday experience: festive lights, hot cocoa, and a relaxed cruise. Available during the holiday season. Perfect for families and small groups.",
    heroMedia: { type: "image", url: "/photos/DSC09354.webp" },
    gallery: ["/photos/DSC09378.webp", "/photos/DSC09423.webp"],
    location: { title: "Lake Austin", addressText: "We'll send exact meeting point after booking." },
    maxGuests: 10,
    petsMax: 0,
    included: ["Holiday décor", "Hot cocoa", "Captain", "Life vests"],
    whatToBring: ["Warm layers", "Valid ID"],
    rules: ["No glass", "No smoking", "Holiday-appropriate behavior"],
    cancellationPolicy: CANCELLATION_POLICY,
    faqs: [{ q: "When is the Holiday Tour available?", a: "Typically November through early January. Dates are shown when you select a slot." }],
    seasonal: { enabled: true, startMonth: 11, endMonth: 1 },
    active: true,
    timezone: "America/Chicago",
  },
];

export async function runSeedExperiences(): Promise<
  { ok: true; experienceIds: string[] } | { ok: false; error: string }
> {
  try {
    const db = getDb();
    const experienceIds: string[] = [];

    for (const expConfig of EXPERIENCES) {
      const expSnap = await db.collection("experiences").where("slug", "==", expConfig.slug).limit(1).get();
      let expId: string;
      if (!expSnap.empty) {
        expId = expSnap.docs[0].id;
      } else {
        const ref = db.collection("experiences").doc();
        expId = ref.id;
        await ref.set(expConfig);
      }
      experienceIds.push(expId);

      const expRef = db.collection("experiences").doc(expId);
      const ratesRef = expRef.collection("rates");
      const addonsRef = expRef.collection("addons");

      const existingRates = await ratesRef.get();
      if (existingRates.empty) {
        for (const r of SHARED_RATES) {
          await ratesRef.doc().set({ ...r, active: true });
        }
      }

      const existingAddons = await addonsRef.get();
      if (existingAddons.empty) {
        for (const a of SHARED_ADDONS) {
          await addonsRef.doc().set({ ...a, active: true });
        }
      }
    }

    return { ok: true, experienceIds };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[seed-experiences]", err);
    return { ok: false, error: message };
  }
}
