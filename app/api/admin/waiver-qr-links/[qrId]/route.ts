import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getTemplateById } from "@/lib/waiver/firestore";
import {
  createWaiverQrLink,
  getWaiverQrLinkById,
  updateWaiverQrLink,
} from "@/lib/waiver/waiver-qr-firestore";
import { buildWaiverQrSignUrl } from "@/lib/waiver/qr-sign-url";
import { requireFeatureResponse } from "@/lib/plan";

const patchSchema = z.object({
  label: z.string().optional(),
  assignedBoat: z.string().optional(),
  useCase: z.string().optional(),
  active: z.boolean().optional(),
});

export async function GET(
  request: NextRequest,
  {
  params }: { params: Promise<{ qrId: string }> }
) {
  // PLAN_FEATURE_GATE
  {
    const planDenied = requireFeatureResponse("waivers");
    if (planDenied) return planDenied;
  }

  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const { qrId } = await params;
  if (!qrId) return NextResponse.json({ error: "QR id required" }, { status: 400 });

  try {
    const link = await getWaiverQrLinkById(qrId);
    if (!link) return NextResponse.json({ error: "QR link not found" }, { status: 404 });
    const template = await getTemplateById(link.templateId);
    return NextResponse.json({
      link,
      templateTitle: template?.title ?? "Waiver",
      signUrl: buildWaiverQrSignUrl(link.id),
      kioskUrl: buildWaiverQrSignUrl(link.id, { kiosk: true }),
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

export async function PATCH(
  request: NextRequest,
  {
  params }: { params: Promise<{ qrId: string }> }
) {
  // PLAN_FEATURE_GATE
  {
    const planDenied = requireFeatureResponse("waivers");
    if (planDenied) return planDenied;
  }

  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const { qrId } = await params;
  if (!qrId) return NextResponse.json({ error: "QR id required" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const existing = await getWaiverQrLinkById(qrId);
    if (!existing) return NextResponse.json({ error: "QR link not found" }, { status: 404 });

    await updateWaiverQrLink(qrId, parsed.data);

    const next = await getWaiverQrLinkById(qrId);
    return NextResponse.json({
      ...next,
      signUrl: next ? buildWaiverQrSignUrl(next.id) : "",
      kioskUrl: next ? buildWaiverQrSignUrl(next.id, { kiosk: true }) : "",
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

/** Retire this link and create a new active link for the same template (new URL — reprint required). */
export async function POST(
  request: NextRequest,
  {
  params }: { params: Promise<{ qrId: string }> }
) {
  // PLAN_FEATURE_GATE
  {
    const planDenied = requireFeatureResponse("waivers");
    if (planDenied) return planDenied;
  }

  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const { qrId } = await params;
  if (!qrId) return NextResponse.json({ error: "QR id required" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const carry = z
    .object({
      label: z.string().optional(),
      assignedBoat: z.string().optional(),
      useCase: z.string().optional(),
    })
    .safeParse(body);

  try {
    const existing = await getWaiverQrLinkById(qrId);
    if (!existing) return NextResponse.json({ error: "QR link not found" }, { status: 404 });

    await updateWaiverQrLink(qrId, { active: false });

    const newId = await createWaiverQrLink({
      templateId: existing.templateId,
      label: carry.success ? carry.data.label ?? existing.label : existing.label,
      assignedBoat: carry.success ? carry.data.assignedBoat ?? existing.assignedBoat : existing.assignedBoat,
      useCase: carry.success ? carry.data.useCase ?? existing.useCase : existing.useCase,
    });

    return NextResponse.json({
      previousId: qrId,
      id: newId,
      signUrl: buildWaiverQrSignUrl(newId),
      kioskUrl: buildWaiverQrSignUrl(newId, { kiosk: true }),
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
