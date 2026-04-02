import { NextResponse } from "next/server";
import { getGaMeasurementId, isGaClientDebugEnabled } from "@/lib/ga-measurement-id";
import { getGoogleAdsId } from "@/lib/google-ads-id";
import { getGtagFullBootstrapJs } from "@/lib/ga-gtag-inline";

/**
 * Legacy same-origin GA4 bootstrap (prefer inline in `app/layout.tsx`).
 * Serves the same one-file loader as the root layout (dataLayer + inject `gtag/js`).
 */
export async function GET() {
  const id = getGaMeasurementId();
  if (!id) {
    return new NextResponse("// ga disabled\n", {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "private, no-store",
      },
    });
  }

  const body = `${getGtagFullBootstrapJs(id, {
    debugMode: isGaClientDebugEnabled(),
    googleAdsId: getGoogleAdsId(),
  })}\n`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // Measurement ID is baked at build for NEXT_PUBLIC_*; avoid long CDN caches across deploys.
      "Cache-Control": "public, max-age=300",
    },
  });
}
