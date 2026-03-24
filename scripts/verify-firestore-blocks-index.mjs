/**
 * CI guard: ensures firestore.indexes.json defines the composite blocks index used by
 * slots/calendar-events overlap query (experienceId + endAt + startAt — Firestore multi-range order). Deploy before release;
 * verify READY in Firebase Console before accepting booking traffic.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const raw = readFileSync(join(root, "firestore.indexes.json"), "utf8");
const { indexes } = JSON.parse(raw);

const triple = indexes?.find(
  (idx) =>
    idx.collectionGroup === "blocks" &&
    Array.isArray(idx.fields) &&
    idx.fields.length === 3 &&
    idx.fields[0]?.fieldPath === "experienceId" &&
    idx.fields[1]?.fieldPath === "endAt" &&
    idx.fields[2]?.fieldPath === "startAt"
);

if (!triple) {
  console.error(
    "[verify-firestore-blocks-index] Missing composite index: blocks (experienceId ASC, endAt ASC, startAt ASC). See firestore.indexes.json."
  );
  process.exit(1);
}

console.log("[verify-firestore-blocks-index] OK: blocks triple-field composite present.");
