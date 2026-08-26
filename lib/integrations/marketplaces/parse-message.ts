import { detectMarketplaceProvider } from "./detector";
import { parseBoatsetterMessage } from "./boatsetter/parse";
import { parseGetmyboatMessage } from "./getmyboat/parse";
import { parseViatorMessage } from "./viator/parse";
import type { GmailMessageInput, ParseResult } from "./types";

export function parseMarketplaceMessage(input: GmailMessageInput): ParseResult {
  const detected = detectMarketplaceProvider(input);
  if (!detected.provider) {
    return { ok: false, status: "unsupported_sender", error: detected.reason };
  }
  if (detected.provider === "boatsetter") return parseBoatsetterMessage(input);
  if (detected.provider === "getmyboat") return parseGetmyboatMessage(input);
  return parseViatorMessage(input);
}
