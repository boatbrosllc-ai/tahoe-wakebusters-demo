"use client";

import { useEffect } from "react";
import { captureAdsAttributionFromLocation } from "@/lib/ads/attribution-client";

/** Persists Google Ads click IDs / paid UTMs from the landing URL for later booking and lead attribution. */
export function AdsAttributionCapture() {
  useEffect(() => {
    captureAdsAttributionFromLocation();
  }, []);
  return null;
}
