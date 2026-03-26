import { NextResponse } from "next/server";
import { getGaMeasurementId, isGaClientDebugEnabled } from "@/lib/ga-measurement-id";
import { getGtagInlineBootstrapJs } from "@/lib/ga-gtag-inline";

/**
 * Legacy same-origin GA4 bootstrap (prefer inline in `app/layout.tsx`).
 * Must not overwrite `window.gtag` if `gtag/js` already ran — see `getGtagInlineBootstrapJs`.
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

  const body = `${getGtagInlineBootstrapJs(id, { debugMode: isGaClientDebugEnabled() })}\n`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // Measurement ID is baked at build for NEXT_PUBLIC_*; avoid long CDN caches across deploys.
      "Cache-Control": "public, max-age=300",
    },
  });
}
