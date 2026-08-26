import "server-only";
import { sendTeamInviteEmail } from "@/lib/booking/brevo";
import { logEmailSent } from "@/lib/booking/email-log";
import { getTeamInviteSubject } from "@/lib/booking/email-templates";
import type { TeamInviteRole } from "@/lib/admin/team-store";

export async function emailTeamPasswordSetupLink(opts: {
  to: string;
  name: string;
  role: TeamInviteRole;
  resetLink: string;
}): Promise<boolean> {
  const roleLabel = opts.role === "captain" ? "Captain" : "Operator";
  try {
    await sendTeamInviteEmail({
      to: opts.to,
      toName: opts.name,
      roleLabel,
      resetLink: opts.resetLink,
    });
    try {
      await logEmailSent({
        to: opts.to,
        toName: opts.name,
        templateId: "team_invite",
        subject: getTeamInviteSubject(roleLabel),
        eventSubtype: "team_invite",
        audience: "staff",
      });
    } catch (logErr) {
      console.warn("[admin team] invite email sent but log failed", logErr);
    }
    return true;
  } catch (err) {
    console.error("[admin team] invite email failed", err);
    return false;
  }
}
