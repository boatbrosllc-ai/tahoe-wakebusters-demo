/**
 * Firebase Admin SDK — server-side only.
 * Loads firebase-admin via require() at runtime (serverComponentsExternalPackages in next.config keeps it external).
 * Initialize with service account (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY).
 */
import "server-only";

import { bookingEnv, hasFirebaseConfig } from "./env";

type AdminModule = typeof import("firebase-admin");
let _admin: AdminModule | null = null;
let _app: import("firebase-admin").app.App | null = null;

function getAdminSync(): AdminModule {
  if (_admin) return _admin;
  try {
    // Literal string so Webpack can statically externalize (serverComponentsExternalPackages).
    // Dynamic require/resolve gets replaced by webpackEmptyContext and throws at runtime.
    _admin = require("firebase-admin") as AdminModule;
    return _admin;
  } catch (e) {
    throw e;
  }
}

export function getFirebaseApp(): import("firebase-admin").app.App {
  if (_app) return _app;
  const admin = getAdminSync();
  const existing = admin.apps[0];
  if (existing) {
    _app = existing as import("firebase-admin").app.App;
    return _app;
  }
  /** Firestore emulator: Admin SDK does not need a service account; never set this in production. */
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST?.trim();
  if (emulatorHost) {
    const projectId = bookingEnv.firebaseProjectId?.trim() || "demo-test";
    _app = admin.initializeApp({ projectId });
    return _app;
  }
  const hasConfig = hasFirebaseConfig();
  if (!hasConfig) {
    throw new Error(
      "Firebase config missing. Set FIREBASE_SERVICE_ACCOUNT_JSON_PATH (path to service account JSON) or FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY."
    );
  }
  try {
    const serviceAccountPath = bookingEnv.firebaseServiceAccountPath;
    const pathMod = require("path") as typeof import("path");
    let projectId = bookingEnv.firebaseProjectId;
    let credential: import("firebase-admin").credential.Credential;
    if (serviceAccountPath != null) {
      const resolvedPath = pathMod.isAbsolute(serviceAccountPath) ? serviceAccountPath : pathMod.join(process.cwd(), serviceAccountPath);
      const fs = require("fs") as typeof import("fs");
      const json = JSON.parse(fs.readFileSync(resolvedPath, "utf8")) as { project_id?: string; client_email?: string; private_key?: string };
      if (!projectId && json.project_id) projectId = json.project_id;
      credential = admin.credential.cert(json as import("firebase-admin").ServiceAccount);
    } else {
      credential = admin.credential.cert({
        projectId: bookingEnv.firebaseProjectId,
        clientEmail: bookingEnv.firebaseClientEmail,
        privateKey: bookingEnv.firebasePrivateKey,
      });
    }
    const storageBucket =
      bookingEnv.firebaseStorageBucket ||
      (projectId ? `${projectId}.appspot.com` : undefined);
    _app = admin.initializeApp({
      credential,
      storageBucket,
    });
    return _app;
  } catch (e) {
    throw e;
  }
}

export function getDb(): import("firebase-admin").firestore.Firestore {
  return getFirebaseApp().firestore();
}

/**
 * Production startup: verify Admin SDK can reach Firestore (not just env parsing).
 * Call from instrumentation so misconfiguration fails deploy/startup instead of first customer request.
 */
export async function assertFirebaseAdminReachableForProduction(): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  const db = getDb();
  await db.collection("experiences").limit(1).get();
}

/** Firebase Storage bucket for uploads (e.g. boat photos). Uses FIREBASE_STORAGE_BUCKET at call time so .env changes apply without restart. */
export function getStorageBucket() {
  const app = getFirebaseApp();
  const fromEnv = bookingEnv.firebaseStorageBucket;
  const projectId = bookingEnv.firebaseProjectId;
  const bucketName =
    fromEnv ||
    (projectId ? `${projectId}.firebasestorage.app` : undefined) ||
    (projectId ? `${projectId}.appspot.com` : undefined);
  return app.storage().bucket(bucketName ?? undefined);
}

/** Use getFirestoreExports().FieldValue and .Timestamp in API routes. */
export function getFirestoreExports(): {
  FieldValue: typeof import("firebase-admin").firestore.FieldValue;
  Timestamp: typeof import("firebase-admin").firestore.Timestamp;
} {
  const admin = getAdminSync();
  return {
    FieldValue: admin.firestore.FieldValue,
    Timestamp: admin.firestore.Timestamp,
  };
}
