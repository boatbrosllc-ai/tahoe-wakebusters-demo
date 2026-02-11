/**
 * Seed Firestore with 4 experiences (Lake Austin Pontoon, WaterSports, Sunset, Holiday),
 * rates, addons, and slots for the next 60 days.
 * POST; optional Authorization: Bearer SEED_SECRET or CRON_SECRET.
 * In production, auth required.
 */

import { NextRequest, NextResponse } from "next/server";
import { runSeedExperiences } from "@/lib/booking/seed-experiences";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const secret = process.env.SEED_SECRET ?? process.env.CRON_SECRET;
    if (process.env.NODE_ENV === "production") {
      if (!secret || authHeader !== `Bearer ${secret}`) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else if (secret && authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await runSeedExperiences();
    if (!result.ok) {
      return NextResponse.json(
        { error: "Seed failed", detail: result.error },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, experienceIds: result.experienceIds });
  } catch (err) {
    console.error("[seed-experiences]", err);
    return NextResponse.json(
      { error: "Seed failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
