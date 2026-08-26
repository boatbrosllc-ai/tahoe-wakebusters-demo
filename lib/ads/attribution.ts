/**
 * First-party Google Ads / paid-click attribution stored on bookings and leads.
 * Captured from the landing URL (gclid / gbraid / wbraid / UTMs) and kept for 90 days.
 */

export const ADS_ATTRIBUTION_COOKIE = "ss_ads_attr";
export const ADS_ATTRIBUTION_MAX_AGE_SEC = 90 * 24 * 60 * 60;

/**
 * Paste as the Google Ads account-level Final URL suffix.
 * Google fills the {placeholders} on each click. `{_ad}` is optional (a nickname you can set on an ad).
 */
export const GOOGLE_ADS_FINAL_URL_SUFFIX =
  "utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={_ad}&utm_term={keyword}&adid={creative}&agid={adgroupid}&match={matchtype}&net={network}&dev={device}&place={placement}";

export type AdsChannel = "google_ads" | "other_paid";

export type AdsAttribution = {
  channel: AdsChannel;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  adId?: string;
  adGroupId?: string;
  matchType?: string;
  network?: string;
  device?: string;
  placement?: string;
  landingPath?: string;
  capturedAt?: string;
};

export type AdsAttributionDisplay = {
  campaign: string;
  ad: string | null;
  adGroup: string | null;
  keyword: string | null;
  matchType: string | null;
  network: string | null;
  device: string | null;
  placement: string | null;
  landingPath: string | null;
};

const CLICK_ID_RE = /^[A-Za-z0-9._-]{8,200}$/;
const ID_RE = /^[A-Za-z0-9._-]{1,40}$/;
const TOKEN_RE = /^[A-Za-z0-9._-]{1,32}$/;
const UTM_RE = /^[\w .:/?#@%+=&|,''()-]{1,200}$/i;
const PAID_MEDIUMS = new Set(["cpc", "ppc", "paid", "paidsearch", "paid-search"]);

const DEVICE_LABELS: Record<string, string> = {
  m: "Mobile",
  t: "Tablet",
  c: "Computer",
};

const NETWORK_LABELS: Record<string, string> = {
  g: "Google Search",
  s: "Search partners",
  d: "Display",
  y: "YouTube",
};

const MATCH_LABELS: Record<string, string> = {
  e: "Exact match",
  p: "Phrase match",
  b: "Broad match",
  a: "AI Max",
};

function cleanClickId(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.trim();
  return CLICK_ID_RE.test(v) ? v : undefined;
}

function cleanId(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.trim();
  return ID_RE.test(v) ? v : undefined;
}

function cleanToken(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.trim().toLowerCase();
  if (!v || /^\{[a-z0-9_]+\}$/i.test(v)) return undefined;
  return TOKEN_RE.test(v) ? v : undefined;
}

function cleanUtm(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.trim().slice(0, 200);
  if (!v || !UTM_RE.test(v)) return undefined;
  if (/^\{[a-z0-9_]+\}$/i.test(v)) return undefined;
  return v;
}

function cleanPath(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.trim().slice(0, 200);
  if (!v.startsWith("/")) return undefined;
  return v;
}

function firstDefined(...vals: unknown[]): unknown {
  return vals.find((v) => v != null && v !== "");
}

export function isGoogleAdsAttribution(attr: AdsAttribution | null | undefined): boolean {
  if (!attr) return false;
  if (attr.gclid || attr.gbraid || attr.wbraid) return true;
  const source = (attr.utmSource ?? "").toLowerCase();
  const medium = (attr.utmMedium ?? "").toLowerCase();
  return (source === "google" || source === "googleads" || source === "google_ads") && PAID_MEDIUMS.has(medium);
}

export function isPaidAdsAttribution(attr: AdsAttribution | null | undefined): boolean {
  if (!attr) return false;
  if (isGoogleAdsAttribution(attr)) return true;
  const medium = (attr.utmMedium ?? "").toLowerCase();
  return PAID_MEDIUMS.has(medium);
}

function channelFor(attr: Omit<AdsAttribution, "channel">): AdsChannel {
  const probe = { ...attr, channel: "other_paid" as const };
  return isGoogleAdsAttribution(probe) ? "google_ads" : "other_paid";
}

function assemble(partial: Omit<AdsAttribution, "channel">): AdsAttribution | null {
  if (!isPaidAdsAttribution({ ...partial, channel: "other_paid" })) return null;
  return { ...partial, channel: channelFor(partial) };
}

export function parseAdsAttributionFromSearchParams(
  params: URLSearchParams,
  landingPath?: string
): AdsAttribution | null {
  const gclid = cleanClickId(params.get("gclid"));
  const gbraid = cleanClickId(params.get("gbraid"));
  const wbraid = cleanClickId(params.get("wbraid"));
  const utmSource = cleanUtm(params.get("utm_source"));
  const utmMedium = cleanUtm(params.get("utm_medium"));
  const utmCampaign = cleanUtm(params.get("utm_campaign"));
  const utmContent = cleanUtm(params.get("utm_content"));
  const utmTerm = cleanUtm(params.get("utm_term"));
  const adId = cleanId(params.get("adid") ?? params.get("creative"));
  const adGroupId = cleanId(params.get("agid") ?? params.get("adgroupid"));
  const matchType = cleanToken(params.get("match") ?? params.get("matchtype"));
  const network = cleanToken(params.get("net") ?? params.get("network"));
  const device = cleanToken(params.get("dev") ?? params.get("device"));
  const placement = cleanUtm(params.get("place") ?? params.get("placement"));
  const path = cleanPath(landingPath);
  return assemble({
    ...(gclid ? { gclid } : {}),
    ...(gbraid ? { gbraid } : {}),
    ...(wbraid ? { wbraid } : {}),
    ...(utmSource ? { utmSource } : {}),
    ...(utmMedium ? { utmMedium } : {}),
    ...(utmCampaign ? { utmCampaign } : {}),
    ...(utmContent ? { utmContent } : {}),
    ...(utmTerm ? { utmTerm } : {}),
    ...(adId ? { adId } : {}),
    ...(adGroupId ? { adGroupId } : {}),
    ...(matchType ? { matchType } : {}),
    ...(network ? { network } : {}),
    ...(device ? { device } : {}),
    ...(placement ? { placement } : {}),
    ...(path ? { landingPath: path } : {}),
    capturedAt: new Date().toISOString(),
  });
}

export function parseAdsAttributionFromUnknown(raw: unknown): AdsAttribution | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const gclid = cleanClickId(o.gclid);
  const gbraid = cleanClickId(o.gbraid);
  const wbraid = cleanClickId(o.wbraid);
  const utmSource = cleanUtm(o.utmSource ?? o.utm_source);
  const utmMedium = cleanUtm(o.utmMedium ?? o.utm_medium);
  const utmCampaign = cleanUtm(o.utmCampaign ?? o.utm_campaign);
  const utmContent = cleanUtm(o.utmContent ?? o.utm_content);
  const utmTerm = cleanUtm(o.utmTerm ?? o.utm_term);
  const adId = cleanId(firstDefined(o.adId, o.adid, o.creative));
  const adGroupId = cleanId(firstDefined(o.adGroupId, o.agid, o.adgroupid));
  const matchType = cleanToken(firstDefined(o.matchType, o.match, o.matchtype));
  const network = cleanToken(firstDefined(o.network, o.net));
  const device = cleanToken(firstDefined(o.device, o.dev));
  const placement = cleanUtm(firstDefined(o.placement, o.place));
  const landingPath = cleanPath(o.landingPath ?? o.landing_path);
  const capturedAt = typeof o.capturedAt === "string" && o.capturedAt.length < 40 ? o.capturedAt : undefined;
  return assemble({
    ...(gclid ? { gclid } : {}),
    ...(gbraid ? { gbraid } : {}),
    ...(wbraid ? { wbraid } : {}),
    ...(utmSource ? { utmSource } : {}),
    ...(utmMedium ? { utmMedium } : {}),
    ...(utmCampaign ? { utmCampaign } : {}),
    ...(utmContent ? { utmContent } : {}),
    ...(utmTerm ? { utmTerm } : {}),
    ...(adId ? { adId } : {}),
    ...(adGroupId ? { adGroupId } : {}),
    ...(matchType ? { matchType } : {}),
    ...(network ? { network } : {}),
    ...(device ? { device } : {}),
    ...(placement ? { placement } : {}),
    ...(landingPath ? { landingPath } : {}),
    ...(capturedAt ? { capturedAt } : {}),
  });
}

