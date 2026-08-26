const fs = require("fs");
const path = require("path");

function loadEnvLocal() {
  const raw = fs.readFileSync(".env.local", "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const env = loadEnvLocal();
const saPath = path.isAbsolute(env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH)
  ? env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH
  : path.join(process.cwd(), env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH);
const sa = JSON.parse(fs.readFileSync(saPath, "utf8"));
const base = "https://tahoe-wakebusters-demo.netlify.app";

const keep = [
  "ADMIN_EMAIL",
  "ADMIN_EDGE_SECRET",
  "ADMIN_COOKIE_SECRET",
  "SEED_SECRET",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "BREVO_API_KEY",
  "BREVO_SENDER_EMAIL",
  "CONTACT_EMAIL",
  "CRON_SECRET",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "NEXT_PUBLIC_GA_MEASUREMENT_ID",
];

const lines = [];
for (const k of keep) {
  if (env[k]) lines.push(`${k}=${JSON.stringify(env[k])}`);
}
lines.push(`APP_BASE_URL=${JSON.stringify(base)}`);
lines.push(`NEXT_PUBLIC_SITE_URL=${JSON.stringify(base)}`);
lines.push(`FIREBASE_PRIVATE_KEY=${JSON.stringify(sa.private_key)}`);
lines.push(`FIREBASE_CLIENT_EMAIL=${JSON.stringify(sa.client_email)}`);
lines.push(
  `FIREBASE_PROJECT_ID=${JSON.stringify(sa.project_id || env.FIREBASE_PROJECT_ID)}`
);

fs.writeFileSync("netlify-env-import.env", lines.join("\n") + "\n");
console.log("Wrote", lines.length, "keys");
console.log("STRIPE:", env.STRIPE_SECRET_KEY ? "yes" : "no");
console.log("GA:", env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "missing");
