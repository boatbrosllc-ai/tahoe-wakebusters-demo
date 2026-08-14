#!/usr/bin/env node
/**
 * Create a customer app folder from a slipstack.io launch packet.
 *
 * Usage:
 *   node scripts/new-customer.mjs path/to/launch-packet.json
 *   node scripts/new-customer.mjs --root . path/to/launch-packet.json
 */
const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  let root = process.cwd();
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root") {
      root = argv[++i];
      continue;
    }
    positional.push(argv[i]);
  }
  return { root: path.resolve(root), packetPath: positional[0] };
}

function siteIdToExportName(siteId) {
  const camel = siteId.replace(/-([a-z0-9])/g, (_, ch) => ch.toUpperCase());
  return `${camel}Config`;
}

function tsString(value) {
  return JSON.stringify(value == null ? "" : String(value));
}

function firstHexColor(raw, fallback) {
  const match = String(raw || "").match(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/);
  return match ? match[0] : fallback;
}

function phoneTel(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return "";
}

function renderConfig(packet) {
  const siteId = packet.siteId;
  const exportName = siteIdToExportName(siteId);
  const biz = packet.business || {};
  const contact = packet.contact || {};
  const branding = packet.branding || {};
  const domainCfg = packet.domain || {};
  const trips = Array.isArray(packet.experiences) ? packet.experiences : [];
  const name = biz.guestFacingName || "Boat Rentals";
  const domain = domainCfg.asciiHostname || `${siteId}.netlify.app`;
  const email = contact.publicEmail || `hello@${domain}`;
  const phone = contact.publicPhone || "";
  const tel = phoneTel(phone);
  const primary = firstHexColor(branding.brandColors, "#14b6dc");
  const timezone = packet.timezone || packet.schedule?.timezone || "America/Chicago";
  const half = trips[0];
  const full = trips[1] || trips[0];
  const logo = `/sites/${siteId}/logo.svg`;
  const city = String(biz.cityHarbor || "").split(",")[0].trim();

  return `import type { SiteConfig } from "@/config/site-types";

/** Generated from slipstack.io launch packet. Admins customize this folder for branding. */
export const ${exportName}: SiteConfig = {
  tenantId: ${tsString(siteId)} as SiteConfig["tenantId"],
  environment: "production",
  company: {
    name: ${tsString(name)},
    shortName: ${tsString(name)},
    legalName: ${tsString(biz.legalName || name)},
    publicName: ${tsString(name)},
    tagline: ${tsString(biz.tagline || "Private boat rentals — book your trip online.")},
    domain: ${tsString(domain)},
  },
  contact: {
    email: ${tsString(email)},
    phone: ${tsString(phone)},
    phoneTel: ${tsString(tel)},
    sms: ${tsString(contact.smsNumber || "")},
    address: { line1: ${tsString(biz.address || "")}, city: ${tsString(city)}, state: "", zip: "", country: "US" },
    hours: "",
    marinaMeetNote: ${tsString(biz.marinaDock || "We'll send dock and check-in details after you book.")},
    hoursNote: "Trips depart by reservation. We'll confirm meet-up time when you book.",
    googleMapsPlaceUrl: "",
    mapEmbedSrc: "",
    geo: null,
    areaServed: [${tsString(biz.cityHarbor || city || "Local waterways")}],
  },
  branding: {
    logo: ${tsString(logo)}, logoDesktop: ${tsString(logo)}, logoMonogram: ${tsString(logo)},
    logoNavbar: ${tsString(logo)}, logoHover: ${tsString(logo)}, logoDark: ${tsString(logo)},
    logoEmail: ${tsString(logo)}, logoHero: ${tsString(logo)}, logoHeroHover: ${tsString(logo)},
    logoAlt: ${tsString(name)}, favicon: ${tsString(logo)},
  },
  theme: {
    primaryColor: ${tsString(primary)}, secondaryColor: "#f27a0a", accentColor: "#f27a0a",
    darkColor: "#04244a", mutedColor: "#1a5a7a", backgroundColor: "#e8f6fa",
    textColor: "#04244a", silverColor: "#d5dbe1", borderRadius: "1rem", fontDisplay: "Syne",
  },
  social: {
    instagram: ${tsString(branding.instagram || "")}, facebook: ${tsString(branding.facebook || "")},
    youtube: "", tiktok: "", yelp: "", tripadvisor: "",
  },
  seo: {
    title: ${tsString(`${name} | Private Boat Rentals`)},
    description: ${tsString(biz.description || biz.tagline || "Private boat rentals. Book your trip online.")},
    defaultOgImage: "/photos/stock/charter/fishing-boat-sunset.jpg",
    defaultOgImageAlt: ${tsString(`${name} boat rental`)},
    keywords: ["boat rentals", ${tsString(name.toLowerCase())}],
    blogName: "Blog",
  },
  media: {
    hero: "/photos/stock/charter/fishing-boat-sunset.jpg",
    welcome: "/photos/stock/charter/yachts-at-dock.jpg",
    boats: "/photos/stock/charter/yacht-sailing-cabo-pexels.jpg",
    galleryFallback: "/photos/stock/charter/blue-fishing-boat-ocean-pexels.jpg",
    listingFallback: "/photos/stock/charter/yachts-at-dock.jpg",
  },
  catalog: {
    halfDay: {
      title: ${tsString(half?.name || "Half Day")},
      durationLabel: ${tsString(half?.durationMinutes ? `${Math.round(half.durationMinutes / 60)} Hours` : "5 Hours")},
      ctaLabel: ${tsString(`Book ${half?.name || "Half Day"}`)},
    },
    fullDay: {
      title: ${tsString(full?.name || "Full Day")},
      durationLabel: ${tsString(full?.durationMinutes ? `${Math.round(full.durationMinutes / 60)} Hours` : "8 Hours")},
      ctaLabel: ${tsString(`Book ${full?.name || "Full Day"}`)},
    },
    allIn: { title: "All-In", ctaLabel: "Book All-In" },
  },
  nav: { blogLabel: "Blog", experiencesLabel: "Trips", packagesLabel: "Packages", boatLabel: "Our Boat" },
  business: {
    timezone: ${tsString(timezone)}, currency: "USD", country: "US", locale: "en-US", taxRate: 0.0825,
    legal: { governingLaw: "Texas", venue: "the state of Texas" },
  },
  booking: { path: "/booking", mode: "link", providerUrl: "", embedSrc: "" },
  features: { googleAuth: true, paypal: false, giftCards: false, smsReminders: false, customerSiteLayer: "sites" },
  phone: ${tsString(phone)},
  phoneTel: ${tsString(tel)},
  sms: ${tsString(contact.smsNumber || "")},
};
`;
}

