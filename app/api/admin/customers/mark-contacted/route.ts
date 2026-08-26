import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { isValidBookingEmail } from "@/lib/booking/validate-email";
import { normalizeCustomerEmail } from "@/lib/admin/customer-crm";
import { writeAdminAuditLog } from "@/lib/booking/admin-audit-log";
import { markLeadsContacted } from "@/lib/lead/persist-lead";
import { requireFeatureResponse } from "@/lib/plan";

export async function POST(request: NextRequest) {
  // PLAN_FEATURE_GATE
  {
    const planDenied = requireFeatureResponse("crm");
    if (planDenied) return planDenied;
  }

  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const emailRaw = json && typeof json === "object" && typeof (json as { email?: unknown }).email === "string"
    ? (json as { email: string }).email
    : "";
  const email = normalizeCustomerEmail(emailRaw);
  if (!email || !isValidBookingEmail(email)) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  try {
    const updated = await markLeadsContacted(emailRaw || email);
    void writeAdminAuditLog("customer_lead_marked_contacted", { email, updated });
    return NextResponse.json({ ok: true, updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebaseConfig ? 503 : 500 }
    );
  }
}
