/**
 * Verified public contact / NAP helpers for UI + JSON-LD.
 * Never invent phone, street, ZIP, hours, or geo — omit until confirmed.
 */

import { brand } from "@/content/brand";

const PLACEHOLDER_PHONE_DISPLAY = new Set([
  "(555) 000-0000",
  "555-000-0000",
  "5550000000",
  "000-0000",
]);

const PLACEHOLDER_PHONE_TEL = new Set(["+15550000000", "15550000000", "+1555000000"]);

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** True when a display/tel string is a known placeholder or empty. */
export function isPlaceholderPhone(displayOrTel: string | null | undefined): boolean {
  const raw = (displayOrTel ?? "").trim();
  if (!raw) return true;
  if (PLACEHOLDER_PHONE_DISPLAY.has(raw) || PLACEHOLDER_PHONE_TEL.has(raw)) return true;
  const digits = digitsOnly(raw);
  // US 555 exchange (including +1 555 …) is reserved for fiction
  if (/^1?555\d{7}$/.test(digits)) return true;
  return false;
}

export type PublicPhone = { display: string; tel: string };

/** Public click-to-call phone only when verified (non-placeholder). */
export function getPublicPhone(): PublicPhone | null {
  const display = (brand.phone ?? "").trim();
  const tel = (brand.phoneTel ?? "").trim();
  if (!display && !tel) return null;
  if (isPlaceholderPhone(display) || isPlaceholderPhone(tel)) return null;
  if (!tel) return null;
  return { display: display || tel, tel };
}

/** City / region for UI — omit country when it's US so labels read "South Lake Tahoe, CA". */
export function getPublicAreaLabel(): string {
  const city = brand.address.city?.trim() || "";
  const state = brand.address.state?.trim() || "";
  const country = brand.address.country?.trim() || "";
  if (!country || country === "US" || country === "USA") {
    return [city, state].filter(Boolean).join(", ");
  }
  return [city, state, country].filter(Boolean).join(", ");
}

/**
 * Meet-up area note for customers (not streetAddress schema).
 * Slip / dock details stay in post-booking confirmation.
 */
export function getMarinaMeetNote(): string {
  return brand.marinaMeetNote?.trim() || "We'll send exact meet-up details after booking.";
}

/** Verified street line for UI/schema — null when unset or placeholder marina-only line used as street. */
export function getVerifiedStreetAddress(): string | null {
  const line1 = (brand.address.line1 ?? "").trim();
  if (!line1) return null;
  // "Marina Cabo San Lucas" alone is an area note, not a verified street/slip NAP.
  if (/^marina\s+cabo\s+san\s+lucas$/i.test(line1)) return null;
  return line1;
}

export function getVerifiedPostalCode(): string | null {
  const zip = (brand.address.zip ?? "").trim();
  return zip || null;
}

export function getVerifiedHours(): string | null {
  const hours = (brand.hours ?? "").trim();
  return hours || null;
}

/** Social profile URLs that are real profile pages (not bare network homepages). */
export function getVerifiedSameAs(): string[] {
  const candidates = [
    brand.socials.instagram,
    brand.socials.facebook,
    brand.socials.tiktok,
    brand.socials.yelp,
    brand.socials.tripadvisor,
  ];
  const out: string[] = [];
  for (const url of candidates) {
    const u = (url ?? "").trim();
    if (!u) continue;
    try {
      const parsed = new URL(u);
      // Bare domain roots are not business profiles
      if (parsed.pathname === "/" || parsed.pathname === "") continue;
      out.push(u);
    } catch {
      // skip invalid
    }
  }
  return out;
}

export type LocalBusinessJsonLdInput = {
  baseUrl: string;
  description: string;
  aggregateRating?: Record<string, unknown>;
};

/**
 * Truthful LocalBusiness JSON-LD for commercial pages.
 * Omits telephone, streetAddress, postalCode, openingHours, geo, sameAs when unverified.
 */
export function buildLocalBusinessJsonLd(input: LocalBusinessJsonLdInput): Record<string, unknown> {
  const phone = getPublicPhone();
  const street = getVerifiedStreetAddress();
  const postalCode = getVerifiedPostalCode();
  const sameAs = getVerifiedSameAs();

  const address: Record<string, unknown> = {
    "@type": "PostalAddress",
    addressLocality: brand.address.city?.trim() || "",
    addressRegion: brand.address.state?.trim() || "",
    addressCountry: brand.country,
  };
  if (street) address.streetAddress = street;
  if (postalCode) address.postalCode = postalCode;

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: brand.companyName,
    description: input.description,
    url: input.baseUrl.replace(/\/+$/, ""),
    email: brand.email,
    address,
    areaServed: (brand.address.city ? [{ "@type": "Place", name: brand.address.city }] : []).concat(
      brand.address.state ? [{ "@type": "Place", name: brand.address.state }] : []
    ),
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: `${brand.companyName} trips`,
      itemListElement: [
        { "@type": "Offer", itemOffered: { "@type": "Service", name: brand.catalog.halfDay.title } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: brand.catalog.fullDay.title } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: brand.catalog.allIn.title } },
      ],
    },
  };

  if (phone) jsonLd.telephone = phone.tel;
  if (input.aggregateRating) jsonLd.aggregateRating = input.aggregateRating;
  if (sameAs.length > 0) jsonLd.sameAs = sameAs;

  return jsonLd;
}
