/**
 * Seed Firestore with 4 experiences, rates, and add-ons.
 * Run from project root: node scripts/seed-firestore.js
 *
 * Requires the dev server to be running first: npm run dev
 * Then in another terminal: node scripts/seed-firestore.js
 *
 * Or add to package.json: "seed": "node scripts/seed-firestore.js"
 * Then: npm run dev (terminal 1), npm run seed (terminal 2)
 */

const fs = require("fs");
const path = require("path");

function getEnv(name, raw) {
  const match = raw.match(new RegExp("^" + name + "\\s*=\\s*\"([^\"]*)\"", "m"));
  if (match) return match[1];
  const match2 = raw.match(new RegExp("^" + name + "\\s*=\\s*(.+)$", "m"));
  if (match2) return match2[1].trim();
  return undefined;
}

const envPath = path.join(process.cwd(), ".env.local");
let baseUrl = "http://localhost:3000";
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, "utf8");
  const appBase = getEnv("APP_BASE_URL", raw);
  if (appBase) baseUrl = appBase.replace(/\/$/, "");
}

const url = baseUrl + "/api/booking/seed-experiences";

async function main() {
  console.log("Seeding Firestore via", url, "...");
  try {
    const res = await fetch(url, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      console.log("Done. " + (data.experienceIds?.length ?? 0) + " experience(s) set up.");
      console.log("Refresh /admin or open an experience page to see the calendar.");
      process.exit(0);
    }
    const msg = data.detail || data.error || res.statusText;
    console.error("Seed failed:", msg);
    if (/quota exceeded|RESOURCE_EXHAUSTED|code.*8/i.test(String(msg))) {
      console.error("");
      console.error("Firestore quota is exceeded (daily limit or plan limit).");
      console.error("  • Use the Firestore emulator (no quota): see docs/BOOKING_SETUP.md → 'Alternative: Firestore Emulator'.");
      console.error("  • Or wait for daily reset / upgrade your Firestore plan, then run: npm run seed");
    }
    process.exit(1);
  } catch (err) {
    if (err.cause?.code === "ECONNREFUSED" || err.message?.includes("fetch")) {
      console.error("Could not reach the app. Is the dev server running?");
      console.error("Start it with: npm run dev");
      console.error("Then run this script again: node scripts/seed-firestore.js");
    } else {
      console.error(err.message || err);
    }
    process.exit(1);
  }
}

main();
