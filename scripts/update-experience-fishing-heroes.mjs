/**
 * Point Half Day / Full Day heroes at fishing photos (not the boat listing image).
 * Run: node scripts/update-experience-fishing-heroes.mjs
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const sa = JSON.parse(fs.readFileSync(path.join(root, "nasty-sport-fishing-service-account.json"), "utf8"));
if (!getApps().length) initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();

const UPDATES = [
  {
    slug: "pontoon",
    heroMedia: { type: "image", url: "/photos/nsf/yellowfin-marina-duo.png" },
    gallery: [
      "/photos/nsf/yellowfin-marina-duo.png",
      "/photos/stock/charter/anglers-on-boat-pexels.jpg",
      "/photos/nsf/yellowfin-marina-catch.png",
      "/photos/stock/cabo/el-arco-from-boat-pexels.jpg",
    ],
  },
  {
    slug: "watersports",
    heroMedia: { type: "image", url: "/photos/nsf/yellowfin-ocean-duo.png" },
    gallery: [
      "/photos/nsf/yellowfin-ocean-duo.png",
      "/photos/nsf/sailfish-baitball.png",
      "/photos/stock/species/tuna-underwater-bacanek.jpg",
      "/photos/nsf/yellowfin-marina-catch.png",
    ],
  },
];

for (const u of UPDATES) {
  const snap = await db.collection("experiences").where("slug", "==", u.slug).limit(1).get();
  if (snap.empty) {
    console.log("missing", u.slug);
    continue;
  }
  await snap.docs[0].ref.update({
    heroMedia: u.heroMedia,
    gallery: u.gallery,
    updatedAt: FieldValue.serverTimestamp(),
  });
  console.log("updated", u.slug, snap.docs[0].id, u.heroMedia.url);
}
