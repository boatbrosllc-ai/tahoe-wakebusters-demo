/**
 * Seed six Firestore CMS blog posts (SEO cluster articles).
 * Run from project root: node scripts/seed-blog-posts.mjs
 *
 * Requires dev server: npm run dev
 * Requires ENABLE_SEED_ENDPOINT=true in .env.local
 * Requires admin session cookie OR run from admin after login.
 *
 * For local dev without cookies, set ENABLE_SEED_ENDPOINT=true and use admin UI,
 * or curl with Cookie header from a logged-in /admin session.
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

const url = baseUrl + "/api/admin/seed/blog";
const overwrite = process.argv.includes("--overwrite");

async function main() {
  console.log("Seeding blog posts via", url, overwrite ? "(overwrite)" : "...");
  console.warn(
    "Requires ENABLE_SEED_ENDPOINT=true and admin session cookie. Skips existing slugs unless --overwrite."
  );
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overwrite }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      console.log("Done.", data.count, "posts defined.");
      for (const r of data.results ?? []) {
        console.log(" ", r.slug, "→", r.action, r.id);
      }
      process.exit(0);
    }
    console.error("Seed failed:", data.error || data.detail || res.statusText);
    if (res.status === 401 || res.status === 403) {
      console.error("");
      console.error("Sign in at /admin/login, or set ENABLE_SEED_ENDPOINT=true in .env.local.");
      console.error("Production also requires body.confirmPhrase matching SEED_CONFIRM_PHRASE.");
    }
    process.exit(1);
  } catch (err) {
    if (err.cause?.code === "ECONNREFUSED" || err.message?.includes("fetch")) {
      console.error("Could not reach the app. Start with: npm run dev");
    } else {
      console.error(err.message || err);
    }
    process.exit(1);
  }
}

main();
