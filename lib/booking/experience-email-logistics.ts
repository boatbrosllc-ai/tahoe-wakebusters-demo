/**
 * Per-experience customer logistics for confirmation and reminder emails.
 * Pickup comes from experience.location; fee/arrival/rules/gratuity from confirmationEmail.
 */

import type { Experience, ExperienceConfirmationEmail } from "./types";

export const DEFAULT_ARRIVAL_INSTRUCTIONS =
  "Please arrive 10–15 minutes before your scheduled departure time.";
export const DEFAULT_RULES_TEXT = "Glass and Styrofoam are not allowed on the lake.";
export const DEFAULT_GRATUITY_TEXT =
  "Captain gratuity is not included in the booking price and is always appreciated.";

/** Suggested copy for new experiences and for emails when confirmationEmail has not been saved yet. */
export const DEFAULT_CONFIRMATION_EMAIL: ExperienceConfirmationEmail = {
  arrivalInstructions: DEFAULT_ARRIVAL_INSTRUCTIONS,
  rulesText: DEFAULT_RULES_TEXT,
  gratuityText: DEFAULT_GRATUITY_TEXT,
};

const FALLBACK_MEETING_POINT = "We'll send exact meeting point after booking.";

function isPlaceholderMeetingPoint(value: string): boolean {
  const n = value.trim().toLowerCase();
  return n.includes("we'll send exact meeting") || n.includes("we will send exact meeting");
}

export interface ExperienceEmailLogistics {
  pickupTitle?: string;
  pickupAddress?: string;
  locationNotes?: string;
  entranceFeeText?: string;
  arrivalInstructions?: string;
  whatToBring: string[];
  rulesText?: string;
  gratuityText?: string;
  additionalNotes?: string;
}

function trimToUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t ? t : undefined;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
}

/** Parse admin/API payload into a confirmationEmail object (empty strings omitted). */
export function parseConfirmationEmail(raw: unknown): ExperienceConfirmationEmail {
  if (!raw || typeof raw !== "object") return {};
  const b = raw as Record<string, unknown>;
  const out: ExperienceConfirmationEmail = {};
  const entranceFeeText = trimToUndefined(b.entranceFeeText);
  const arrivalInstructions = trimToUndefined(b.arrivalInstructions);
  const rulesText = trimToUndefined(b.rulesText);
  const gratuityText = trimToUndefined(b.gratuityText);
  const additionalNotes = trimToUndefined(b.additionalNotes);
  if (entranceFeeText) out.entranceFeeText = entranceFeeText;
  if (arrivalInstructions) out.arrivalInstructions = arrivalInstructions;
  if (rulesText) out.rulesText = rulesText;
  if (gratuityText) out.gratuityText = gratuityText;
  if (additionalNotes) out.additionalNotes = additionalNotes;
  return out;
}

function listingRulesText(exp: Pick<Experience, "rules"> | null | undefined): string | undefined {
  const rules = stringList(exp?.rules);
  if (!rules.length) return undefined;
  return rules.join(". ");
}

/**
 * Resolve customer-facing logistics for the booked experience.
 * When `confirmationEmail` has never been saved, arrival/rules/gratuity use suggested defaults
 * (rules prefer listing `rules` when present). After staff save the object, empty fields stay hidden.
 * Entrance fee is never defaulted.
 */
export function logisticsFromExperience(
  exp: Pick<Experience, "location" | "whatToBring" | "rules" | "confirmationEmail"> | null | undefined
): ExperienceEmailLogistics {
  const loc = exp?.location;
  const ce = exp?.confirmationEmail;
  const configured = ce != null && typeof ce === "object";

  return {
    pickupTitle: trimToUndefined(loc?.title),
    pickupAddress: trimToUndefined(loc?.addressText),
    locationNotes: trimToUndefined(loc?.notes),
    entranceFeeText: configured ? trimToUndefined(ce.entranceFeeText) : undefined,
    arrivalInstructions: configured
      ? trimToUndefined(ce.arrivalInstructions)
      : DEFAULT_ARRIVAL_INSTRUCTIONS,
    whatToBring: stringList(exp?.whatToBring),
    rulesText: configured ? trimToUndefined(ce.rulesText) : listingRulesText(exp) ?? DEFAULT_RULES_TEXT,
    gratuityText: configured ? trimToUndefined(ce.gratuityText) : DEFAULT_GRATUITY_TEXT,
    additionalNotes: configured ? trimToUndefined(ce.additionalNotes) : undefined,
  };
}

