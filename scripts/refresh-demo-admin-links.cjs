/**
 * Refresh password-reset links for demo admins against APP_BASE_URL.
 */
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

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

async function main() {
  const env = loadEnvLocal();
  const base = (process.argv[2] || env.APP_BASE_URL || "http://localhost:3000").replace(
    /\/$/,
    ""
  );
  const saPath = path.isAbsolute(env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH)
    ? env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH
    : path.join(process.cwd(), env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH);
  const sa = JSON.parse(fs.readFileSync(saPath, "utf8"));
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: env.FIREBASE_PROJECT_ID,
    });
  }
  const auth = admin.auth();
  const continueUrl = `${base}/admin/login`;
  const superEmail = env.ADMIN_EMAIL.split(",")[0].trim();
  const clientEmail = "tahoewakebusters@gmail.com";
  const superReset = await auth.generatePasswordResetLink(superEmail, {
    url: continueUrl,
    handleCodeInApp: false,
  });
  const clientReset = await auth.generatePasswordResetLink(clientEmail, {
    url: continueUrl,
    handleCodeInApp: false,
  });
  const outPath = path.join(process.cwd(), ".tmp-verify", "demo-admin-credentials.txt");
  const body = [
    "Tahoe Wakebusters demo admin access",
    `Generated: ${new Date().toISOString()}`,
    `Continue URL: ${continueUrl}`,
    "",
    "YOUR SUPER ADMIN",
    `  email: ${superEmail}`,
    `  reset: ${superReset}`,
    "",
    "CLIENT OPERATOR (send this)",
    `  email: ${clientEmail}`,
    `  role: operator`,
    `  login: ${base}/admin/login`,
    `  reset: ${clientReset}`,
    "",
    "After opening the reset link, set a password and sign in.",
  ].join("\n");
  fs.writeFileSync(outPath, body, "utf8");
  console.log("Updated", outPath);
  console.log("Login:", `${base}/admin/login`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
