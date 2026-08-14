import { brand } from "@/content/brand";
/**
 * Centralized Cabo fish-processing business rules and page copy.
 * Keep pricing, yields, and service claims here — not scattered in JSX.
 */

export type FishSpeciesId = "yellowfin" | "dorado" | "wahoo" | "other";

export type YieldBand = {
  /** Inclusive gross weight lower bound (lb). */
  minGrossLb: number;
  /** Inclusive gross weight upper bound (lb); omit for open-ended. */
  maxGrossLb?: number;
  /** Estimated finished yield low % (0–100). */
  yieldLowPct: number;
  /** Estimated finished yield high % (0–100). */
  yieldHighPct: number;
};

export type SpeciesConfig = {
  id: FishSpeciesId;
  name: string;
  shortLabel: string;
  /** Used in portion headline e.g. "THAT'S A LOT OF TUNA." */
  portionPunchline: string;
  yieldBands: YieldBand[];
  /** Extra note shown for broad/other estimates. */
  estimateNote?: string;
};

export const fishProcessingConfig = {
  /** Suggested finished-weight rate band ($/lb). */
  pricePerProcessedLbLow: 2,
  pricePerProcessedLbHigh: 3,
  /** @deprecated Prefer low/high — kept as the low end for single-rate displays. */
  pricePerProcessedLb: 2,
  minimumCharge: 30,
  weightSlider: {
    minLb: 10,
    maxLb: 300,
    defaultLb: 100,
    step: 1,
  },
  portionSizesOz: [8, 12] as const,
  heroImage: "/photos/nsf/yellowfin-marina-catch.jpg",
  heroImageAlt: `Yellowfin tuna catch at the marina — ${brand.companyName} Cabo fish processing`,
  labelMockup: {
    brand: brand.companyName.toUpperCase(),
    location: "CABO SAN LUCAS",
    species: "YELLOWFIN TUNA",
    caughtBy: "Michael",
    date: "08/10/26",
    boat: brand.shortName,
    packageWeight: "1.2 LB",
    disclaimer: "Visual concept only — personalized labels may vary by trip.",
  },
  travelPackaging: {
    pricedSeparately: true,
    priceNote: "Travel packaging priced separately",
    airlineNote:
      "Airline baggage rules vary. Travelers are responsible for confirming current airline and destination requirements.",
  },
  shipping: {
    availabilityNote:
      "Available only for qualifying destinations and catches. Shipping availability, cost, import requirements and transit options vary by destination.",
    quoteDependsNote:
      "Final shipping pricing depends on destination, package size, cold-chain requirements and current carrier availability.",
    leadSource: "cabo-fish-processing-shipping",
    /** Placeholder for future carrier-rate API integration. */
    liveRatesEnabled: false,
  },
  includedInBaseProcessing: [
    "Professional filleting",
    "Trimming",
    "Portioning",
    "Vacuum sealing",
    "Catch labeling",
    "Chill / freeze",
    "Storage until scheduled pickup",
  ] as const,
  processSteps: [
    { title: "CATCH IT", description: "Your crew gets it on deck." },
    { title: "CLEAN IT", description: "Your catch is professionally cleaned and filleted." },
    { title: "CUT IT", description: "We portion it into practical take-home cuts." },
    { title: "SEAL IT", description: "Portions are vacuum sealed for storage." },
    { title: "FREEZE IT", description: "Your fish is chilled/frozen and held for pickup." },
    {
      title: "TAKE IT HOME",
      description: "Choose travel-ready pickup, resort delivery, or qualifying shipping service.",
    },
  ] as const,
  calculatorDisclaimer:
    "Estimate only. Actual packaged weight varies by species, fish size, condition and requested cuts. Final processing price is based on finished processed weight at $2–$3/lb.",
} as const;

