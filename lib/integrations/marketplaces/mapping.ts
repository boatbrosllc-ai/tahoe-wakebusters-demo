import type { ExternalBookingEvent, MarketplaceListingMap, MarketplaceProvider } from "./types";
import { normalizeListingKey } from "./types";

/** Seeded mappings start empty — admins map listings in Marketplace Sync, or launch packet can seed later. */
export const DEFAULT_MARKETPLACE_MAPPINGS: MarketplaceListingMap[] = [];

export function mappingMatchKey(map: Pick<MarketplaceListingMap, "provider" | "matchType" | "matchValue">): string {
  return `${map.provider}:${map.matchType}:${normalizeListingKey(map.matchValue)}`;
}

export function findListingMapping(
  event: Pick<ExternalBookingEvent, "provider" | "externalListingName" | "externalListingId" | "externalProductCode">,
  maps: MarketplaceListingMap[]
): MarketplaceListingMap | null {
  const product = event.externalProductCode ? normalizeListingKey(event.externalProductCode) : "";
  const listingId = event.externalListingId ? normalizeListingKey(event.externalListingId) : "";
  const listingName = event.externalListingName ? normalizeListingKey(event.externalListingName) : "";
  const forProvider = maps.filter((m) => m.provider === event.provider);
  if (product) {
    const hit = forProvider.find((m) => m.matchType === "product_code" && normalizeListingKey(m.matchValue) === product);
    if (hit) return hit;
  }
  if (listingId) {
    const hit = forProvider.find((m) => m.matchType === "listing_id" && normalizeListingKey(m.matchValue) === listingId);
    if (hit) return hit;
  }
  if (listingName) {
    const exact = forProvider.find(
      (m) => m.matchType === "listing_name" && normalizeListingKey(m.matchValue) === listingName
    );
    if (exact) return exact;
    const contained = forProvider.find((m) => {
      if (m.matchType !== "listing_name") return false;
      const key = normalizeListingKey(m.matchValue);
      return key.length >= 12 && (listingName.includes(key) || key.includes(listingName));
    });
    if (contained) return contained;
  }
  return null;
}

/** Pick a listing boat when an experience has more than one, using the marketplace listing name. */
export function pickListingBoatId(
  boats: { id: string; name?: string }[],
  listingName?: string
): string | undefined {
  if (boats.length === 1) return boats[0].id;
  if (!listingName || boats.length === 0) return undefined;
  const listing = normalizeListingKey(listingName);
  let best: { id: string; score: number } | null = null;
  for (const boat of boats) {
    const name = normalizeListingKey(boat.name || "");
    if (!name) continue;
    let score = 0;
    if (listing.includes(name) || name.includes(listing)) score += 12;
    for (const token of name.split(" ").filter((t) => t.length >= 4)) {
      if (listing.includes(token)) score += token.length;
    }
    if (/\b(mercury|verado)\b/.test(listing) && /\bsuntracker\b/.test(name)) score += 10;
    if (/\b(encore|navigator)\b/.test(listing) && /\bbentley\b/.test(name)) score += 10;
    if (score > (best?.score ?? 0)) best = { id: boat.id, score };
  }
  return best && best.score >= 4 ? best.id : undefined;
}

function isGuessableListingName(key: string): boolean {
  if (key.length < 8) return false;
  if (/\b(http|https|www|click getmyboat|itunes apple)\b/.test(key)) return false;
  if (/get ready to earn/.test(key)) return false;
  return true;
}

function isMercuryPontoonListing(key: string): boolean {
  return /\bmercury\b/.test(key) && /\b(verado|150l|4-stroke|4 stroke)\b/.test(key);
}

/** Guess a the operator experience from an obvious marketplace listing name. Returns null if unsure. */
export function guessMarketplaceExperience(text: string): { experienceSlug: string; durationHours?: number } | null {
  const key = normalizeListingKey(text);
  if (!isGuessableListingName(key)) return null;
  const wake = /\b(axis|wakesurf|wakeboard|wakesetter|malibu|wake surf|wake)\b/.test(key);
  const pontoon = /\b(pontoon|tritoon|neptoon)\b/.test(key) || isMercuryPontoonListing(key);
  const sunset = /\bsunset\b/.test(key);
  const holiday = /\b(holiday|july 4|4th of july|fourth of july|fireworks)\b/.test(key);
  const hits = [
    wake ? "watersports" : null,
    pontoon ? "pontoon" : null,
    sunset ? "sunset" : null,
    holiday ? "holiday" : null,
  ].filter((v): v is string => Boolean(v));
  if (hits.length !== 1) return null;
  const experienceSlug = hits[0];
  if (experienceSlug === "sunset") return { experienceSlug, durationHours: 2 };
  return { experienceSlug };
}

export function autoMappingFromEvent(
  event: Pick<ExternalBookingEvent, "provider" | "externalListingName" | "externalListingId" | "externalProductCode">
): MarketplaceListingMap | null {
  const name = event.externalListingName?.trim() || "";
  const guessFromName = name ? guessMarketplaceExperience(name) : null;
  const identity = listingIdentityForEvent(event);
  const guess = guessFromName ?? (identity ? guessMarketplaceExperience(identity.matchValue) : null);
  if (!guess) return null;
  const matchType: MarketplaceListingMap["matchType"] = guessFromName ? "listing_name" : identity!.matchType;
  const matchValue = guessFromName ? name : identity!.matchValue;
  return {
    provider: event.provider,
    matchType,
    matchValue,
    experienceSlug: guess.experienceSlug,
    durationHours: guess.durationHours,
    autoMapped: true,
  };
}

export function listingIdentityForEvent(
  event: Pick<ExternalBookingEvent, "provider" | "externalListingName" | "externalListingId" | "externalProductCode">
): { matchType: MarketplaceListingMap["matchType"]; matchValue: string } | null {
  if (event.externalProductCode?.trim()) {
    return { matchType: "product_code", matchValue: event.externalProductCode.trim() };
  }
  if (event.externalListingId?.trim()) {
    return { matchType: "listing_id", matchValue: event.externalListingId.trim() };
  }
  if (event.externalListingName?.trim()) {
    return { matchType: "listing_name", matchValue: event.externalListingName.trim() };
  }
  return null;
}

export function providerLabel(provider: MarketplaceProvider): string {
  if (provider === "boatsetter") return "Boatsetter";
  if (provider === "getmyboat") return "Getmyboat";
  return "Viator";
}
