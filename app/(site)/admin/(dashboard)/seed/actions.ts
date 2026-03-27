"use server";

import { createHash } from "crypto";
import { cookies } from "next/headers";
import { runSeedExperiences } from "@/lib/booking/seed-experiences";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getAdminEmailFromSessionCookie, verifyAdminSessionCookie } from "@/lib/admin-auth-firebase";
import { writeAdminAuditLog } from "@/lib/booking/admin-audit-log";

export type SeedResult = { ok: true; experienceIds: string[] } | { ok: false; error: string };

const SEED_RATE_LIMIT_MS = 24 * 60 * 60 * 1000;

function cookieHeaderFromStore(): string {
  const c = cookies();
  return c.getAll().map(({ name, value }) => `${name}=${value}`).join("; ");
}

export async function runSeedAction(setupKey?: string | null): Promise<SeedResult> {
  const openDev =
    process.env.SEED_OPEN_DEV === "1" &&
    process.env.NODE_ENV === "development" &&
    !process.env.VERCEL &&
    !process.env.NETLIFY;

  if (!openDev) {
    const seedSecret = process.env.SEED_SECRET?.trim();
    if (!seedSecret) {
      return {
        ok: false,
        error:
          "Unauthorized. Set SEED_SECRET in your environment (or SEED_OPEN_DEV=1 only in local development).",
      };
    }
    if (setupKey !== seedSecret) {
      return { ok: false, error: "Invalid or missing setup key. Use the SEED_SECRET value from your environment." };
    }
    const cookieHeader = cookieHeaderFromStore();
    const sessionOk = await verifyAdminSessionCookie(cookieHeader);
    if (!sessionOk) {
      return {
        ok: false,
        error: "Sign in to admin first. Seed requires an active admin session when SEED_SECRET is set.",
      };
    }
  }

  const cookieHeader = cookieHeaderFromStore();
  const adminEmail = openDev ? null : await getAdminEmailFromSessionCookie(cookieHeader);
  if (!openDev && !adminEmail) {
    return { ok: false, error: "Could not read admin email from session." };
  }

  if (!openDev && adminEmail) {
    try {
      const db = getDb();
      const { Timestamp } = getFirestoreExports();
      const rateKey = createHash("sha256").update(adminEmail, "utf8").digest("hex").slice(0, 48);
      const rateRef = db.collection("adminSeedRateLimit").doc(rateKey);
      const snap = await rateRef.get();
      const last = snap.data()?.lastRunAt as { toMillis?: () => number } | undefined;
      const lastMs = last && typeof last.toMillis === "function" ? last.toMillis() : 0;
      if (lastMs > 0 && Date.now() - lastMs < SEED_RATE_LIMIT_MS) {
        return { ok: false, error: "Seed can run at most once every 24 hours per admin account." };
      }
    } catch (e) {
      console.error("[seed] rate limit read failed", e);
      return { ok: false, error: "Could not verify seed rate limit. Check Firestore configuration." };
    }
  }

  const result = await runSeedExperiences();

  if (result.ok && !openDev && adminEmail) {
    try {
      const db = getDb();
      const { Timestamp } = getFirestoreExports();
      const rateKey = createHash("sha256").update(adminEmail, "utf8").digest("hex").slice(0, 48);
      await db.collection("adminSeedRateLimit").doc(rateKey).set(
        { lastRunAt: Timestamp.now(), adminEmail },
        { merge: true },
      );
    } catch (e) {
      console.error("[seed] rate limit write failed", e);
    }
    void writeAdminAuditLog("seed_experiences", {
      adminEmail,
      experienceCount: result.experienceIds.length,
      experienceIds: result.experienceIds.slice(0, 30),
      at: new Date().toISOString(),
    });
  } else if (result.ok && openDev) {
    void writeAdminAuditLog("seed_experiences", {
      adminEmail: "open_dev",
      experienceCount: result.experienceIds.length,
      experienceIds: result.experienceIds.slice(0, 30),
      at: new Date().toISOString(),
    });
  }

  return result;
}
