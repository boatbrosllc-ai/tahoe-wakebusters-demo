"use client";

import Script from "next/script";
import { runGa4Bootstrap } from "@/lib/ga-gtag-inline";

/**
 * Loads `gtag/js` then runs `gtag('config')` in `onLoad` so config always runs after the library
 * (avoids races with a second `afterInteractive` script or `/gtag-bootstrap`).
 */
export function Ga4Scripts({ measurementId, nonce }: { measurementId: string; nonce?: string }) {
  return (
    <Script
      id="ga-gtag-lib"
      src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
      strategy="afterInteractive"
      nonce={nonce}
      onLoad={() => runGa4Bootstrap(measurementId)}
    />
  );
}
