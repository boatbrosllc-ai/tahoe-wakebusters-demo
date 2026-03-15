import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { verifyAdminSessionCookie } from "@/lib/admin-auth-firebase";
import { AdminShell } from "./AdminShell";

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  try {
    const headersList = await headers();
    const cookie = headersList.get("cookie");
    const valid = await verifyAdminSessionCookie(cookie);
    if (!valid) {
      redirect("/admin/login");
    }
  } catch (err) {
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
  return <AdminShell>{children}</AdminShell>;
}
