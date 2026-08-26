import { labeledValue } from "./html-to-text";

const MAX_CENTS = 5_000_000;

/** Parse a dollar/USD string like `$464.62`, `USD 124.60`, or `1,234` into cents. */
export function moneyToCents(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.replace(/,/g, "").replace(/\u00a0/g, " ").trim();
  const m = s.match(/(?:usd\s*)?\$?\s*(-?\d+(?:\.\d{1,2})?)\s*(?:usd)?/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const cents = Math.round(n * 100);
  if (cents > MAX_CENTS) return null;
  const looksLikeYear = n >= 1900 && n <= 2100 && !m[1].includes(".");
  if (looksLikeYear && !/[\$]|usd/i.test(s)) return null;
  return cents;
}

const LABELS_PAYOUT = [
  "Your Payout",
  "Total Net Rate",
  "Net Rate",
  "Owner payout",
  "Owner Payout",
  "Payout",
  "You earn",
  "You'll earn",
  "You will earn",
  "You earned",
  "Earnings",
];

const LABELS_GROSS = [
  "Renter Payments",
  "Total Retail Price",
  "Retail Price",
  "Booking total",
  "Booking Total",
  "Booking Amount",
  "Amount paid",
  "Amount Paid",
  "Total amount",
  "Total Amount",
];

const SENTENCE_PAYOUT: RegExp[] = [
  /get ready to earn\s*(?:usd\s*)?\$?\s*([\d,]+(?:\.\d{1,2})?)/i,
  /you(?:'ll| will) earn\s*(?:usd\s*)?\$?\s*([\d,]+(?:\.\d{1,2})?)/i,
  /you earned\s*(?:usd\s*)?\$?\s*([\d,]+(?:\.\d{1,2})?)/i,
  /you earn\s*(?:usd\s*)?\$?\s*([\d,]+(?:\.\d{1,2})?)/i,
  /you(?:'ll| will) receive\s*(?:usd\s*)?\$?\s*([\d,]+(?:\.\d{1,2})?)/i,
  /your payout\s*[:\-]?\s*(?:usd\s*)?\$?\s*([\d,]+(?:\.\d{1,2})?)/i,
  /(?:total\s+)?(?:owner\s+)?payout\s*[:\-]?\s*(?:usd\s*)?\$?\s*([\d,]+(?:\.\d{1,2})?)/i,
  /total net(?:\s+rate)?\s*[:\-]?\s*(?:usd\s*)?\$?\s*([\d,]+(?:\.\d{1,2})?)/i,
  /net rate\s*[:\-]?\s*(?:usd\s*)?\$?\s*([\d,]+(?:\.\d{1,2})?)/i,
  /earnings\s*[:\-]?\s*(?:usd\s*)?\$?\s*([\d,]+(?:\.\d{1,2})?)/i,
];

const SENTENCE_GROSS: RegExp[] = [
  /renter payments\s*[:\-]?\s*(?:usd\s*)?\$?\s*([\d,]+(?:\.\d{1,2})?)/i,
  /(?:total\s+)?retail(?:\s+price)?\s*[:\-]?\s*(?:usd\s*)?\$?\s*([\d,]+(?:\.\d{1,2})?)/i,
  /booking (?:total|amount)\s*[:\-]?\s*(?:usd\s*)?\$?\s*([\d,]+(?:\.\d{1,2})?)/i,
  /amount (?:paid|received)\s*[:\-]?\s*(?:usd\s*)?\$?\s*([\d,]+(?:\.\d{1,2})?)/i,
];

function labeledOrNextLine(body: string, label: string): number | null {
  const sameLine = moneyToCents(labeledValue(body, label) ?? "");
  if (sameLine) return sameLine;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nextLine = body.match(
    new RegExp(
      `(?:^|\\n)\\s*${escaped}\\s*[:\\-]?\\s*\\n\\s*((?:USD\\s*)?\\$?\\s*[\\d,]+(?:\\.\\d{1,2})?(?:\\s*USD)?)`,
      "i"
    )
  );
  return moneyToCents(nextLine?.[1] ?? "");
}

function firstLabeled(body: string, labels: string[]): number | null {
  for (const label of labels) {
    const cents = labeledOrNextLine(body, label);
    if (cents) return cents;
  }
  return null;
}

function firstSentence(body: string, patterns: RegExp[]): number | null {
  for (const re of patterns) {
    const m = body.match(re);
    if (m) {
      const cents = moneyToCents(m[1]);
      if (cents) return cents;
    }
  }
  return null;
}

/**
 * Amount the operator actually receives when the email has a payout/net rate,
 * otherwise the guest/retail total. Null if the email has no usable price.
 */
export function extractMarketplaceAmountCents(body: string, preferLabels?: string[]): number | null {
  if (!body) return null;
  if (preferLabels?.length) {
    const preferred = firstLabeled(body, preferLabels);
    if (preferred) return preferred;
  }
  return (
    firstSentence(body, SENTENCE_PAYOUT) ??
    firstLabeled(body, LABELS_PAYOUT) ??
    firstSentence(body, SENTENCE_GROSS) ??
    firstLabeled(body, LABELS_GROSS)
  );
}

/** Guest-paid total when the email lists it separately from owner payout. */
export function extractMarketplaceGuestPaidCents(body: string): number | null {
  if (!body) return null;
  return firstLabeled(body, ["Renter Payments", "Total Retail Price", "Retail Price"]) ??
    firstSentence(body, SENTENCE_GROSS);
}

/** Payout from a parsed event or a stored booking's saved email fields. */
export function payoutCentsFromMarketplaceFields(input: {
  totalCents?: number | null;
  details?: Record<string, string> | null;
  excerpt?: string | null;
  notes?: string | null;
}): number | null {
  if (typeof input.totalCents === "number" && Number.isFinite(input.totalCents) && input.totalCents > 0) {
    return Math.floor(input.totalCents);
  }
  const details = input.details ?? {};
  const preferredValues = [
    details["Your Payout"],
    details["Net Rate"],
    details["Total Net Rate"],
    details.Earnings,
    details["You earn"],
    details["You earned"],
    details.Payout,
    details["Owner payout"],
  ];
  for (const raw of preferredValues) {
    const cents = moneyToCents(raw);
    if (cents) return cents;
  }
  const blob = [Object.values(details).join("\n"), input.excerpt ?? "", input.notes ?? ""].join("\n");
  return extractMarketplaceAmountCents(blob, ["Your Payout", "Net Rate", "Total Net Rate", "Payout", "You earn"]);
}
