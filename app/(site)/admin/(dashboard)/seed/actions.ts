"use server";

import { runSeedExperiences } from "@/lib/booking/seed-experiences";

export type SeedResult = { ok: true; experienceIds: string[] } | { ok: false; error: string };

export async function runSeedAction(setupKey?: string | null): Promise<SeedResult> {
  if (process.env.NODE_ENV === "production") {
    const secret = process.env.SEED_SECRET ?? process.env.CRON_SECRET;
    if (secret && setupKey !== secret) {
      return { ok: false, error: "Invalid setup key." };
    }
  }
  return runSeedExperiences();
}
