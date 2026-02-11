/**
 * One-time: extract private_key from Firebase service account JSON into firebase-private-key.pem.
 * Run: node scripts/extract-firebase-key.js path/to/serviceAccountKey.json
 * Then set FIREBASE_PRIVATE_KEY_PATH=./firebase-private-key.pem in .env.local
 */
const fs = require("fs");
const path = require("path");

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error("Usage: node scripts/extract-firebase-key.js <path-to-service-account.json>");
  process.exit(1);
}

const raw = fs.readFileSync(path.resolve(process.cwd(), jsonPath), "utf8");
const json = JSON.parse(raw);
const key = json.private_key;
if (!key || typeof key !== "string") {
  console.error("JSON has no private_key string.");
  process.exit(1);
}

const pem = key.replace(/\\n/g, "\n");
const outPath = path.join(process.cwd(), "firebase-private-key.pem");
fs.writeFileSync(outPath, pem, "utf8");
console.log("Wrote", outPath);
console.log("In .env.local set: FIREBASE_PRIVATE_KEY_PATH=./firebase-private-key.pem");
