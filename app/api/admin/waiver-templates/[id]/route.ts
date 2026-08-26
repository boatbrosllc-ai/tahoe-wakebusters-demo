import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getTemplateById, updateTemplate } from "@/lib/waiver/firestore";
import { updateWaiverTemplateSchema } from "@/lib/waiver/schema";
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
  if (!id) return NextResponse.json({ error: "Template id required" }, { status: 400 });

  try {
    const template = await getTemplateById(id);
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    return NextResponse.json({ ...template, id });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const isFirebase = /firebase|FIREBASE|config missing|credential/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebase && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebase ? 503 : 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  {
  params }: { params: Promise<{ id: string }> }
) {
  // PLAN_FEATURE_GATE
  {
    const planDenied = requireFeatureResponse("waivers");
    if (planDenied) return planDenied;
  }

  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Template id required" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateWaiverTemplateSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.flatten().fieldErrors;
    const msg = Object.values(first).flat().join(" ") || "Validation failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    await updateTemplate(id, parsed.data);
    const template = await getTemplateById(id);
    return NextResponse.json(template ? { ...template, id } : { id });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message === "Template not found")
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    const isFirebase = /firebase|FIREBASE|config missing|credential/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebase && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebase ? 503 : 500 }
    );
  }
}
