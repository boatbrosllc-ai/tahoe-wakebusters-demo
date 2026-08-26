import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getStorageBucket } from "@/lib/booking/firebase-admin";
import { appendWaiverSignedStoragePaths, getRequestById } from "@/lib/waiver/firestore";
import { generateWaiverPdf } from "@/lib/waiver/pdf";
import { requireFeatureResponse } from "@/lib/plan";

/**
 * Generate PDF from stored signed waiver HTML (e.g. after configuring PDFSHIFT_API_KEY,
 * or when submit-time PDF failed on serverless without Playwright).
 */
export async function POST(
  _request: NextRequest,
  {
  params }: { params: Promise<{ id: string }> }
) {
  // PLAN_FEATURE_GATE
  {
    const planDenied = requireFeatureResponse("waivers");
    if (planDenied) return planDenied;
  }

  const unauthorized = await requireAdminSession(_request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Request id required" }, { status: 400 });

  try {
    const req = await getRequestById(id);
    if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });
    if (req.status !== "signed" || !req.signed) {
      return NextResponse.json({ error: "No signed waiver for this request" }, { status: 400 });
    }

    const htmlPath = req.signed.htmlStoragePath;
    if (!htmlPath) {
      return NextResponse.json(
        {
          error:
            "No stored HTML waiver document. PDF cannot be generated without the HTML archive.",
        },
        { status: 400 }
      );
    }

    const bucket = getStorageBucket();
    const pdfPath = `waivers/${id}.pdf`;

    if (req.signed.pdfStoragePath) {
      const pdfFile = bucket.file(req.signed.pdfStoragePath);
      const [exists] = await pdfFile.exists();
      if (exists) {
        return NextResponse.json({ ok: true, pdfStoragePath: req.signed.pdfStoragePath, alreadyStored: true });
      }
    }

    const htmlFile = bucket.file(htmlPath);
    const [htmlExists] = await htmlFile.exists();
    if (!htmlExists) {
      return NextResponse.json({ error: "Stored HTML file not found in bucket" }, { status: 404 });
    }

    const [buf] = await htmlFile.download();
    const html = buf.toString("utf8");

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await generateWaiverPdf(html);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        {
          error: msg,
          hint:
            "Production PDFs require PDFSHIFT_API_KEY (see lib/waiver/pdf.ts). Playwright does not run on typical serverless hosts.",
        },
        { status: 503 }
      );
    }

    const pdfFileOut = bucket.file(pdfPath);
    await pdfFileOut.save(pdfBuffer, {
      metadata: {
        contentType: "application/pdf",
        metadata: {
          requestId: id,
          contentHash: req.signed.contentHash ?? "",
          source: "admin-regenerate-pdf",
        },
      },
    });

    await appendWaiverSignedStoragePaths(id, { pdfStoragePath: pdfPath });

    return NextResponse.json({ ok: true, pdfStoragePath: pdfPath });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
