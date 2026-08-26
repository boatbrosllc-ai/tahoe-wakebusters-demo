import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, getAdminPrincipalFromSessionCookie } from "@/lib/admin-auth-firebase";
import { deleteTeamMember, ensureFirebaseUserAndResetLink, getTeamMember, setTeamMemberStatus } from "@/lib/admin/team-store";
import { emailTeamPasswordSetupLink } from "@/lib/admin/team-invite-email";
import { writeAdminAuditLog } from "@/lib/booking/admin-audit-log";
import { requireFeatureResponse } from "@/lib/plan";

function decodeEmailParam(raw: string): string {
  try {
    return decodeURIComponent(raw).trim().toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

export async function PATCH(request: NextRequest, context: {
  params: Promise<{ email: string }> }) {
  // PLAN_FEATURE_GATE
  {
    const planDenied = requireFeatureResponse("teamOps");
    if (planDenied) return planDenied;
  }

  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const principal = await getAdminPrincipalFromSessionCookie(request.headers.get("cookie"));
  if (!principal || principal.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { email: emailParam } = await context.params;
  const email = decodeEmailParam(emailParam);

  let body: { status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const status = body.status === "disabled" ? "disabled" : body.status === "active" ? "active" : null;
  if (!status) {
    return NextResponse.json({ error: "status must be active or disabled" }, { status: 400 });
  }

  try {
    const member = await setTeamMemberStatus(email, status);
    void writeAdminAuditLog("team_operator_status", {
      email,
      status,
      by: principal.email,
    });
    return NextResponse.json({ member });
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code) : "";
    const message = err instanceof Error ? err.message : String(err);
    const http = code === "NOT_FOUND" ? 404 : code === "SUPER_ADMIN_LOCKED" ? 400 : 500;
    return NextResponse.json({ error: message }, { status: http });
  }
}

export async function DELETE(request: NextRequest, context: {
  params: Promise<{ email: string }> }) {
  // PLAN_FEATURE_GATE
  {
    const planDenied = requireFeatureResponse("teamOps");
    if (planDenied) return planDenied;
  }

  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const principal = await getAdminPrincipalFromSessionCookie(request.headers.get("cookie"));
  if (!principal || principal.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { email: emailParam } = await context.params;
  const email = decodeEmailParam(emailParam);

  try {
    const member = await deleteTeamMember(email);
    void writeAdminAuditLog("team_member_deleted", {
      email: member.email,
      role: member.role,
      name: member.name,
      by: principal.email,
    });
    return NextResponse.json({ ok: true, member });
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code) : "";
    const message = err instanceof Error ? err.message : String(err);
    const http = code === "NOT_FOUND" ? 404 : code === "SUPER_ADMIN_LOCKED" ? 400 : 500;
    return NextResponse.json({ error: message }, { status: http });
  }
}

export async function POST(request: NextRequest, context: {
  params: Promise<{ email: string }> }) {
  // PLAN_FEATURE_GATE
  {
    const planDenied = requireFeatureResponse("teamOps");
    if (planDenied) return planDenied;
  }

  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const principal = await getAdminPrincipalFromSessionCookie(request.headers.get("cookie"));
  if (!principal || principal.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { email: emailParam } = await context.params;
  const email = decodeEmailParam(emailParam);
  const action = request.nextUrl.searchParams.get("action");
  if (action !== "reset-link") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  try {
    const { resetLink, createdUser } = await ensureFirebaseUserAndResetLink(email);
    const member = await getTeamMember(email);
    let emailSent = false;
    if (resetLink && member) {
      emailSent = await emailTeamPasswordSetupLink({
        to: member.email,
        name: member.name,
        role: member.role,
        resetLink,
      });
    }
    void writeAdminAuditLog("team_operator_reset_link", { email, by: principal.email, createdUser, emailSent });
    return NextResponse.json({ resetLink, createdUser, emailSent });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
