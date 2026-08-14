/**
 * Charter upsell catalog — marketing + Firestore seed source of truth.
 * Template defaults are generic placeholders. A launch packet or admin should
 * replace these before a real customer goes live.
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
  seedPriceCents: number;
  seedType: "toggle" | "quantity";
  maxQty?: number;
  bookable: boolean;
  partnerFulfilled?: boolean;
  highlight?: boolean;
};

export const CHARTER_UPSELLS: UpsellDefinition[] = [
  {
    catalogKey: "cooler-ice",
    name: "Extra Ice",
    howItWorks: "Additional ice for the cooler.",
    suggestedPrice: { kind: "fixed", usd: 15, label: "$15" },
    seedPriceCents: 15_00,
    seedType: "toggle",
    bookable: true,
  },
  {
    catalogKey: "photo-package",
    name: "Photo Package",
    howItWorks: "Crew photos from the trip, delivered after you return.",
    suggestedPrice: { kind: "fixed", usd: 49, label: "$49" },
    seedPriceCents: 49_00,
    seedType: "toggle",
    bookable: true,
  },
];

export function formatUpsellPrice(price: UpsellSuggestedPrice): string {
  return price.label;
}

export function bookableUpsellKeys(): string[] {
  return CHARTER_UPSELLS.filter((u) => u.bookable).map((u) => u.catalogKey);
}
