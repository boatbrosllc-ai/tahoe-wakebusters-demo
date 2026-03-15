/**
 * Seed Firestore with 4 experiences (Lake Austin Pontoon, WaterSports, Sunset, Holiday),
 * rates, addons, and slots for the next 60 days.
 * POST with Authorization: Bearer <SEED_SECRET>. In production, SEED_SECRET must be set; cron endpoints use CRON_SECRET only.
 */

import { NextRequest, NextResponse } from "next/server";
import { runSeedExperiences } from "@/lib/booking/seed-experiences";

export async function POST(request: NextRequest) {
  try {
    const seedSecret = process.env.SEED_SECRET;
    const openDev =
      process.env.SEED_OPEN_DEV === "1" &&
      process.env.NODE_ENV === "development" &&
      !process.env.VERCEL &&
      !process.env.NETLIFY;

    if (!openDev) {
      if (!seedSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const authHeader = request.headers.get("authorization");
      if (authHeader !== `Bearer ${seedSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
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
