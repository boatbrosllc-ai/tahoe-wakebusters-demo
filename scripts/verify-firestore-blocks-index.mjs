/**
 * CI guard: ensures firestore.indexes.json defines the base blocks index used by
 * overlap checks (experienceId + startAt). This keeps create-hold operational even
 * if stricter multi-range indexes are still building.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const raw = readFileSync(join(root, "firestore.indexes.json"), "utf8");
const { indexes } = JSON.parse(raw);

const required = indexes?.find(
  (idx) =>
    idx.collectionGroup === "blocks" &&
    Array.isArray(idx.fields) &&
    idx.fields.length === 2 &&
    idx.fields[0]?.fieldPath === "experienceId" &&
    idx.fields[1]?.fieldPath === "startAt"
);

if (!required) {
  console.error(
    "[verify-firestore-blocks-index] Missing required index: blocks (experienceId ASC, startAt ASC). See firestore.indexes.json."
  );
  process.exit(1);
}

console.log("[verify-firestore-blocks-index] OK: blocks (experienceId,startAt) index present.");
