/**
 * One-time: build boat-bros-service-account.json from your .env.local so the app can connect to Firestore.
 * Run from project root: node scripts/create-service-account-from-env.js
 * Requires .env.local with FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.
 */
const fs = require("fs");
const path = require("path");

const envPath = path.join(process.cwd(), ".env.local");
if (!fs.existsSync(envPath)) {
  console.error(".env.local not found. Create it with FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.");
  process.exit(1);
}

const raw = fs.readFileSync(envPath, "utf8");

function getEnv(name) {
  const match = raw.match(new RegExp("^" + name + "\\s*=\\s*\"([^\"]*)\"", "m"));
  if (match) return match[1];
  const match2 = raw.match(new RegExp("^" + name + "\\s*=\\s*(.+)$", "m"));
  if (match2) return match2[1].trim();
  return undefined;
}

// Get full FIREBASE_PRIVATE_KEY (quoted value can span lines in file)
const keyMatch = raw.match(/FIREBASE_PRIVATE_KEY\s*=\s*"((?:[^"\\]|\\.)*)"/s);
const privateKeyRaw = keyMatch ? keyMatch[1] : getEnv("FIREBASE_PRIVATE_KEY");
const privateKey = privateKeyRaw ? privateKeyRaw.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim() : undefined;

const projectId = getEnv("FIREBASE_PROJECT_ID");
const clientEmail = getEnv("FIREBASE_CLIENT_EMAIL");

if (!projectId || !clientEmail || !privateKey) {
  console.error(".env.local must have FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.");
  process.exit(1);
}

const serviceAccount = {
  type: "service_account",
  project_id: projectId,
  private_key_id: "",
  private_key: privateKey,
  client_email: clientEmail,
  client_id: "",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(clientEmail)}`,
};

const outPath = path.join(process.cwd(), "boat-bros-service-account.json");
fs.writeFileSync(outPath, JSON.stringify(serviceAccount, null, 2), "utf8");
console.log("Created", outPath);
console.log("Restart your dev server; the app will use this file to connect to Firestore.");
