import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { EMAIL_TEMPLATES } from "@/lib/booking/email-templates";

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  return NextResponse.json(EMAIL_TEMPLATES);
}
