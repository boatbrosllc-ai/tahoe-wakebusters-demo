import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getTemplateById } from "@/lib/waiver/firestore";
import {
  createWaiverQrLink,
  listWaiverQrLinksForTemplate,
} from "@/lib/waiver/waiver-qr-firestore";
import { buildWaiverQrSignUrl } from "@/lib/waiver/qr-sign-url";
import { requireFeatureResponse } from "@/lib/plan";

const postBodySchema = z.object({
  label: z.string().optional(),
  assignedBoat: z.string().optional(),
  useCase: z.string().optional(),
  /** When false (default), reuse the first active link if one exists. */
  forceNew: z.boolean().optional(),
});

export async function GET(
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

  const { id: templateId } = await params;
  if (!templateId) return NextResponse.json({ error: "Template id required" }, { status: 400 });

  try {
    const template = await getTemplateById(templateId);
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    const links = await listWaiverQrLinksForTemplate(templateId);
    const enriched = links.map((l) => ({
      ...l,
      signUrl: buildWaiverQrSignUrl(l.id),
      kioskUrl: buildWaiverQrSignUrl(l.id, { kiosk: true }),
    }));
    return NextResponse.json({ templateTitle: template.title, links: enriched });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const isFirebase = /firebase|FIREBASE|config missing|credential/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebase && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebase ? 503 : 500 }
    );
  }
}

export async function POST(
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

  const { id: templateId } = await params;
  if (!templateId) return NextResponse.json({ error: "Template id required" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = postBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const template = await getTemplateById(templateId);
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    const forceNew = parsed.data.forceNew === true;
    if (!forceNew) {
      const existing = await listWaiverQrLinksForTemplate(templateId);
      const active = existing.find((l) => l.active);
      if (active) {
        return NextResponse.json({
          id: active.id,
          reused: true,
          signUrl: buildWaiverQrSignUrl(active.id),
          kioskUrl: buildWaiverQrSignUrl(active.id, { kiosk: true }),
        });
      }
    }

    const id = await createWaiverQrLink({
      templateId,
      label: parsed.data.label,
      assignedBoat: parsed.data.assignedBoat,
      useCase: parsed.data.useCase,
    });

    return NextResponse.json({
      id,
      reused: false,
      signUrl: buildWaiverQrSignUrl(id),
      kioskUrl: buildWaiverQrSignUrl(id, { kiosk: true }),
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
