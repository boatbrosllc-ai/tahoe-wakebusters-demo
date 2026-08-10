/**
 * Final charter upsell catalog — marketing + Firestore seed source of truth.
 * Checkout charges use mid/suggested seed prices where a range is listed;
 * per-lb fish processing finalizes after weigh-out.
 */

export type UpsellSuggestedPrice =
  | { kind: "fixed"; usd: number; label: string }
  | { kind: "from"; usd: number; label: string }
  | { kind: "range"; lowUsd: number; highUsd: number; label: string }
  | { kind: "per_lb_range"; lowUsd: number; highUsd: number; label: string };

export type UpsellDefinition = {
  /** Matches ExperienceAddon.catalogKey when bookable. */
  catalogKey: string;
  name: string;
  howItWorks: string;
  suggestedPrice: UpsellSuggestedPrice;
  /**
   * Flat checkout price in cents for seed (mid of range, or floor of "from").
   * Fish processing uses the $30 minimum reservation; final $2–$3/lb after weigh-out.
   */
  seedPriceCents: number;
  seedType: "toggle" | "quantity";
  maxQty?: number;
  /** false = keep in catalog but hide from booking until ready (e.g. alcohol licensing). */
  bookable: boolean;
  partnerFulfilled?: boolean;
  highlight?: boolean;
};

/**
 * Final NSF upsell menu.
 * Beer / Seltzer stays non-bookable until alcohol licensing is confirmed.
 */
export const CHARTER_UPSELLS: UpsellDefinition[] = [
  {
    catalogKey: "fish-processing",
    name: "Nasty In-House Fish Processing",
    howItWorks: "Fillet, trim, portion, vacuum seal, label, chill/freeze. Final charge $2–$3/lb after weigh-out ($30 min reserves the service at checkout).",
    suggestedPrice: { kind: "per_lb_range", lowUsd: 2, highUsd: 3, label: "$2–$3/lb" },
    seedPriceCents: 30_00,
    seedType: "toggle",
    bookable: true,
  },
  {
    catalogKey: "resort-fish-delivery",
    name: "Resort Fish Delivery",
    howItWorks: "Deliver processed catch to the guest’s Cabo resort.",
    suggestedPrice: { kind: "range", lowUsd: 49, highUsd: 79, label: "$49–$79" },
    seedPriceCents: 64_00,
    seedType: "toggle",
    bookable: true,
  },
  {
    catalogKey: "premium-breakfast",
    name: "Premium Breakfast",
    howItWorks: "Upgraded breakfast for your group — up to 4 guests.",
    suggestedPrice: { kind: "fixed", usd: 129, label: "$129/group" },
    seedPriceCents: 129_00,
    seedType: "toggle",
    bookable: true,
  },
  {
    catalogKey: "premium-lunch",
    name: "Premium Offshore Lunch",
    howItWorks: "Premium offshore lunch for your group — up to 4 guests.",
    suggestedPrice: { kind: "fixed", usd: 199, label: "$199/group" },
    seedPriceCents: 199_00,
    seedType: "toggle",
    bookable: true,
  },
  {
    catalogKey: "beverage-package",
    name: "Beer / Seltzer Package",
    howItWorks: "Beer / seltzer package — offered only once alcohol licensing is confirmed.",
    suggestedPrice: { kind: "from", usd: 189, label: "$189+" },
    seedPriceCents: 189_00,
    seedType: "toggle",
    bookable: false,
  },
  {
    catalogKey: "resort-transportation",
    name: "Private Resort Transportation",
    howItWorks: "Resort ↔ marina through a licensed transport partner.",
    suggestedPrice: { kind: "range", lowUsd: 149, highUsd: 199, label: "$149–$199" },
    seedPriceCents: 174_00,
    seedType: "toggle",
    bookable: true,
    partnerFulfilled: true,
  },
  {
    catalogKey: "sjd-airport-transportation",
    name: "SJD Airport Transportation",
    howItWorks: "Airport transfer through a licensed transport partner.",
    suggestedPrice: { kind: "from", usd: 249, label: "$249+" },
    seedPriceCents: 249_00,
    seedType: "toggle",
    bookable: true,
    partnerFulfilled: true,
  },
  {
    catalogKey: "nasty-gear-pack",
    name: "Nasty Gear Pack",
    howItWorks: "Shirt, hat, tumbler/koozie, dry bag, and more. Select quantity for your group.",
    suggestedPrice: { kind: "fixed", usd: 119, label: "$119/person" },
    seedPriceCents: 119_00,
    seedType: "quantity",
    maxQty: 8,
    bookable: true,
  },
  {
    catalogKey: "trophy-replica-concierge",
    name: "Trophy Replica Concierge",
    howItWorks: "Photos/measurements + handoff to a replica company — $99 coordination fee.",
    suggestedPrice: { kind: "fixed", usd: 99, label: "$99 coordination fee" },
    seedPriceCents: 99_00,
    seedType: "toggle",
    bookable: true,
  },
  {
    catalogKey: "nasty-film-day",
    name: "Nasty Film Day",
    howItWorks: "We travel to Cabo and professionally document the trip — $1,500 minimum.",
    suggestedPrice: { kind: "from", usd: 1500, label: "$1,500 minimum" },
    seedPriceCents: 1500_00,
    seedType: "toggle",
    bookable: true,
    highlight: true,
  },
];

export function formatUpsellPrice(price: UpsellSuggestedPrice): string {
  return price.label;
}

/** Bookable catalog keys only (excludes beer/seltzer until licensed). */
export function bookableUpsellKeys(): string[] {
  return CHARTER_UPSELLS.filter((u) => u.bookable).map((u) => u.catalogKey);
}
