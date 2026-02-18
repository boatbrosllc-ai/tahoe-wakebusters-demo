import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getStorageBucket } from "@/lib/booking/firebase-admin";
import { getRequestById } from "@/lib/waiver/firestore";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const unauthorized = await requireAdminSession(_request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const { requestId } = await params;
  if (!requestId) return NextResponse.json({ error: "Request id required" }, { status: 400 });

  try {
    const req = await getRequestById(requestId);
    if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });
    if (req.status !== "signed" || !req.signed?.pdfStoragePath) {
      return NextResponse.json({ error: "No signed PDF for this request" }, { status: 404 });
    }

    const bucket = getStorageBucket();
    const file = bucket.file(req.signed.pdfStoragePath);
    const [exists] = await file.exists();
    if (!exists) return NextResponse.json({ error: "PDF file not found" }, { status: 404 });

    const [buffer] = await file.download();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="waiver-${requestId}.pdf"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
