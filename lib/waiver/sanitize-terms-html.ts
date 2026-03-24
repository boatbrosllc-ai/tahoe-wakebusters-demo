/**
 * Shared allowlist for waiver template HTML (client + server).
 */

import DOMPurify from "isomorphic-dompurify";

const SANITIZE: Parameters<typeof DOMPurify.sanitize>[1] = {
  ALLOWED_TAGS: ["p", "ul", "ol", "li", "br", "b", "strong", "em", "i", "h1", "h2", "h3", "a", "div", "span", "blockquote"],
  ALLOWED_ATTR: ["href", "class", "id", "target", "rel", "title"],
  ALLOW_DATA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
};

/** Strips scripts, event handlers, and disallowed tags/attributes. */
export function sanitizeTermsHtml(html: string): string {
  return DOMPurify.sanitize(html ?? "", SANITIZE);
}
