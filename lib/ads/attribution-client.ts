"use client";

import {
  ADS_ATTRIBUTION_COOKIE,
  ADS_ATTRIBUTION_MAX_AGE_SEC,
  parseAdsAttributionFromSearchParams,
  parseAdsAttributionFromUnknown,
  type AdsAttribution,
} from "@/lib/ads/attribution";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  const hit = document.cookie.split("; ").find((row) => row.startsWith(prefix));
  if (!hit) return null;
  try {
    return decodeURIComponent(hit.slice(prefix.length));
  } catch {
    return null;
  }
}

function writeCookie(name: string, value: string, maxAgeSec: number): void {
  if (typeof document === "undefined") return;
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax${secure}`;
}

export function getStoredAdsAttribution(): AdsAttribution | null {
  const raw = readCookie(ADS_ATTRIBUTION_COOKIE);
  if (!raw) return null;
  try {
    return parseAdsAttributionFromUnknown(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function captureAdsAttributionFromLocation(): AdsAttribution | null {
  if (typeof window === "undefined") return null;
  const fromUrl = parseAdsAttributionFromSearchParams(new URLSearchParams(window.location.search), window.location.pathname);
  if (fromUrl) {
    writeCookie(ADS_ATTRIBUTION_COOKIE, JSON.stringify(fromUrl), ADS_ATTRIBUTION_MAX_AGE_SEC);
    return fromUrl;
  }
  return getStoredAdsAttribution();
}
