/**
 * Booking engine environment variables.
 * All must be set for the booking flow to work; validated at runtime where used.
 */

function getEnv(name: string): string | undefined {
  return process.env[name];
}

function normalizePemKey(key: string): string {
  let s = key.trim();
  // Strip any leading/trailing quotes (Netlify or UI may add one or both)
  s = s.replace(/^["'\s]+/, "").replace(/["'\s]+$/, "").trim();
  // Convert literal \n (two chars) to real newlines; repeat to handle double-escaped
  while (s.includes("\\n")) {
    s = s.replace(/\\n/g, "\n");
  }
  s = s.replace(/\r\n/g, "\n").trim();
  // Some env systems turn newlines into spaces: restore newline before ----- lines
  if (s.includes(" -----") && !s.includes("\n-----")) {
    s = s.replace(/ -----/g, "\n-----");
  }
  return s.trim();
}

/** When process.env truncates the key (e.g. multi-line .env), read full value from .env.local */
function readFirebasePrivateKeyFromEnvFile(): string | undefined {
  try {
    const path = require("path") as typeof import("path");
    const fs = require("fs") as typeof import("fs");
    const envPath = path.join(process.cwd(), ".env.local");
    const raw = fs.readFileSync(envPath, "utf8");
    // Value between quotes; can contain \n and \"; [^"\\] matches newline too
    const match = raw.match(/FIREBASE_PRIVATE_KEY\s*=\s*"((?:[^"\\]|\\.)*)"/);
    if (!match) return undefined;
    return normalizePemKey(match[1]);
  } catch {
    return undefined;
  }
}

function requireEnv(name: string): string {
  const v = getEnv(name);
  if (v == null || v === "") {
    throw new Error(`Missing required env: ${name}`);
  }
  return v;
}

