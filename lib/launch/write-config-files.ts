import fs from "fs/promises";
import path from "path";
import type { SiteConfig } from "@/config/site-types";
import type { CustomerPlatformConfig } from "@/lib/launch/customer-platform-config.schema";
import { formatTsNumber, formatTsValue } from "@/lib/launch/format-ts";

const SITE_TS_FOOTER = `
assertCustomerConfigForDeploy(siteConfig);

/** Public site origin. Production requires NEXT_PUBLIC_SITE_URL or APP_BASE_URL. */
export function getSiteBaseUrl(): string {
  const fromEnv = requireProductionSiteUrl();
  if (fromEnv) return fromEnv;
  return \`https://\${siteConfig.company.domain}\`.replace(/\\/+$/, "");
}

export function getNoreplyEmail(): string {
  return process.env.BREVO_SENDER_EMAIL?.trim() || \`noreply@\${siteConfig.company.domain}\`;
}

export function getSenderName(): string {
  return process.env.BREVO_SENDER_NAME?.trim() || siteConfig.company.name;
}

export function getContactEmail(): string {
  return process.env.CONTACT_EMAIL?.trim() || siteConfig.contact.email;
}

export function emailSubjectSuffix(): string {
  return \` – \${siteConfig.company.name}\`;
}

/** Dev identity bar. Off in production unless explicitly enabled. */
export function isPlatformDevBannerEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_SHOW_PLATFORM_BANNER === "0") return false;
  if (process.env.NEXT_PUBLIC_SHOW_PLATFORM_BANNER === "1") return true;
  return process.env.NODE_ENV !== "production";
}

/** Inline CSS variables so Tailwind \`brand.*\` tokens follow this customer theme. */
export function siteThemeCssVars(): Record<string, string> {
  const t = siteConfig.theme;
  return {
    "--brand-primary": t.primaryColor,
    "--brand-secondary": t.secondaryColor,
    "--brand-accent": t.accentColor,
    "--brand-dark": t.darkColor,
    "--brand-muted": t.mutedColor,
    "--brand-bg": t.backgroundColor,
    "--brand-text": t.textColor,
    "--brand-silver": t.silverColor,
    "--brand-radius": t.borderRadius,
  };
}
`;

function siteTsHeader(): string {
  return `/**
 * Customer configuration — generated from Slipstack.io launch packet.
 * Re-run \`npm run import:launch-packet\` to refresh from an updated packet.
 *
 * Runtime secrets (Firebase, Stripe, email, public URL) stay in environment variables.
 */

import type { SiteConfig } from "@/config/site-types";
import {
  assertCustomerConfigForDeploy,
  requireProductionSiteUrl,
} from "@/config/assert-production-config";

export type { SiteConfig } from "@/config/site-types";
export { TEMPLATE_PLACEHOLDER } from "@/config/site-types";

export const siteConfig: SiteConfig = `;
}

function inferPricingFromExperiences(packet: CustomerPlatformConfig) {
  const half = packet.experiences.find((e) => e.slug === "half-day");
  const full = packet.experiences.find((e) => e.slug === "full-day");
  const halfRate = half?.rates.find((r) => r.active !== false) ?? half?.rates[0];
  const fullRate = full?.rates.find((r) => r.active !== false) ?? full?.rates[0];
  const pricing = packet.pricing ?? {};
  return {
    foundingActive: pricing.foundingRateActive ?? false,
    foundingLabel: pricing.foundingLabel ?? "LAUNCH RATE",
    standardHalf: pricing.standardRates?.halfDayCents ?? halfRate?.priceCents ?? 50_000,
    standardFull: pricing.standardRates?.fullDayCents ?? fullRate?.priceCents ?? 80_000,
    foundingHalf: pricing.foundingRates?.halfDayCents ?? pricing.standardRates?.halfDayCents ?? halfRate?.priceCents ?? 50_000,
    foundingFull: pricing.foundingRates?.fullDayCents ?? pricing.standardRates?.fullDayCents ?? fullRate?.priceCents ?? 80_000,
    peakFull: pricing.standardRates?.peakFullDayCents ?? fullRate?.priceHolidayCents ?? fullRate?.priceCents ?? 100_000,
    extensionHour: pricing.extensionHourCents ?? 10_000,
    included: pricing.includedItems ?? ["Private boat", "Captain and crew", "Life jackets", "Water"],
  };
}

function catalogPricingTs(packet: CustomerPlatformConfig): string {
  const p = inferPricingFromExperiences(packet);
  return `/**
 * Catalog pricing — generated from Slipstack.io launch packet.
 * Charged amounts still flow through Firestore rates → create-hold → computePricing.
 */

export type CharterKind = "half" | "full";

export const FOUNDING_ANGLER_RATE_ACTIVE = ${p.foundingActive};

export const FOUNDING_ANGLER_LABEL = ${JSON.stringify(p.foundingLabel)};

export const STANDARD_RATE_CENTS: Record<CharterKind, number> = {
  half: ${formatTsNumber(p.standardHalf)},
  full: ${formatTsNumber(p.standardFull)},
};

export const FOUNDING_RATE_CENTS: Record<CharterKind, number> = {
  half: ${formatTsNumber(p.foundingHalf)},
  full: ${formatTsNumber(p.foundingFull)},
};

export const PEAK_FULL_DAY_CENTS = ${formatTsNumber(p.peakFull)};

export function getActiveCatalogRateCents(kind: CharterKind): number {
  return FOUNDING_ANGLER_RATE_ACTIVE ? FOUNDING_RATE_CENTS[kind] : STANDARD_RATE_CENTS[kind];
}

export function formatUsdFromCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export const CHARTER_INCLUDED: string[] = ${formatTsValue(p.included)};
`;
}

