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
  } catch {
    redirect("/admin/login");
  }
  return <AdminShell>{children}</AdminShell>;
}
