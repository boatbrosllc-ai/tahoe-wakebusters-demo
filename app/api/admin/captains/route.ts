import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { listActiveCaptains } from "@/lib/admin/team-store";
import { requireFeatureResponse } from "@/lib/plan";

/** Active captains for assignment dropdowns. Operators and Super Admin (bookings permission). */
export async function GET(request: Request) {
  // PLAN_FEATURE_GATE
  {
    const planDenied = requireFeatureResponse("teamOps");
    if (planDenied) return planDenied;
  }

  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const captains = await listActiveCaptains();
    return NextResponse.json({
      captains: captains.map((c) => ({ email: c.email, name: c.name })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
