import { labeledValue } from "./html-to-text";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PLACEHOLDER_RE = /^marketplace\+(boatsetter|getmyboat|viator)[-+@]/i;
const SKIP_DOMAINS = [
  "boatsetter.com",
  "getmyboat.com",
  "viator.com",
  "tripadvisor.com",
  "noreply.example.com",
];

function domainOf(email: string): string {
  return (email.split("@")[1] ?? "").trim().toLowerCase();
}

function isSkippedMarketplaceDomain(domain: string): boolean {
  return SKIP_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/** Internal ingest placeholder — not a guest mailbox. */
export function isSyntheticMarketplaceGuestEmail(email: string | null | undefined): boolean {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return false;
  if (e.endsWith("@noreply.example.com")) return true;
  return PLACEHOLDER_RE.test(e);
}

export function isUsableMarketplaceGuestEmail(email: string | null | undefined): boolean {
  const e = (email ?? "").trim();
  if (!EMAIL_RE.test(e)) return false;
  if (isSyntheticMarketplaceGuestEmail(e)) return false;
  const lower = e.toLowerCase();
  if (/^(noreply|no-reply|donotreply|do-not-reply|mailer-daemon)@/i.test(lower)) return false;
  return !isSkippedMarketplaceDomain(domainOf(lower));
}

export function displayMarketplaceGuestEmail(email: string | null | undefined): string {
  const trimmed = (email ?? "").trim();
  if (!trimmed || isSyntheticMarketplaceGuestEmail(trimmed)) return "";
  return trimmed;
}

/**
 * Guest mailbox from a marketplace owner email. Never returns Boatsetter/Getmyboat/Viator
 * sender addresses or the ingest placeholder.
 */
export function extractMarketplaceGuestEmail(body: string, html?: string): string | undefined {
  const labeled =
    labeledValue(body, "Email") ??
    labeledValue(body, "Guest email") ??
    labeledValue(body, "Guest Email") ??
    labeledValue(body, "Renter email") ??
    labeledValue(body, "Renter Email") ??
    labeledValue(body, "Customer email") ??
    labeledValue(body, "Traveler email") ??
    labeledValue(body, "Lead traveler email");
  const fromLabel = labeled?.match(EMAIL_RE)?.[0];
  if (fromLabel && isUsableMarketplaceGuestEmail(fromLabel)) return fromLabel.toLowerCase();

  const mailto = html?.match(/mailto:([^"'>\s?]+)/gi) ?? [];
  for (const raw of mailto) {
    const addr = decodeURIComponent(raw.replace(/^mailto:/i, "").split("?")[0] ?? "").trim();
    if (isUsableMarketplaceGuestEmail(addr)) return addr.toLowerCase();
  }
  return undefined;
}

/** Prefer a parsed guest email; keep a stored real email; never invent a placeholder. */
export function resolveMarketplaceGuestEmail(opts: {
  parsedEmail?: string | null;
  storedEmail?: string | null;
}): string {
  if (isUsableMarketplaceGuestEmail(opts.parsedEmail)) return opts.parsedEmail!.trim().toLowerCase();
  const stored = (opts.storedEmail ?? "").trim();
  if (stored && !isSyntheticMarketplaceGuestEmail(stored)) return stored;
  return "";
}
