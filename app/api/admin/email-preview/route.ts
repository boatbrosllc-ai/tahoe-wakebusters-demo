import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getPreviewHtml, EMAIL_TEMPLATES, type EmailTemplateId } from "@/lib/booking/email-templates";
import type { ExperienceEmailLogistics } from "@/lib/booking/experience-email-logistics";

function isTemplateId(value: unknown): value is EmailTemplateId {
  return typeof value === "string" && EMAIL_TEMPLATES.some((t) => t.id === value);
}

function clip(value: unknown, max = 4000): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t ? t.slice(0, max) : undefined;
}

function parseLogistics(raw: unknown): ExperienceEmailLogistics | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const b = raw as Record<string, unknown>;
  const whatToBring = Array.isArray(b.whatToBring)
    ? b.whatToBring
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 40)
    : [];
  return {
    pickupTitle: clip(b.pickupTitle, 200),
    pickupAddress: clip(b.pickupAddress, 400),
    locationNotes: clip(b.locationNotes),
    entranceFeeText: clip(b.entranceFeeText),
    arrivalInstructions: clip(b.arrivalInstructions),
    whatToBring,
    rulesText: clip(b.rulesText),
    gratuityText: clip(b.gratuityText),
    additionalNotes: clip(b.additionalNotes),
  };
}

function previewResponse(html: string) {
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const templateId = request.nextUrl.searchParams.get("templateId");
  if (!isTemplateId(templateId)) {
    return NextResponse.json({ error: "Invalid templateId" }, { status: 400 });
  }

  try {
    return previewResponse(getPreviewHtml(templateId));
  } catch (err) {
    console.error("[admin/email-preview]", err);
    return NextResponse.json({ error: "Failed to generate preview" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const templateId = record.templateId;
  if (!isTemplateId(templateId)) {
    return NextResponse.json({ error: "Invalid templateId" }, { status: 400 });
  }

  try {
    const html = getPreviewHtml(templateId, {
      experienceTitle: clip(record.experienceTitle, 200),
      logistics: parseLogistics(record.logistics),
    });
    return previewResponse(html);
  } catch (err) {
    console.error("[admin/email-preview]", err);
    return NextResponse.json({ error: "Failed to generate preview" }, { status: 500 });
  }
}
