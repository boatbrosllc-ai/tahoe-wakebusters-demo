/**
 * Read-only Firestore audit for July 4 availability debugging.
 * Usage: node scripts/audit-firestore-july4.mjs [YYYY-MM-DD]
 */
import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const DATE = process.argv[2] || "2026-07-04";

const saPath = path.join(root, "boat-bros-service-account.json");
if (!fs.existsSync(saPath)) {
  console.error("Missing boat-bros-service-account.json");
  process.exit(1);
}
const sa = JSON.parse(fs.readFileSync(saPath, "utf8"));
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id });
}
const db = admin.firestore();
const { Timestamp } = admin.firestore;

const TAKEN = new Set(["paid", "deposit_paid", "final_due", "final_paid", "final_processing"]);

function iso(ts) {
  if (!ts) return null;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toISOString();
}

const dayStart = new Date(`${DATE}T00:00:00-05:00`);
const dayEnd = new Date(`${DATE}T23:59:59-05:00`);

console.log("Project:", sa.project_id);
console.log("Audit date:", DATE);
console.log("---");

const boatsSnap = await db.collection("boats").where("isListingBoat", "==", true).get();
const boats = boatsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
console.log(`Listing boats (${boats.length}):`);
for (const b of boats.sort((a, c) => String(a.name || "").localeCompare(String(c.name || "")))) {
  console.log(
    `  - ${b.id} | ${b.name || "(no name)"} | active: ${b.active} | experienceIds: ${JSON.stringify(b.experienceIds || [])}`
  );
}
const bentlyMatches = boats.filter((b) => /bent/i.test(String(b.name || "")));
console.log("Bently matches:", bentlyMatches.map((b) => `${b.id} = ${b.name}`).join(", ") || "(none)");

console.log(`\n--- Blocks overlapping ${DATE} ---`);
let blocks = [];
try {
  const blocksSnap = await db
    .collection("blocks")
    .where("startAt", "<=", Timestamp.fromDate(dayEnd))
    .limit(300)
    .get();
  blocks = blocksSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((b) => {
      const end = b.endAt?.toDate?.();
      const start = b.startAt?.toDate?.();
      if (!start || !end) return false;
      return start.getTime() <= dayEnd.getTime() && end.getTime() >= dayStart.getTime();
    });
} catch (e) {
  console.error("Blocks query error:", e.message);
}
if (blocks.length === 0) console.log("(no overlapping blocks found)");
for (const b of blocks) {
  const boatName = b.boatId ? boats.find((x) => x.id === b.boatId)?.name ?? "?" : "ALL BOATS";
  console.log(
    JSON.stringify(
      {
        id: b.id,
        experienceId: b.experienceId,
        experienceSlug: b.experienceSlug ?? null,
        boatId: b.boatId ?? null,
        boatName,
        startAt: iso(b.startAt),
        endAt: iso(b.endAt),
        note: b.note ?? null,
      },
      null,
      2
    )
  );
}

console.log(`\n--- Bookings startDateStr ${DATE} (taken statuses) ---`);
const bkSnap = await db.collection("bookings").where("startDateStr", "==", DATE).limit(50).get();
let bookingCount = 0;
for (const d of bkSnap.docs) {
  const b = d.data();
  if (!TAKEN.has(b.status)) continue;
  bookingCount++;
  const boatName = b.boatId ? boats.find((x) => x.id === b.boatId)?.name ?? "?" : null;
  console.log(
    JSON.stringify(
      {
        id: d.id,
        status: b.status,
        boatId: b.boatId ?? null,
        boatName,
        experienceId: b.experienceId,
        slotId: b.slotId ?? b.slot_id ?? null,
      },
      null,
      2
    )
  );
}
if (bookingCount === 0) console.log("(no taken bookings on this date)");

for (const bent of bentlyMatches) {
  console.log(`\n--- Slot docs: ${bent.name} (${bent.id}) on ${DATE} ---`);
  try {
    const slotsSnap = await db
      .collection("boats")
      .doc(bent.id)
      .collection("slots")
      .where("startAt", ">=", Timestamp.fromDate(dayStart))
      .where("startAt", "<=", Timestamp.fromDate(dayEnd))
      .get();
    if (slotsSnap.empty) console.log("(no slot subcollection docs this day)");
    for (const s of slotsSnap.docs) {
      const data = s.data();
      console.log(
        JSON.stringify(
          {
            slotDocId: s.id,
            status: data.status,
            startAt: iso(data.startAt),
            endAt: iso(data.endAt),
          },
          null,
          2
        )
      );
    }
  } catch (e) {
    console.error("Slots query error:", e.message);
  }
}
