/**
 * Shared Google tag ID parser used by runtime and build/deploy checks.
 * Accepts common Google tag identifier families (case-insensitive):
 * - G-...   (GA4 measurement ID)
 * - GT-...  (Google tag)
 * - AW-...  (Google Ads)
 * - DC-...  (Floodlight)
 */
const GOOGLE_TAG_ID_REGEX = /^(G|GT|AW|DC)-[A-Z0-9]{4,32}$/i;

function stripSurroundingQuotes(input) {
  let text = String(input ?? "").trim();
  for (let i = 0; i < 3; i += 1) {
    const len = text.length;
    if (len < 2) break;
    const a = text[0];
    const b = text[len - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) {
      text = text.slice(1, -1).trim();
      continue;
    }
    break;
  }
  return text;
}

function parseGoogleTagId(rawValue) {
  if (rawValue === undefined) {
    return { kind: "unset", normalized: null, raw: undefined };
  }

  const stripped = stripSurroundingQuotes(rawValue);
  if (stripped === "") {
    return { kind: "empty", normalized: null, raw: stripped };
  }

  if (stripped.toLowerCase() === "off" || stripped === "0") {
    return { kind: "disabled", normalized: null, raw: stripped };
  }

  if (!GOOGLE_TAG_ID_REGEX.test(stripped)) {
    return { kind: "malformed", normalized: null, raw: stripped };
  }

  return { kind: "valid", normalized: stripped.toUpperCase(), raw: stripped };
}

function isValidGoogleTagId(value) {
  return parseGoogleTagId(value).kind === "valid";
}

module.exports = {
  GOOGLE_TAG_ID_REGEX,
  stripSurroundingQuotes,
  parseGoogleTagId,
  isValidGoogleTagId,
};
