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
  const body = (await request.json().catch(() => ({}))) as { confirmPhrase?: string };
  const seedEnabled = process.env.ENABLE_SEED_ENDPOINT === "true";
  const isProduction = process.env.NODE_ENV === "production";
  if (!seedEnabled) {
    return NextResponse.json(
      { error: "Seed endpoints are disabled. Set ENABLE_SEED_ENDPOINT=true to enable." },
      { status: 403 }
    );
  }
  if (isProduction) {
    const requiredPhrase = process.env.SEED_CONFIRM_PHRASE?.trim();
    if (!requiredPhrase || body.confirmPhrase !== requiredPhrase) {
      return NextResponse.json(
        {
          error:
            "Seed endpoint is production-guarded. Provide body.confirmPhrase matching SEED_CONFIRM_PHRASE to proceed.",
        },
        { status: 403 }
      );
    }
  }
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
