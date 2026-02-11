import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getPreviewHtml, EMAIL_TEMPLATES, type EmailTemplateId } from "@/lib/booking/email-templates";

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const templateId = request.nextUrl.searchParams.get("templateId") as EmailTemplateId | null;
  if (!templateId || !EMAIL_TEMPLATES.some((t) => t.id === templateId)) {
    return NextResponse.json({ error: "Invalid templateId" }, { status: 400 });
  }

  try {
    const html = getPreviewHtml(templateId);
    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    console.error("[admin/email-preview]", err);
    return NextResponse.json({ error: "Failed to generate preview" }, { status: 500 });
  }
}
