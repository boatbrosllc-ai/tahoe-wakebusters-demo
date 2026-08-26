/** Convert marketplace HTML email to normalized text for deterministic parsing. Does not execute scripts. */

const BLOCK_BREAK_RE = /<\/(p|div|tr|li|h[1-6]|br|table|section|article|blockquote)>/gi;
const BR_RE = /<br\s*\/?>/gi;
const SCRIPT_STYLE_RE = /<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi;
const IMG_TRACKING_RE = /<img\b[^>]*>/gi;
const TAG_RE = /<\/?[^>]+>/g;
const BIDI_MARK_RE = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const WEIRD_SPACE_RE = /[\u00a0\u1680\u2000-\u200b\u202f\u205f\u3000\ufeff]/g;

export function stripEmailBidi(input: string): string {
  return input.replace(BIDI_MARK_RE, "");
}
const ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "-",
  ndash: "-",
  bull: "•",
  middot: "•",
};

function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const n = parseInt(hex, 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : "";
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const n = parseInt(dec, 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : "";
    })
    .replace(/&([a-z]+);/gi, (_, name: string) => ENTITY_MAP[name.toLowerCase()] ?? "");
}

export function htmlToNormalizedText(html: string): string {
  if (!html) return "";
  let s = stripEmailBidi(html.replace(WEIRD_SPACE_RE, " "));
  s = s.replace(SCRIPT_STYLE_RE, " ");
  s = s.replace(IMG_TRACKING_RE, " ");
  s = s.replace(BR_RE, "\n");
  s = s.replace(BLOCK_BREAK_RE, "\n");
  s = s.replace(/<hr\b[^>]*>/gi, "\n");
  s = s.replace(TAG_RE, " ");
  s = decodeEntities(s);
  s = stripEmailBidi(s.replace(WEIRD_SPACE_RE, " "));
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  s = s.replace(/[ \t]+\n/g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s.replace(/[ \t]{2,}/g, " ");
  return s.trim();
}

export function combineEmailBodies(text?: string, html?: string): string {
  const plain = stripEmailBidi((text ?? "").replace(WEIRD_SPACE_RE, " ")).trim();
  const fromHtml = html ? htmlToNormalizedText(html) : "";
  if (plain && fromHtml) {
    return plain.length >= fromHtml.length * 0.6 ? `${plain}\n\n${fromHtml}` : `${fromHtml}\n\n${plain}`;
  }
  return plain || fromHtml;
}

export function labeledValue(body: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*[:\\-]?\\s*([^\\n]+)`, "i");
  const m = body.match(re);
  const v = m?.[1]?.trim();
  return v ? v.replace(/\s+/g, " ") : undefined;
}
