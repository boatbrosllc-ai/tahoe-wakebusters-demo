import { NextResponse } from "next/server";
import { getGaMeasurementId } from "@/lib/ga-measurement-id";

/**
 * Same-origin GA4 bootstrap so we avoid CSP `script-src` nonces on inline snippets.
 * `layout.tsx` loads this after `gtag/js`; measurement ID stays server-derived.
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

  const body = [
    "window.dataLayer = window.dataLayer || [];",
    "function gtag(){dataLayer.push(arguments);}",
    "gtag('js', new Date());",
    `gtag('config', ${JSON.stringify(id)});`,
  ].join("\n");

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // Measurement ID is baked at build for NEXT_PUBLIC_*; avoid long CDN caches across deploys.
      "Cache-Control": "public, max-age=300",
    },
  });
}
