"use server";

import { runSeedExperiences } from "@/lib/booking/seed-experiences";

export type SeedResult = { ok: true; experienceIds: string[] } | { ok: false; error: string };

export async function runSeedAction(setupKey?: string | null): Promise<SeedResult> {
  const openDev =
    process.env.SEED_OPEN_DEV === "1" &&
    process.env.NODE_ENV === "development" &&
    !process.env.VERCEL &&
    !process.env.NETLIFY;

  if (!openDev) {
    const seedSecret = process.env.SEED_SECRET;
    if (!seedSecret) {
      return { ok: false, error: "Unauthorized. Set SEED_SECRET in your environment (or SEED_OPEN_DEV=1 only in local development)." };
    }
    if (setupKey !== seedSecret) {
      return { ok: false, error: "Invalid or missing setup key. Use the SEED_SECRET value from your environment." };
    }
  }
  return runSeedExperiences();
}