export const fishProcessingSpecies: Record<FishSpeciesId, SpeciesConfig> = {
  yellowfin: {
    id: "yellowfin",
    name: "Yellowfin Tuna",
    shortLabel: "YELLOWFIN",
    portionPunchline: "THAT'S A LOT OF TUNA.",
    yieldBands: [
      { minGrossLb: 10, maxGrossLb: 25, yieldLowPct: 25, yieldHighPct: 30 },
      { minGrossLb: 26, maxGrossLb: 75, yieldLowPct: 30, yieldHighPct: 35 },
      { minGrossLb: 76, maxGrossLb: 100, yieldLowPct: 35, yieldHighPct: 38 },
      { minGrossLb: 101, yieldLowPct: 38, yieldHighPct: 40 },
    ],
  },
  dorado: {
    id: "dorado",
    name: "Dorado / Mahi-Mahi",
    shortLabel: "DORADO",
    portionPunchline: "THAT'S A LOT OF DORADO.",
    yieldBands: [{ minGrossLb: 10, yieldLowPct: 40, yieldHighPct: 50 }],
  },
  wahoo: {
    id: "wahoo",
    name: "Wahoo",
    shortLabel: "WAHOO",
    portionPunchline: "THAT'S A LOT OF WAHOO.",
    yieldBands: [{ minGrossLb: 10, yieldLowPct: 40, yieldHighPct: 50 }],
  },
  other: {
    id: "other",
    name: "Other Catch",
    shortLabel: "CATCH",
    portionPunchline: "THAT'S A LOT OF FISH.",
    yieldBands: [{ minGrossLb: 10, yieldLowPct: 30, yieldHighPct: 50 }],
    estimateNote:
      "Broader estimate for mixed or other species. Actual processed weight is determined after cleaning.",
  },
};

export const fishProcessingSpeciesList: SpeciesConfig[] = [
  fishProcessingSpecies.yellowfin,
  fishProcessingSpecies.dorado,
  fishProcessingSpecies.wahoo,
  fishProcessingSpecies.other,
];

export const fishProcessingServiceTiers = [
  {
    id: "process",
    eyebrow: "Tier 1",
    title: "PROCESS IT",
    description: "The essentials.",
    features: ["Fillet", "Trim", "Portion", "Vacuum seal", "Freeze"],
    pricingLabel: `$2–$3/lb processed weight`,
    cta: "PROCESS MY CATCH",
    analyticsEvent: "fish_processing_process_cta_clicked" as const,
    highlight: false,
  },
  {
    id: "pack",
    eyebrow: "Tier 2",
    title: "PACK IT FOR MY FLIGHT",
    description: "We prepare your processed catch for easier travel home.",
    features: [
      "Everything in Process It",
      "Frozen catch preparation",
      "Insulated travel packaging",
      "Organized/labeled portions",
      "Pickup coordination",
    ],
    pricingLabel: fishProcessingConfig.travelPackaging.priceNote,
    note: fishProcessingConfig.travelPackaging.airlineNote,
    cta: "PACK IT FOR MY FLIGHT",
    analyticsEvent: "fish_processing_pack_cta_clicked" as const,
    highlight: false,
  },
  {
    id: "ship",
    eyebrow: "Tier 3 — Concierge",
    title: "SHIP IT TO MY DOOR",
    description:
      "Don't want to haul your catch through the airport? Ask about Nasty Catch Concierge shipping for qualifying destinations.",
    features: [
      "Processing",
      "Vacuum sealing",
      "Freezing",
      "Insulated shipping preparation",
      "Shipping coordination",
      "Destination-based quote",
    ],
    pricingLabel: "Destination-based quote",
    note: fishProcessingConfig.shipping.availabilityNote,
    cta: "GET A SHIPPING ESTIMATE",
    analyticsEvent: "fish_processing_shipping_started" as const,
    highlight: true,
  },
] as const;

