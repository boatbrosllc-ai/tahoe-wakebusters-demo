/**
 * One-shot: create the Cabo 40 Express listing boat in Firestore.
 * Run: node scripts/seed-launch-boat.mjs
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const sa = JSON.parse(fs.readFileSync(path.join(root, "nasty-sport-fishing-service-account.json"), "utf8"));

if (!getApps().length) {
  initializeApp({ credential: cert(sa), projectId: sa.project_id });
}

const db = getFirestore();

const HALF_DAY = "IbL6Qeu0X4z0jKDZYSZE";
const FULL_DAY = "PqMH7FaCTEBHeiGwRihE";

const description = [
  "The 2010 Cabo 40 Express is Nasty Sport Fishing's flagship offshore sportfisher — a Michael Peters–designed hard-top express built to fish Cabo San Lucas.",
  "Specs: 42'10\" LOA, 15'9\" beam, 3'5\" draft. Twin Cummins QSC 600 diesels (1,200 hp total) with tuna tower, outriggers, and a serious cockpit for bluewater work.",
  "Every charter includes a licensed captain and mate, premium tackle, and local-grounds fuel. Book Half Day or Full Day and we'll put you on the water.",
].join("\n\n");

const existing = await db.collection("boats").where("slug", "==", "cabo-40-express").limit(1).get();
const ref = existing.empty ? db.collection("boats").doc() : existing.docs[0].ref;
console.log(existing.empty ? "creating" : "updating", ref.id);

await ref.set(
  {
    name: "Cabo 40 Express",
    slug: "cabo-40-express",
    previousSlugs: ["nasty-sportfisher"],
    description,
    heroSubtitle: "Cabo San Lucas sportfisher · Captain & crew included",
    capacity: 6,
    photos: ["/photos/nsf/cabo-40-express.png"],
    timezone: "America/Mazatlan",
    capacityMax: 6,
    petsMax: 0,
    defaultLocationText: "Marina Cabo San Lucas — we'll send exact slip / meet-up after booking.",
    cancellationPolicyText:
      "Free cancellation up to 30 days before. Partial refund 15–30 days before. No refund within 14 days.",
    active: true,
    isListingBoat: true,
    experienceIds: [HALF_DAY, FULL_DAY],
    updatedAt: FieldValue.serverTimestamp(),
    ...(existing.empty ? { createdAt: FieldValue.serverTimestamp() } : {}),
  },
  { merge: true }
);

const ratesRef = ref.collection("rates");
const ratesSnap = await ratesRef.get();
if (ratesSnap.empty) {
  const rates = [
    { durationHours: 3, displayName: "Three Hour Charter", active: true },
    { durationHours: 4, displayName: "Four Hour Charter", active: true },
    { durationHours: 5, displayName: "Five Hour Charter", active: true },
    { durationHours: 6, displayName: "Six Hour Charter", active: true },
    { durationHours: 7, displayName: "Seven Hour Charter", active: true },
    { durationHours: 8, displayName: "Eight Hour Charter", active: true },
  ];
  for (const r of rates) await ratesRef.doc().set(r);
  console.log("rates_seeded", rates.length);
}

const verify = (await ref.get()).data();
console.log(
  JSON.stringify(
    {
      id: ref.id,
      name: verify.name,
      slug: verify.slug,
      active: verify.active,
      isListingBoat: verify.isListingBoat,
      photos: verify.photos,
      experienceIds: verify.experienceIds,
    },
    null,
    2
  )
);
