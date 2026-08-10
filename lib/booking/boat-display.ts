/**
 * Ensures boat descriptions shown on the site always match the boat's name
 * (e.g. no "Bentley tritoon" copy for a boat titled "JC Neptoon Tritoon").
 */

export interface BoatDisplayInput {
  name: string;
  description?: string;
  boatType?: string;
  /** Max guests for generated copy (e.g. "up to 14 guests"). Defaults to 14 when omitted. */
  capacity?: number;
}

/** Display name without capacity suffix for use in generated copy (e.g. "JC Neptoon Tritoon"). */
export function getDisplayName(boatName: string): string {
  const n = (boatName ?? "").trim();
  const suffix = n.match(/\s+-\s+\d+\s*Person\s+Capacity$/i);
  return suffix ? n.slice(0, suffix.index).trim() || n : n;
}

/** True if the stored description appears to refer to this boat (contains part of boat name). */
function descriptionMatchesBoat(boatName: string, description: string): boolean {
  const namePart = getDisplayName(boatName);
  if (!namePart) return false;
  const firstChunk = description.trim().slice(0, 70).toLowerCase();
  const words = namePart
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .map((w) => w.toLowerCase());
  return words.some((word) => firstChunk.includes(word));
}

const DEFAULT_CAPACITY = 6;

/** Type-specific first-line copy that uses the boat name (never another brand). */
function generatedDescription(boat: BoatDisplayInput): string {
  const displayName = getDisplayName(boat.name);
  const guests = boat.capacity ?? DEFAULT_CAPACITY;
  const t = (boat.boatType ?? "").trim().toLowerCase();
  if (t === "wake") {
    return `${displayName} — Cabo San Lucas sportfisher for up to ${guests} guests with captain and crew included.`;
  }
  if (t === "pontoon" || t === "tritoon") {
    return `${displayName} for up to ${guests} guests with captain and crew — ready for a Cabo San Lucas fishing charter.`;
  }
  return `${displayName} is Nasty Sport Fishing's Cabo San Lucas charter boat. Captain & crew included · up to ${guests} guests.`;
}

/**
 * Returns a description that always matches the boat's name. Uses stored description
 * only when it clearly refers to this boat; otherwise uses generated copy so the
 * title and verbiage stay correct (e.g. no "Bentley" text under "JC Neptoon Tritoon").
 */
export function getDisplayDescription(boat: BoatDisplayInput): string {
  const raw = boat.description?.trim();
  if (!raw) return generatedDescription(boat);
  if (descriptionMatchesBoat(boat.name, raw)) return raw;
  return generatedDescription(boat);
}
