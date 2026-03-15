/**
 * One-time: set the admin (Firebase Auth) password.
 * Run from project root. Requires .env.local with FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.
 *
 * Usage: node scripts/set-admin-password.js <adminEmail> <newPassword>
 * Both arguments are required. Never use default credentials.
 */

const fs = require("fs");
const path = require("path");

const envPath = path.join(process.cwd(), ".env.local");
if (!fs.existsSync(envPath)) {
  console.error(".env.local not found. Create it with FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.");
  process.exit(1);
}

const adminEmail = process.argv[2]?.trim();
const password = process.argv[3];

if (!adminEmail || !password) {
  console.error("Usage: node scripts/set-admin-password.js <adminEmail> <newPassword>");
  console.error("Both admin email and new password are required. Do not use default credentials.");
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

const keyMatch = raw.match(/FIREBASE_PRIVATE_KEY\s*=\s*"((?:[^"\\]|\\.)*)"/s);
const privateKeyRaw = keyMatch ? keyMatch[1] : getEnv("FIREBASE_PRIVATE_KEY");
const privateKey = privateKeyRaw ? privateKeyRaw.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim() : undefined;

const projectId = getEnv("FIREBASE_PROJECT_ID");
const clientEmail = getEnv("FIREBASE_CLIENT_EMAIL");

if (!projectId || !clientEmail || !privateKey) {
  console.error(".env.local must have FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.");
  process.exit(1);
}

async function main() {
  const admin = require("firebase-admin");
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }
  const auth = admin.auth();

  try {
    const user = await auth.getUserByEmail(adminEmail);
    await auth.updateUser(user.uid, { password });
    console.log("Password updated for", adminEmail);
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      await auth.createUser({
        email: adminEmail,
        password,
        emailVerified: true,
      });
      console.log("User created and password set for", adminEmail);
    } else {
      throw err;
    }
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err.message || err);
    process.exit(1);
  }
);
