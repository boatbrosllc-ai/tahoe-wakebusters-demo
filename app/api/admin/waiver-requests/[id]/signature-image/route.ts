import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getStorageBucket } from "@/lib/booking/firebase-admin";
import { getRequestById } from "@/lib/waiver/firestore";
import { requireFeatureResponse } from "@/lib/plan";

export async function GET(
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
    if (!req?.signed?.signatureStoragePath) {
      return NextResponse.json({ error: "No stored signature image for this request" }, { status: 404 });
    }

    const bucket = getStorageBucket();
    const file = bucket.file(req.signed.signatureStoragePath);
    const [exists] = await file.exists();
    if (!exists) return NextResponse.json({ error: "Signature file not found" }, { status: 404 });

    const [buffer] = await file.download();
    const path = req.signed.signatureStoragePath.toLowerCase();
    const contentType = path.endsWith(".jpg") || path.endsWith(".jpeg")
      ? "image/jpeg"
      : path.endsWith(".webp")
        ? "image/webp"
        : "image/png";

    const body: BodyInit = new Uint8Array(buffer);
    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