export const bookingEnv = {
  get firebaseProjectId(): string | undefined {
    return getEnv("FIREBASE_PROJECT_ID");
  },
  /** Override Storage bucket name (e.g. my-project.firebasestorage.app). If unset, uses {projectId}.appspot.com. Set this if you get "bucket does not exist" after enabling Storage. */
  get firebaseStorageBucket(): string | undefined {
    const v = getEnv("FIREBASE_STORAGE_BUCKET");
    return v == null || v === "" ? undefined : v.trim();
  },
  get firebaseClientEmail(): string | undefined {
    return getEnv("FIREBASE_CLIENT_EMAIL");
  },
  /** Path to service account JSON file (avoids .env key encoding/truncation). Preferred over FIREBASE_PRIVATE_KEY. */
  get firebaseServiceAccountPath(): string | undefined {
    const p = getEnv("FIREBASE_SERVICE_ACCOUNT_JSON_PATH") || getEnv("GOOGLE_APPLICATION_CREDENTIALS");
    return p == null || p === "" ? undefined : p;
  },
  get firebasePrivateKey(): string | undefined {
    const keyPath = getEnv("FIREBASE_PRIVATE_KEY_PATH");
    if (keyPath) {
      // Read full PEM from file (avoids .env truncation of multi-line values)
      const path = require("path") as typeof import("path");
      const fs = require("fs") as typeof import("fs");
      const resolved = path.isAbsolute(keyPath) ? keyPath : path.join(process.cwd(), keyPath);
      const raw = fs.readFileSync(resolved, "utf8");
      const out = normalizePemKey(raw);
      return out;
    }
    let k = getEnv("FIREBASE_PRIVATE_KEY");
    if (!k) return undefined;
    let out = normalizePemKey(k);
    // If env loader truncated (multi-line .env often keeps only first line), read full key from .env.local
    if (out.length < 200 || !out.includes("-----END")) {
      const fromFile = readFirebasePrivateKeyFromEnvFile();
      if (fromFile && fromFile.length >= 200 && fromFile.includes("-----END")) {
        out = fromFile;
      } else {
        throw new Error(
          "FIREBASE_PRIVATE_KEY is truncated (multi-line .env often keeps only the first line). " +
            "Use either: (1) FIREBASE_PRIVATE_KEY_PATH=./path/to/key.pem and put the full PEM in that file, or " +
            "(2) Put the entire key on one line in .env with literal \\n for newlines."
        );
      }
    }
    if (!out.startsWith("-----BEGIN") || !out.includes("-----END")) {
      throw new Error(
        "FIREBASE_PRIVATE_KEY is invalid: must be the full PEM (starts with -----BEGIN PRIVATE KEY-----). In Netlify use one line with \\n for newlines, no surrounding quotes."
      );
    }
    return out;
  },
  get stripeSecretKey(): string {
    return requireEnv("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret(): string {
    return requireEnv("STRIPE_WEBHOOK_SECRET");
  },
  get brevoApiKey(): string {
    return requireEnv("BREVO_API_KEY");
  },
  get brevoBookingTemplateId(): number | undefined {
    const v = getEnv("BREVO_TEMPLATE_ID_BOOKING_CONFIRMATION") ?? getEnv("BREVO_BOOKING_TEMPLATE_ID");
    if (v == null || v === "") return undefined;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? undefined : n;
  },
  get brevoMarketingListId(): number | undefined {
    const v = getEnv("BREVO_LIST_ID_MARKETING") ?? getEnv("BREVO_MARKETING_LIST_ID");
    if (v == null || v === "") return undefined;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? undefined : n;
  },
  get appBaseUrl(): string {
    return requireEnv("APP_BASE_URL").replace(/\/$/, "");
  },
  /** Secret for signing/verifying manage-booking links (HMAC). Set for 50/50 manage flow. */
  get manageBookingSecret(): string | undefined {
    const v = getEnv("MANAGE_BOOKING_SECRET");
    return v == null || v === "" ? undefined : v;
  },
};

export function hasFirebaseConfig(): boolean {
  if (bookingEnv.firebaseServiceAccountPath) return true;
  return !!(
    bookingEnv.firebaseProjectId &&
    bookingEnv.firebaseClientEmail &&
    bookingEnv.firebasePrivateKey
  );
}

/** Safe check for admin/API routes: returns false if config is missing or getter throws (e.g. truncated key). */
export function safeHasFirebaseConfig(): boolean {
  try {
    return hasFirebaseConfig();
  } catch {
    return false;
  }
}

/** Status of Firebase env (no secrets). Use to show users why config failed (e.g. on Netlify). */
export type FirebaseConfigStatus = {
  projectIdSet: boolean;
  clientEmailSet: boolean;
  serviceAccountPathSet: boolean;
  privateKeyStatus: "ok" | "missing" | "truncated" | "invalid" | "file_missing";
  summary: string;
};

export function getFirebaseConfigStatus(): FirebaseConfigStatus {
  const projectIdSet = !!(getEnv("FIREBASE_PROJECT_ID") ?? "").trim();
  const clientEmailSet = !!(getEnv("FIREBASE_CLIENT_EMAIL") ?? "").trim();
  const serviceAccountPathSet = !!(bookingEnv.firebaseServiceAccountPath ?? "").trim();
  let privateKeyStatus: FirebaseConfigStatus["privateKeyStatus"] = "missing";
  try {
    if (serviceAccountPathSet) {
      const path = require("path") as typeof import("path");
      const fs = require("fs") as typeof import("fs");
      const resolved = path.isAbsolute(bookingEnv.firebaseServiceAccountPath!)
        ? bookingEnv.firebaseServiceAccountPath!
        : path.join(process.cwd(), bookingEnv.firebaseServiceAccountPath!);
      if (!fs.existsSync(resolved)) {
        privateKeyStatus = "file_missing";
      } else {
        privateKeyStatus = "ok";
      }
    } else {
      const k = getEnv("FIREBASE_PRIVATE_KEY");
      if (!k || !k.trim()) {
        privateKeyStatus = "missing";
      } else {
        const out = normalizePemKey(k);
        if (out.length < 200 || !out.includes("-----END")) {
          const fromFile = readFirebasePrivateKeyFromEnvFile();
          if (fromFile && fromFile.length >= 200 && fromFile.includes("-----END")) privateKeyStatus = "ok";
          else privateKeyStatus = "truncated";
        } else if (!out.startsWith("-----BEGIN") || !out.includes("-----END")) {
          privateKeyStatus = "invalid";
        } else {
          privateKeyStatus = "ok";
        }
      }
    }
  } catch {
    privateKeyStatus = "invalid";
  }
  const usePath = serviceAccountPathSet && privateKeyStatus === "ok";
  const useVars = projectIdSet && clientEmailSet && privateKeyStatus === "ok";
  const summary = usePath || useVars
    ? "ok"
    : serviceAccountPathSet && privateKeyStatus === "file_missing"
      ? "FIREBASE_SERVICE_ACCOUNT_JSON_PATH is set but the file does not exist at runtime (e.g. on Netlify). Use FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY instead."
      : !projectIdSet || !clientEmailSet
        ? "Set FIREBASE_PROJECT_ID and FIREBASE_CLIENT_EMAIL (and FIREBASE_PRIVATE_KEY, or FIREBASE_SERVICE_ACCOUNT_JSON_PATH)."
        : privateKeyStatus === "truncated"
          ? "FIREBASE_PRIVATE_KEY is truncated. On Netlify use one line with \\n for newlines (e.g. -----BEGIN PRIVATE KEY-----\\nMIIE...\\n-----END PRIVATE KEY-----\\n). No quotes."
          : privateKeyStatus === "invalid"
            ? "FIREBASE_PRIVATE_KEY is invalid. Use the full PEM on one line with \\n for newlines."
            : "Set FIREBASE_PRIVATE_KEY (or FIREBASE_SERVICE_ACCOUNT_JSON_PATH).";
  return {
    projectIdSet,
    clientEmailSet,
    serviceAccountPathSet,
    privateKeyStatus,
    summary,
  };
}

export function hasStripeConfig(): boolean {
  try {
    bookingEnv.stripeSecretKey;
    return true;
  } catch {
    return false;
  }
}
