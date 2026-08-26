import { detectBoatsetter } from "./boatsetter/detect";
import { detectGetmyboat } from "./getmyboat/detect";
import { detectViator } from "./viator/detect";
import type { GmailMessageInput, ProviderDetection } from "./types";

export function detectMarketplaceProvider(input: GmailMessageInput): ProviderDetection {
  const boatsetter = detectBoatsetter(input);
  if (boatsetter) return boatsetter;
  const getmyboat = detectGetmyboat(input);
  if (getmyboat) return getmyboat;
  const viator = detectViator(input);
  if (viator) return viator;
  return { provider: null, reason: "unsupported_sender" };
}