export function locationTextFromLogistics(
  logistics: ExperienceEmailLogistics,
  fallback = FALLBACK_MEETING_POINT
): string {
  const parts = [logistics.pickupTitle, logistics.pickupAddress].filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0
  );
  return parts.length ? parts.join(" — ") : fallback;
}

/** Admin form values for per-experience confirmation/reminder copy. */
export interface ConfirmationCopyForm {
  locationTitle: string;
  locationAddress: string;
  locationNotes: string;
  entranceFeeText: string;
  arrivalInstructions: string;
  rulesText: string;
  gratuityText: string;
  additionalNotes: string;
  whatToBringText: string;
}

export function confirmationCopyFormFromExperience(api: {
  location?: { title?: unknown; addressText?: unknown; notes?: unknown } | null;
  confirmationEmail?: ExperienceConfirmationEmail | null;
  whatToBring?: unknown;
  rules?: unknown;
}): ConfirmationCopyForm {
  const loc = api.location ?? {};
  const ceRaw = api.confirmationEmail;
  const ceConfigured = ceRaw != null && typeof ceRaw === "object";
  const ce = ceConfigured ? ceRaw : {};
  const listingRules = stringList(api.rules);
  return {
    locationTitle: typeof loc.title === "string" ? loc.title : "",
    locationAddress: typeof loc.addressText === "string" ? loc.addressText : "",
    locationNotes: typeof loc.notes === "string" ? loc.notes : "",
    entranceFeeText: typeof ce.entranceFeeText === "string" ? ce.entranceFeeText : "",
    arrivalInstructions:
      typeof ce.arrivalInstructions === "string"
        ? ce.arrivalInstructions
        : ceConfigured
          ? ""
          : DEFAULT_ARRIVAL_INSTRUCTIONS,
    rulesText:
      typeof ce.rulesText === "string"
        ? ce.rulesText
        : ceConfigured
          ? ""
          : listingRules.length
            ? listingRules.join("\n")
            : DEFAULT_RULES_TEXT,
    gratuityText: typeof ce.gratuityText === "string" ? ce.gratuityText : ceConfigured ? "" : DEFAULT_GRATUITY_TEXT,
    additionalNotes: typeof ce.additionalNotes === "string" ? ce.additionalNotes : "",
    whatToBringText: stringList(api.whatToBring).join("\n"),
  };
}

/** Preview/save path: empty form fields are omitted from the email. */
export function logisticsFromCopyForm(form: ConfirmationCopyForm): ExperienceEmailLogistics {
  return {
    pickupTitle: trimToUndefined(form.locationTitle),
    pickupAddress: trimToUndefined(form.locationAddress),
    locationNotes: trimToUndefined(form.locationNotes),
    entranceFeeText: trimToUndefined(form.entranceFeeText),
    arrivalInstructions: trimToUndefined(form.arrivalInstructions),
    whatToBring: form.whatToBringText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    rulesText: trimToUndefined(form.rulesText),
    gratuityText: trimToUndefined(form.gratuityText),
    additionalNotes: trimToUndefined(form.additionalNotes),
  };
}

export function emailFieldsFromExperience(
  exp: Pick<Experience, "location" | "whatToBring" | "rules" | "confirmationEmail"> | null | undefined,
  fallbackLocationText = FALLBACK_MEETING_POINT
): { logistics: ExperienceEmailLogistics; locationText: string } {
  const logistics = logisticsFromExperience(exp);
  return { logistics, locationText: locationTextFromLogistics(logistics, fallbackLocationText) };
}

