import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getAdminPrincipalFromSessionCookie, getAdminSessionVerifyOutcome } from "@/lib/admin-auth-firebase";
import { canAccessAdminPath, homePathForAdminRole } from "@/lib/admin/roles";
import { AdminShell } from "./AdminShell";
import { AdminVerificationUnavailable } from "./AdminVerificationUnavailable";

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  try {
    const headersList = await headers();
    const cookie = headersList.get("cookie");
    const pathname = headersList.get("x-pathname") ?? "";
    const outcome = await getAdminSessionVerifyOutcome(cookie);
    if (outcome === "unavailable") {
      return (
        <AdminShell>
          <AdminVerificationUnavailable />
        </AdminShell>
      );
    }
    if (outcome !== "valid") {
      redirect("/admin/login");
    }
    const principal = await getAdminPrincipalFromSessionCookie(cookie);
    if (!principal) {
      redirect("/admin/login");
    }
    if (pathname && !canAccessAdminPath(principal.role, pathname, "GET")) {
      redirect(homePathForAdminRole(principal.role));
    }
    return (
      <AdminShell role={principal.role} displayName={principal.displayName} email={principal.email}>
        {children}
      </AdminShell>
    );
  } catch (err) {
    const digest = err && typeof err === "object" && "digest" in err ? String((err as { digest?: unknown }).digest) : "";
    if (digest.startsWith("NEXT_REDIRECT")) throw err;
    const message = err instanceof Error ? err.message : String(err);
    const lower = message.toLowerCase();
    const isFirebaseConfig =
      lower.includes("firebase_private_key") ||
      lower.includes("config missing") ||
      lower.includes("firebase admin") ||
      lower.includes("firebase config") ||
      /credential|private key|truncated|secretorprivatekey/i.test(message);
    if (isFirebaseConfig) {
      redirect("/admin/login?error=config");
    }
    redirect("/admin/login");
  }
}