function patchSiteIds(source, siteId) {
  if (source.includes(`"${siteId}"`)) return source;
  return source.replace(
    /export const SITE_IDS = \[([^\]]*)\] as const;/,
    (_m, inner) => `export const SITE_IDS = [${inner.trim().replace(/,$/, "")}, "${siteId}"] as const;`
  );
}

function patchResolve(source, siteId) {
  if (source.includes(`"${siteId}"`)) return source;
  const exportName = siteIdToExportName(siteId);
  const importLine = `import { ${exportName} } from "@/sites/${siteId}/config";\n`;
  let next = source.includes(importLine.trim()) ? source : source.replace(
    /(import \{ platformDevConfig \} from "@\/sites\/platform-dev\/config";\n)/,
    `$1${importLine}`
  );
  return next.replace(
    /(export const SITE_REGISTRY: Record<SiteId, SiteConfig> = \{)([\s\S]*?)(\n\};)/,
    (_m, start, body, end) => `${start}${body.replace(/\n$/, "")}\n  "${siteId}": ${exportName},\n${end}`
  );
}

function patchPages(source, siteId) {
  if (source.includes(`"${siteId}"`)) return source;
  return source.replace(
    /(const PAGES: Record<SiteId, SitePages> = \{)([\s\S]*?)(\n\};)/,
    (_m, start, body, end) =>
      `${start}${body.replace(/\n$/, "")}\n  "${siteId}": {\n    HomePage: PlatformDevHomePage,\n    AboutPage: null,\n  },${end}`
  );
}

function patchChrome(source, siteId) {
  if (source.includes(`"${siteId}"`)) return source;
  return source.replace(
    /(const HEADERS: Record<SiteId, SiteHeader> = \{)([\s\S]*?)(\n\};)/,
    (_m, start, body, end) => `${start}${body.replace(/\n$/, "")}\n  "${siteId}": DefaultHeader,${end}`
  );
}

function writeIfChanged(filePath, content) {
  const prev = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null;
  if (prev === content) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return true;
}

function main() {
  const { root, packetPath } = parseArgs(process.argv.slice(2));
  if (!packetPath) {
    console.error("Usage: node scripts/new-customer.mjs [--root dir] launch-packet.json");
    process.exit(1);
  }
  const packet = JSON.parse(fs.readFileSync(path.resolve(packetPath), "utf8"));
  const siteId = String(packet.siteId || "").trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(siteId) || siteId === "platform-dev") {
    console.error("launch packet needs a kebab-case siteId");
    process.exit(1);
  }
  const dir = path.join(root, "sites", siteId);
  writeIfChanged(path.join(dir, "config.ts"), renderConfig(packet));
  writeIfChanged(path.join(dir, "launch-packet.json"), `${JSON.stringify(packet, null, 2)}\n`);
  const files = [
    ["config/site-types.ts", (s) => patchSiteIds(s, siteId)],
    ["config/resolve-site.ts", (s) => patchResolve(s, siteId)],
    ["lib/site/pages.ts", (s) => patchPages(s, siteId)],
    ["lib/site/chrome.ts", (s) => patchChrome(s, siteId)],
  ];
  for (const [rel, patch] of files) {
    const full = path.join(root, rel);
    writeIfChanged(full, patch(fs.readFileSync(full, "utf8")));
  }
  console.log(`Created sites/${siteId}/ — default homepage. Designers can customize this folder.`);
}

module.exports = { renderConfig, patchSiteIds, siteIdToExportName };

if (require.main === module) {
  main();
}