const PRIMARY = "#50bdba";
const DARK = "#001c30";
const MUTED = "#196a87";
const BG = "#f0fafb";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formattedMultiline(s: string): string {
  return escapeHtml(s).replace(/\r\n/g, "\n").replace(/\n/g, "<br>");
}

function sectionTable(title: string, inner: string): string {
  if (!inner.trim()) return "";
  return `
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: ${BG}; border-radius: 12px; margin: 0 0 24px; border: 1px solid rgba(0,28,48,0.08);">
                <tr>
                  <td style="padding: 20px 24px;">
                    <p style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: ${DARK};">${title}</p>
                    ${inner}
                  </td>
                </tr>
              </table>`;
}

function detailLine(label: string, value: string | undefined, multiline = false): string {
  const v = value?.trim() ?? "";
  if (!v) return "";
  const body = multiline ? formattedMultiline(v) : escapeHtml(v);
  return `<p style="margin: 0 0 8px; font-size: 13px; color: ${MUTED}; line-height: 1.5;"><strong style="color: ${DARK};">${escapeHtml(label)}:</strong> ${body}</p>`;
}

export function renderPickupSectionHtml(logistics: ExperienceEmailLogistics): string {
  const inner = [
    detailLine("Pickup location", logistics.pickupTitle),
    detailLine("Address", logistics.pickupAddress),
    renderLogisticsMapLinkHtml(logistics),
    detailLine("Entrance / parking fee", logistics.entranceFeeText, true),
    detailLine("Notes", logistics.locationNotes, true),
  ].join("");
  return inner ? sectionTable("Pickup information", inner) : "";
}

export function renderBeforeYouGoSectionHtml(logistics: ExperienceEmailLogistics): string {
  const items: string[] = [];
  if (logistics.arrivalInstructions?.trim()) {
    items.push(
      `<p style="margin: 0 0 8px; font-size: 13px; color: ${MUTED}; line-height: 1.5;">${formattedMultiline(logistics.arrivalInstructions)}</p>`
    );
  }
  if (logistics.rulesText?.trim()) {
    items.push(detailLine("Please remember", logistics.rulesText, true));
  }
  if (logistics.whatToBring.length) {
    const list = logistics.whatToBring.map((item) => `<li style="margin: 4px 0;">${escapeHtml(item)}</li>`).join("");
    items.push(
      `<p style="margin: 12px 0 6px; font-size: 13px; font-weight: 600; color: ${DARK};">What to bring</p><ul style="margin: 0 0 8px; padding-left: 20px; font-size: 13px; color: ${MUTED}; line-height: 1.6;">${list}</ul>`
    );
  }
  if (logistics.gratuityText?.trim()) {
    items.push(detailLine("Captain gratuity", logistics.gratuityText, true));
  }
  if (logistics.additionalNotes?.trim()) {
    items.push(
      `<p style="margin: 8px 0 0; font-size: 13px; color: ${MUTED}; line-height: 1.5;">${formattedMultiline(logistics.additionalNotes)}</p>`
    );
  }
  return items.length ? sectionTable("Before you go", items.join("")) : "";
}

export function renderEmailLogisticsHtml(logistics: ExperienceEmailLogistics): string {
  return `${renderPickupSectionHtml(logistics)}${renderBeforeYouGoSectionHtml(logistics)}`;
}

/** Optional map link when an address is present. */
export function logisticsMapUrl(logistics: ExperienceEmailLogistics): string | null {
  const address = logistics.pickupAddress?.trim() || logistics.pickupTitle?.trim();
  if (!address || isPlaceholderMeetingPoint(address)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function renderLogisticsMapLinkHtml(logistics: ExperienceEmailLogistics): string {
  const href = logisticsMapUrl(logistics);
  if (!href) return "";
  return `<p style="margin: 0 0 8px;"><a href="${escapeHtml(href)}" target="_blank" rel="noopener" style="color: ${PRIMARY}; font-weight: 600;">View on map / Get directions</a></p>`;
}
