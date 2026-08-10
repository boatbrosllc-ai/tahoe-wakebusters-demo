/**
 * Nasty Sport Fishing — safe catalog reconcile + verify (Firebase Admin only).
 *
 * HARD GUARDS: refuses unless project + SA are exactly "nasty-sport-fishing".
 * Never uses boat-bros-service-account.json.
 *
 *   node --import tsx scripts/nsf-catalog-reconcile-verify.mjs
 *   node --import tsx scripts/nsf-catalog-reconcile-verify.mjs --seed
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const NSF_PROJECT = "nasty-sport-fishing";
const DO_SEED = process.argv.includes("--seed");

function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) throw new Error("Missing .env.local");
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") process.env[key] = val;
  }
}

function abort(msg) {
  console.error("\nABORT:", msg);
  process.exit(2);
}

function assertNsfIdentity() {
  const projectId = (process.env.FIREBASE_PROJECT_ID || "").trim();
  const pubProject = (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "").trim();
  const saPath = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH || "").trim();
  const bucket = (process.env.FIREBASE_STORAGE_BUCKET || "").trim();
  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || "").trim();
  const blob = [projectId, pubProject, saPath, bucket, clientEmail].join(" ").toLowerCase();
  if (blob.includes("boat-bros") || blob.includes("boatbros")) {
    abort(`BoatBros identity detected in env: ${blob}`);
  }
  if (projectId !== NSF_PROJECT) abort(`FIREBASE_PROJECT_ID must be "${NSF_PROJECT}", got "${projectId}"`);
  if (pubProject && pubProject !== NSF_PROJECT) {
    abort(`NEXT_PUBLIC_FIREBASE_PROJECT_ID must be "${NSF_PROJECT}", got "${pubProject}"`);
  }
  if (!saPath) abort("FIREBASE_SERVICE_ACCOUNT_JSON_PATH is required");
  const resolved = path.isAbsolute(saPath) ? saPath : path.join(ROOT, saPath);
  if (!fs.existsSync(resolved)) abort(`Service account file missing: ${resolved}`);
  if (/boat-bros/i.test(path.basename(resolved))) abort(`SA filename looks like BoatBros: ${resolved}`);
  const sa = JSON.parse(fs.readFileSync(resolved, "utf8"));
  if (sa.project_id !== NSF_PROJECT) abort(`SA project_id must be "${NSF_PROJECT}", got "${sa.project_id}"`);
  if (String(sa.client_email || "").toLowerCase().includes("boat-bros")) {
    abort(`SA email is BoatBros: ${sa.client_email}`);
  }
  console.log("=== PROJECT GUARD OK ===");
  console.log("FIREBASE_PROJECT_ID:", projectId);
  console.log("SA path:", resolved);
  console.log("SA project_id:", sa.project_id);
  console.log("SA client_email:", sa.client_email);
  console.log("STORAGE_BUCKET:", bucket || "(unset)");
  return { resolved, sa };
}

async function main() {
  loadEnvLocal();
  const { resolved, sa } = assertNsfIdentity();

  const admin = require("firebase-admin");
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: NSF_PROJECT,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || undefined,
    });
  }
  if (admin.app().options.projectId && admin.app().options.projectId !== NSF_PROJECT) {
    abort(`Admin app projectId is ${admin.app().options.projectId}`);
  }
  const db = admin.firestore();

  const probe = await db.collection("experiences").limit(1).get();
  console.log("Firestore reachable. experiences probe docs:", probe.size);

  let seedResult = null;
  if (DO_SEED) {
    console.log("\n=== RUNNING SAFE RECONCILE (via seed-experiences) ===");
    // Patch Module loader so `import "server-only"` resolves to empty shim.
    const Module = require("module");
    const shimPath = path.join(ROOT, "scripts", "shims", "server-only.js");
    fs.mkdirSync(path.dirname(shimPath), { recursive: true });
    fs.writeFileSync(shimPath, "module.exports = {};\n");
    const origResolve = Module._resolveFilename;
    Module._resolveFilename = function (request, parent, isMain, options) {
      if (request === "server-only") return shimPath;
      return origResolve.call(this, request, parent, isMain, options);
    };

    // Force bookingEnv to see NSF project (already loaded from .env.local).
    const { runSeedExperiences } = await import("../lib/booking/seed-experiences.ts");
    seedResult = await runSeedExperiences();
    console.log("Seed result:", seedResult);
    if (!seedResult?.ok) abort(`Seed failed: ${seedResult?.error}`);
    Module._resolveFilename = origResolve;
  } else {
    console.log("\n(verify only — pass --seed to reconcile)");
  }

  const expSnap = await db.collection("experiences").get();
  const experiences = [];
  for (const doc of expSnap.docs) {
    const d = doc.data();
    const ratesSnap = await doc.ref.collection("rates").get();
    const addonsSnap = await doc.ref.collection("addons").get();
    experiences.push({
      id: doc.id,
      slug: d.slug,
      title: d.title,
      subtitle: d.subtitle ?? null,
      active: d.active !== false,
      timezone: d.timezone ?? null,
      fromPriceCents: d.fromPriceCents ?? null,
      allowDeposit: d.allowDeposit,
      pricingType: d.pricingType ?? null,
      holidayDates: d.holidayDates ?? [],
      heroUrl: d.heroMedia?.url ?? null,
      rates: ratesSnap.docs.map((r) => {
        const x = r.data();
        return {
          id: r.id,
          durationHours: x.durationHours,
          displayName: x.displayName,
          priceCents: x.priceCents,
          priceHolidayCents: x.priceHolidayCents ?? null,
          active: x.active !== false,
        };
      }),
      addons: addonsSnap.docs.map((a) => {
        const x = a.data();
        return {
          id: a.id,
          catalogKey: x.catalogKey ?? null,
          name: x.name,
          priceCents: x.priceCents,
          type: x.type,
          maxQty: x.maxQty ?? null,
          active: x.active !== false,
          hiddenFromBookingUI: x.hiddenFromBookingUI === true,
          partnerFulfilled: x.partnerFulfilled === true,
        };
      }),
    });
  }

  const boatsSnap = await db.collection("boats").get();
  const boats = boatsSnap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      name: d.name ?? null,
      slug: d.slug ?? null,
      active: d.active !== false,
      experienceIds: d.experienceIds ?? [],
      photosCount: Array.isArray(d.photos) ? d.photos.length : 0,
      capacity: d.capacity ?? d.maxGuests ?? null,
      boatType: d.boatType ?? null,
    };
  });

  const half = experiences.find((e) => e.slug === "pontoon") ?? null;
  const full = experiences.find((e) => e.slug === "watersports") ?? null;

  const report = {
    projectGuard: NSF_PROJECT,
    saPath: resolved,
    seedRan: DO_SEED,
    seedResult,
    experienceCount: experiences.length,
    boatCount: boats.length,
    halfDay: half,
    fullDay: full,
    otherExperiences: experiences
      .filter((e) => e.slug !== "pontoon" && e.slug !== "watersports")
      .map((e) => ({ id: e.id, slug: e.slug, title: e.title, active: e.active })),
    boats,
  };

  const outPath = path.join(ROOT, "tmp-nsf-catalog-verify.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log("\n=== CATALOG SNAPSHOT ===");
  console.log(JSON.stringify(report, null, 2));
  console.log("\nWrote", outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
