import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { sendAdminCrmEmail } from "@/lib/booking/brevo";
import { logEmailSent } from "@/lib/booking/email-log";
import { writeAdminAuditLog } from "@/lib/booking/admin-audit-log";
import { adminCrmEmailToHtml, parseAdminCrmEmailBody } from "@/lib/admin/customer-crm";
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

  const parsed = parseAdminCrmEmailBody(json);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const htmlContent = adminCrmEmailToHtml(parsed.body);
    await sendAdminCrmEmail({
      to: parsed.to,
      toName: parsed.toName,
      subject: parsed.subject,
      htmlContent,
    });
    try {
      await logEmailSent({
        to: parsed.to,
        toName: parsed.toName || undefined,
        templateId: "admin_crm_email",
        subject: parsed.subject,
        eventSubtype: "admin_crm_email",
      });
    } catch (logErr) {
      console.error("[customers/send-email] email sent but log failed", logErr);
    }
    void writeAdminAuditLog("customer_crm_email", {
      to: parsed.to,
      subject: parsed.subject,
    });
    void markLeadsContacted(parsed.to).catch((err) => {
      console.error("[customers/send-email] mark contacted failed", err);
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    const isBrevo = /brevo|api-key|sender/i.test(message);
    return NextResponse.json(
      {
        error: isBrevo ? "Failed to send email. Check Brevo configuration." : message,
        ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }),
      },
      { status: isFirebaseConfig ? 503 : 500 }
    );
  }
}
