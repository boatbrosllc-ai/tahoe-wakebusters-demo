/**
 * Seed Firestore with experiences, rates, addons, and slots for the next 60 days.
 * Requires admin session (middleware + requireAdminSession).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { runSeedExperiences } from "@/lib/booking/seed-experiences";

export async function POST(request: NextRequest) {
  const deny = await requireAdminSession(request.headers.get("cookie"));
  if (deny) return deny;
  try {
    const result = await runSeedExperiences();
    if (!result.ok) {
      return NextResponse.json({ error: "Seed failed", detail: result.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, experienceIds: result.experienceIds });
  } catch (err) {
    console.error("[admin/seed/experiences]", err);
    return NextResponse.json(
      { error: "Seed failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
