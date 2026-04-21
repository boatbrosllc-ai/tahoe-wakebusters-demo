import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getWaiverQrLinkById } from "@/lib/waiver/waiver-qr-firestore";
import { buildWaiverQrSignUrl } from "@/lib/waiver/qr-sign-url";
import { waiverQrToPngBuffer, waiverQrToSvgString } from "@/lib/waiver/render-qr-code";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ qrId: string }> }
) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const { qrId } = await params;
  if (!qrId) return NextResponse.json({ error: "QR id required" }, { status: 400 });

  const format = request.nextUrl.searchParams.get("format")?.toLowerCase() ?? "png";

  try {
    const link = await getWaiverQrLinkById(qrId);
    if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const signUrl = buildWaiverQrSignUrl(link.id);
    const kiosk = request.nextUrl.searchParams.get("kiosk") === "1";
    const payloadUrl = kiosk ? buildWaiverQrSignUrl(link.id, { kiosk: true }) : signUrl;

    if (format === "svg") {
      const svg = await waiverQrToSvgString(payloadUrl);
      return new NextResponse(svg, {
        headers: {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    const buf = await waiverQrToPngBuffer(payloadUrl);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const isFirebase = /firebase|FIREBASE|config missing|credential/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebase && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebase ? 503 : 500 }
    );
  }
}