export const fishProcessingFaqs: { question: string; answer: string }[] = [
  {
    question: "How much does fish processing cost in Cabo?",
    answer:
      `${brand.companyName} processes catch at $2–$3 per finished processed pound, with a $30 minimum. Pricing is based on the packaged weight after cleaning and portioning — not the gross fish weight on the boat. Use the calculator on this page for an estimate, then confirm final weight after processing. Resort delivery is a separate $49–$79 add-on when you want the catch brought to your Cabo resort.`,
  },
  {
    question: "Can you vacuum seal fish in Cabo San Lucas?",
    answer:
      "Yes. Our Cabo fish processing includes portioning and vacuum sealing so your catch is ready for the freezer. Vacuum-sealed packs help protect flavor and make travel packaging easier when you choose that option.",
  },
  {
    question: "How much meat do you get from a 100-pound tuna?",
    answer:
      "Yield varies by fish size, condition, and how you want it cut. As a planning estimate, larger yellowfin often finish in roughly the mid-to-high 30% range of gross weight — so a 100 lb fish might yield about 35–38 lb of take-home product. That is an estimate only; final packaged weight is measured after processing.",
  },
  {
    question: "Can Nasty freeze my catch until I leave Cabo?",
    answer:
      "Yes. After vacuum sealing, we freeze your fish and hold it until your scheduled pickup. Tell us your departure timing so we can coordinate when your catch is ready.",
  },
  {
    question: "Can I bring frozen fish home from Cabo?",
    answer:
      "Many travelers fly home with frozen, vacuum-sealed catch, but airline baggage rules, destination import rules, and customs requirements vary. You are responsible for confirming current carrier and destination requirements before you travel. We can help with travel-ready packaging when available.",
  },
  {
    question: "Can Nasty pack my fish for airline travel?",
    answer:
      "Yes — ask about our Pack It travel packaging. We prepare frozen, labeled portions in insulated travel packaging for easier airport logistics. Travel packaging is priced separately from base processing, and travelers must verify airline and destination rules.",
  },
  {
    question: "Can you ship my fish home from Cabo?",
    answer:
      "For qualifying destinations and catches, ask about Nasty Catch Concierge shipping. Availability, cost, import requirements, and transit options vary by destination. Request a shipping quote on this page — we do not guarantee shipping to every address or customs clearance.",
  },
  {
    question: "Can you process yellowfin tuna, dorado and wahoo?",
    answer:
      "Yes. Yellowfin tuna, dorado (mahi-mahi), and wahoo are common Cabo catches we process regularly. Other species may be possible depending on size, condition, and timing — contact us to confirm.",
  },
  {
    question: "Can you process fish if I used another charter?",
    answer:
      "Possibly. If you fished with another Cabo charter, contact us to confirm availability, species, catch size, and drop-off timing. Outside catch is accepted only when we can schedule it — we do not promise to take every outside delivery.",
  },
  {
    question: "How is my fish packaged?",
    answer:
      "Catch is filleted, trimmed, portioned, vacuum sealed, labeled, and frozen. You can pick up travel-ready packaging or ask about qualifying shipping preparation. Base processing does not automatically include travel boxes or shipping.",
  },
  {
    question: "When do I pick up my processed fish?",
    answer:
      "Pickup is coordinated around your departure and our processing schedule. After your charter (or approved drop-off), we clean, seal, and freeze your catch, then confirm when it is ready. Shipping options, when available, replace airport haul for qualifying destinations.",
  },
  {
    question: "Is the fish-processing calculator exact?",
    answer:
      "No. The calculator provides planning estimates only. Actual packaged weight varies by species, fish size, condition, and requested cuts. Final processing price is based on finished processed weight after cleaning.",
  },
];

export const fishProcessingRelatedLinks: { href: string; label: string }[] = [
  { href: "/booking", label: "Book a Cabo fishing charter" },
  { href: "/experiences", label: "Charter packages" },
  { href: "/boats/cabo-40-express", label: "Our fishing boat" },
  { href: "/cabo-san-lucas-fishing-charters", label: "Cabo fishing guide" },
  { href: "/cabo-fishing-charter-prices", label: "Charter prices" },
  { href: "/deep-sea-fishing-cabo", label: "Deep sea fishing Cabo" },
  { href: "/cabo-marlin-fishing", label: "Cabo marlin fishing" },
  { href: "/contact", label: "Contact Nasty" },
];
