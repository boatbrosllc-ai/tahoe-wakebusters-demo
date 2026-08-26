/**
 * One-shot demo admin provisioner for Tahoe Wakebusters.
 * Creates Super Admin + client operator in Firebase Auth + adminTeam,
 * and prints password-reset links (do not commit output).
 *
 * Usage: node scripts/provision-demo-admin.mjs
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const admin = require("firebase-admin");

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  const raw = fs.readFileSync(envPath, "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function setEnvLocalKeys(updates) {
  const envPath = path.join(process.cwd(), ".env.local");
  let raw = fs.readFileSync(envPath, "utf8");
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    if (re.test(raw)) raw = raw.replace(re, line);
    else raw = `${raw.replace(/\s*$/, "")}\n${line}\n`;
  }
  fs.writeFileSync(envPath, raw, "utf8");
}

async function ensureUser(auth, email, displayName) {
  try {
    const existing = await auth.getUserByEmail(email);
    return { user: existing, created: false };
  } catch (err) {
    if (err.code !== "auth/user-not-found") throw err;
    const password = crypto.randomBytes(18).toString("base64url");
    const user = await auth.createUser({
      email,
      password,
      displayName,
      emailVerified: true,
      disabled: false,
    });
    return { user, created: true, password };
  }
}

async function main() {
  const env = loadEnvLocal();
  const projectId = env.FIREBASE_PROJECT_ID || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const saPath = env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH;
  if (!projectId || !saPath) {
    throw new Error("Need FIREBASE_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT_JSON_PATH in .env.local");
  }
  const absSa = path.isAbsolute(saPath) ? saPath : path.join(process.cwd(), saPath);
  const sa = JSON.parse(fs.readFileSync(absSa, "utf8"));

  const SUPER_ADMIN = "usalandspecialist@gmail.com";
  const CLIENT_OPERATOR = "tahoewakebusters@gmail.com";
  const APP_BASE = (env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

  const edge =
    env.ADMIN_EDGE_SECRET && env.ADMIN_EDGE_SECRET.length >= 32
      ? env.ADMIN_EDGE_SECRET
      : crypto.randomBytes(32).toString("hex");
  const seed =
    env.SEED_SECRET && env.SEED_SECRET.length >= 16
      ? env.SEED_SECRET
      : crypto.randomBytes(24).toString("hex");

  setEnvLocalKeys({
    ADMIN_EMAIL: SUPER_ADMIN,
    APP_BASE_URL: APP_BASE,
    NEXT_PUBLIC_SITE_URL: APP_BASE,
    ADMIN_EDGE_SECRET: edge,
    SEED_SECRET: seed,
    CONTACT_EMAIL: CLIENT_OPERATOR,
  });

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId,
    });
  }
  const auth = admin.auth();
  const db = admin.firestore();

  const superRes = await ensureUser(auth, SUPER_ADMIN, "Slipstack Demo Admin");
  const clientRes = await ensureUser(auth, CLIENT_OPERATOR, "Tahoe Wakebusters");

  const now = admin.firestore.Timestamp.now();
  await db.collection("adminTeam").doc(CLIENT_OPERATOR.toLowerCase()).set(
    {
      email: CLIENT_OPERATOR.toLowerCase(),
      name: "Tahoe Wakebusters",
      role: "operator",
      status: "active",
      invitedBy: SUPER_ADMIN.toLowerCase(),
      invitedAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  const continueUrl = `${APP_BASE}/admin/login`;
  const superReset = await auth.generatePasswordResetLink(SUPER_ADMIN, {
    url: continueUrl,
    handleCodeInApp: false,
  });
  const clientReset = await auth.generatePasswordResetLink(CLIENT_OPERATOR, {
    url: continueUrl,
    handleCodeInApp: false,
  });

  const outPath = path.join(process.cwd(), ".tmp-verify", "demo-admin-credentials.txt");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const body = [
    "Tahoe Wakebusters demo admin provision",
    `Firebase project: ${projectId}`,
    `Generated: ${new Date().toISOString()}`,
    "",
    "SUPER ADMIN (you)",
    `  email: ${SUPER_ADMIN}`,
    `  created_now: ${superRes.created}`,
    superRes.password ? `  temp_password: ${superRes.password}` : "  temp_password: (existing user — use reset link)",
    `  reset_link: ${superReset}`,
    "",
    "CLIENT OPERATOR (send to Wakebusters)",
    `  email: ${CLIENT_OPERATOR}`,
    `  role: operator`,
    `  created_now: ${clientRes.created}`,
    clientRes.password ? `  temp_password: ${clientRes.password}` : "  temp_password: (existing user — use reset link)",
    `  reset_link: ${clientReset}`,
    "",
    "Login URL (local): http://localhost:3000/admin/login",
    "Login URL (replace after deploy): https://<netlify-url>/admin/login",
    "",
    "DO NOT COMMIT THIS FILE.",
  ].join("\n");
  fs.writeFileSync(outPath, body, "utf8");

  console.log("Provisioned.");
  console.log(`  Super Admin: ${SUPER_ADMIN} (created=${superRes.created})`);
  console.log(`  Operator:    ${CLIENT_OPERATOR} (created=${clientRes.created})`);
  console.log(`  Wrote credentials to ${outPath}`);
  console.log("  Updated .env.local ADMIN_EMAIL / secrets / APP_BASE_URL");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