export function adsAttributionLabel(attr: AdsAttribution | null | undefined): string {
  if (!attr) return "Not from ads";
  if (attr.utmCampaign) return attr.utmCampaign;
  if (attr.channel === "google_ads") return "Google Ads";
  return "Paid ads";
}

export function adsAttributionAdLabel(attr: AdsAttribution | null | undefined): string | null {
  if (!attr) return null;
  if (attr.utmContent) return attr.utmContent;
  if (attr.adId) return `Ad ${attr.adId}`;
  return null;
}

export function adsChannelLabel(channel: AdsChannel | string | null | undefined): string {
  if (channel === "google_ads") return "Google Ads";
  if (channel === "other_paid") return "Paid ads";
  return "Unknown";
}

function mappedLabel(map: Record<string, string>, raw: string | undefined): string | null {
  if (!raw) return null;
  return map[raw] ?? raw;
}

export function adsAttributionDisplay(attr: AdsAttribution | null | undefined): AdsAttributionDisplay {
  if (!attr) {
    return {
      campaign: "Not from ads",
      ad: null,
      adGroup: null,
      keyword: null,
      matchType: null,
      network: null,
      device: null,
      placement: null,
      landingPath: null,
    };
  }
  return {
    campaign: adsAttributionLabel(attr),
    ad: adsAttributionAdLabel(attr),
    adGroup: attr.adGroupId ? `Group ${attr.adGroupId}` : null,
    keyword: attr.utmTerm ?? null,
    matchType: mappedLabel(MATCH_LABELS, attr.matchType),
    network: mappedLabel(NETWORK_LABELS, attr.network),
    device: mappedLabel(DEVICE_LABELS, attr.device),
    placement: attr.placement ?? null,
    landingPath: attr.landingPath ?? null,
  };
}
