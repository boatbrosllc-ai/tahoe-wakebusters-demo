import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getStorageBucket } from "@/lib/booking/firebase-admin";
import { getRequestById } from "@/lib/waiver/firestore";
import { requireFeatureResponse } from "@/lib/plan";

export async function GET(
  _request: NextRequest,
  {
  params }: { params: Promise<{ requestId: string }> }
) {
  // PLAN_FEATURE_GATE
  {
    const planDenied = requireFeatureResponse("waivers");
    if (planDenied) return planDenied;
  }

  const unauthorized = await requireAdminSession(_request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const { requestId } = await params;
  if (!requestId) return NextResponse.json({ error: "Request id required" }, { status: 400 });

  try {
    const req = await getRequestById(requestId);
    if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });
    if (req.status !== "signed" || !req.signed) {
      return NextResponse.json({ error: "No signed waiver for this request" }, { status: 404 });
    }

    const pdfPath = req.signed.pdfStoragePath;
    const htmlPath = req.signed.htmlStoragePath;
    if (!pdfPath && !htmlPath) {
      return NextResponse.json({ error: "No stored waiver document for this request" }, { status: 404 });
    }

    const bucket = getStorageBucket();

    if (pdfPath) {
      const file = bucket.file(pdfPath);
      const [exists] = await file.exists();
      if (exists) {
        const [buffer] = await file.download();
        const body: BodyInit = new Uint8Array(buffer);
        return new NextResponse(body, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="waiver-${requestId}.pdf"`,
          },
        });
      }
    }

    if (htmlPath) {
      const file = bucket.file(htmlPath);
      const [exists] = await file.exists();
      if (!exists) return NextResponse.json({ error: "Waiver file not found" }, { status: 404 });
      const [buffer] = await file.download();
      const body: BodyInit = new Uint8Array(buffer);
      return new NextResponse(body, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `attachment; filename="waiver-${requestId}.html"`,
        },
      });
    }

    return NextResponse.json({ error: "Waiver file not found" }, { status: 404 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