function upsellsTs(packet: CustomerPlatformConfig): string {
  const lines = packet.addons.map((addon) => {
    const usd = addon.priceCents / 100;
    const suggested =
      addon.type === "quantity"
        ? `{ kind: "fixed" as const, usd: ${usd}, label: "$${usd}" }`
        : `{ kind: "fixed" as const, usd: ${usd}, label: "$${usd}" }`;
    return `  {
    catalogKey: ${JSON.stringify(addon.catalogKey)},
    name: ${JSON.stringify(addon.name)},
    howItWorks: ${JSON.stringify(addon.description ?? addon.name)},
    suggestedPrice: ${suggested},
    seedPriceCents: ${formatTsNumber(addon.priceCents)},
    seedType: ${JSON.stringify(addon.type === "tip" ? "toggle" : addon.type)},
    ${addon.maxQty != null ? `maxQty: ${addon.maxQty},` : ""}
    bookable: ${addon.bookable !== false},
    ${addon.partnerFulfilled ? "partnerFulfilled: true," : ""}
    ${addon.highlight ? "highlight: true," : ""}
  }`;
  });

  return `/**
 * Charter upsell catalog — generated from Slipstack.io launch packet.
 */

export type UpsellSuggestedPrice =
  | { kind: "fixed"; usd: number; label: string }
  | { kind: "from"; usd: number; label: string }
  | { kind: "range"; lowUsd: number; highUsd: number; label: string }
  | { kind: "per_lb_range"; lowUsd: number; highUsd: number; label: string };

export type UpsellDefinition = {
  catalogKey: string;
  name: string;
  howItWorks: string;
  suggestedPrice: UpsellSuggestedPrice;
  seedPriceCents: number;
  seedType: "toggle" | "quantity";
  maxQty?: number;
  bookable: boolean;
  partnerFulfilled?: boolean;
  highlight?: boolean;
};

export const CHARTER_UPSELLS: UpsellDefinition[] = [
${lines.join(",\n")}
];

export function formatUpsellPrice(price: UpsellSuggestedPrice): string {
  return price.label;
}

export function bookableUpsellKeys(): string[] {
  return CHARTER_UPSELLS.filter((u) => u.bookable).map((u) => u.catalogKey);
}
`;
}

function launchBoatTs(packet: CustomerPlatformConfig, siteConfig: SiteConfig): string {
  const boat = packet.boats[0];
  const description =
    boat.description?.trim() ||
    `${boat.name} is ${siteConfig.company.name}'s primary vessel — captain and crew included on every trip.`;
  return `import { brand } from "@/content/brand";
import { siteConfig } from "@/config/site";
import { DEFAULT_CANCELLATION_POLICY } from "@/lib/booking/cancellation-policy";
/**
 * Launch fleet — generated from Slipstack.io launch packet.
 */

export const LAUNCH_BOAT = {
  name: ${JSON.stringify(boat.name)},
  slug: ${JSON.stringify(boat.slug)},
  previousNames: ${formatTsValue(boat.previousNames ?? [])} as const,
  previousSlugs: ${formatTsValue(boat.previousSlugs ?? [])} as const,
  year: 2020,
  model: "Charter",
  make: "Custom",
  heroSubtitle: ${JSON.stringify(boat.heroSubtitle ?? "Captain & crew included")},
  capacity: ${boat.capacity},
  timezone: brand.timezone,
  capacityMax: ${boat.capacity},
  petsMax: ${boat.petsMax ?? 0},
  defaultLocationText: siteConfig.contact.marinaMeetNote,
  cancellationPolicyText: DEFAULT_CANCELLATION_POLICY,
  photos: ${formatTsValue(boat.photos)} as string[],
  description: ${JSON.stringify(description)},
} as const;

export const OUR_BOAT_PATH = \`/boats/\${LAUNCH_BOAT.slug}\` as const;
`;
}

export type WriteConfigFilesResult = {
  written: string[];
};

export async function writeConfigFiles(
  rootDir: string,
  packet: CustomerPlatformConfig,
  siteConfig: SiteConfig,
): Promise<WriteConfigFilesResult> {
  const written: string[] = [];

  const sitePath = path.join(rootDir, "config", "site.ts");
  await fs.writeFile(sitePath, `${siteTsHeader()}${formatTsValue(siteConfig)};${SITE_TS_FOOTER}`, "utf8");
  written.push(sitePath);

  const catalogPath = path.join(rootDir, "content", "catalog-pricing.ts");
  await fs.writeFile(catalogPath, catalogPricingTs(packet), "utf8");
  written.push(catalogPath);

  const upsellsPath = path.join(rootDir, "content", "upsells.ts");
  await fs.writeFile(upsellsPath, upsellsTs(packet), "utf8");
  written.push(upsellsPath);

  const launchBoatPath = path.join(rootDir, "content", "launch-boat.ts");
  await fs.writeFile(launchBoatPath, launchBoatTs(packet, siteConfig), "utf8");
  written.push(launchBoatPath);

  const packetArchivePath = path.join(rootDir, "config", "launch-packet.json");
  await fs.writeFile(packetArchivePath, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
  written.push(packetArchivePath);

  return { written };
}
