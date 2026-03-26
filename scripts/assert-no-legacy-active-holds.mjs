/**
 * Guardrail before re-enabling hard canonical experience id assertions at conversion time.
 * Fails when any active hold has a non-canonical experienceId.
 */
import admin from "firebase-admin";

const AUTO_ID_RE = /^[A-Za-z0-9]{20}$/;
const PAGE_SIZE = 500;

function isCanonicalExperienceId(value) {
  return typeof value === "string" && AUTO_ID_RE.test(value.trim());
}

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
let lastDoc = null;
let scanned = 0;
const offenders = [];

while (true) {
  let q = db.collection("holds").where("status", "==", "active").limit(PAGE_SIZE);
  if (lastDoc) q = q.startAfter(lastDoc);
  const snap = await q.get();
  if (snap.empty) break;

  for (const doc of snap.docs) {
    scanned += 1;
    const row = doc.data();
    const expId = row?.experienceId;
    if (!isCanonicalExperienceId(expId)) {
      offenders.push({ holdId: doc.id, experienceId: expId ?? null });
      if (offenders.length >= 25) break;
    }
  }
  if (offenders.length >= 25 || snap.size < PAGE_SIZE) break;
  lastDoc = snap.docs[snap.docs.length - 1];
}

if (offenders.length > 0) {
  console.error("[assert-no-legacy-active-holds] Found active holds with non-canonical experienceId.");
  console.error("Sample offenders:", JSON.stringify(offenders, null, 2));
  process.exit(1);
}

console.log("[assert-no-legacy-active-holds] ok: scanned", scanned, "active holds");
