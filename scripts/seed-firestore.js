/**
 * Seed Firestore with 4 experiences, rates, and add-ons.
 * Run from project root: node scripts/seed-firestore.js [SEED_SECRET]
 *
 * Seeding is POST /api/admin/seed/experiences and requires an **admin session** (middleware + Firebase admin cookie).
 * Use the admin dashboard seed action, or curl with a session cookie after signing in at /admin/login.
 * Bearer-only seed URLs under /api/booking/ were removed.
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
let rawEnv = "";
if (fs.existsSync(envPath)) {
  rawEnv = fs.readFileSync(envPath, "utf8");
  const appBase = getEnv("APP_BASE_URL", rawEnv);
  if (appBase) baseUrl = appBase.replace(/\/$/, "");
}

const url = baseUrl + "/api/admin/seed/experiences";

async function main() {
  console.log("Seeding Firestore via", url, "...");
  console.warn(
    "Note: this endpoint requires admin session cookies. If this returns 401, use the admin dashboard seed UI or curl with Cookie from a logged-in browser."
  );
  const headers = { "Content-Type": "application/json" };
  try {
    const res = await fetch(url, { method: "POST", headers });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      console.log("Done. " + (data.experienceIds?.length ?? 0) + " experience(s) set up.");
      console.log("Refresh /admin or open an experience page to see the calendar.");
      process.exit(0);
    }
    const msg = data.detail || data.error || res.statusText;
    if (res.status === 401 && !seedSecret) {
      console.error("Seed failed: endpoint returned 401 Unauthorized.");
      console.error("");
      console.error("The seed endpoint requires SEED_SECRET when the server has it set.");
      console.error("Pass the secret as an argument: node scripts/seed-firestore.js <SEED_SECRET>");
      console.error("Or set SEED_SECRET in .env.local and run again.");
      process.exit(1);
    }
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
