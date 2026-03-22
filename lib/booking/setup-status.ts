/**
 * Server-side setup status for the booking system (cold start).
 * Used by /admin to show what's configured and whether experiences are seeded.
 */

import { getDb } from "@/lib/booking/firebase-admin";
import { hasFirebaseConfig } from "@/lib/booking/env";

export interface SetupStatus {
  firebaseConfigured: boolean;
  firebaseConnected: boolean;
  firebaseError?: string;
  experienceCount: number;
  stripeConfigured: boolean;
  brevoConfigured: boolean;
  appBaseUrlConfigured: boolean;
  /** When false, receipt tokens, manage links, and release tokens are degraded or unavailable. */
  manageBookingSecretConfigured: boolean;
  ready: boolean;
}

function env(name: string): boolean {
  const v = process.env[name];
  return v != null && v.trim() !== "";
}

export async function getSetupStatus(): Promise<SetupStatus> {
  let firebaseConfigured = false;
  try {
    firebaseConfigured = hasFirebaseConfig();
  } catch {
    firebaseConfigured = false;
  }
  let firebaseConnected = false;
  let firebaseError: string | undefined;
  let experienceCount = 0;

  if (firebaseConfigured) {
    try {
      const db = getDb();
      const snap = await db.collection("experiences").get();
      firebaseConnected = true;
      experienceCount = snap.size;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const code = (e as { code?: number }).code;
      if (code === 8 || /quota exceeded|RESOURCE_EXHAUSTED/i.test(msg)) {
        firebaseError =
          "Firestore quota exceeded. Wait a few minutes and try again, or upgrade your Firestore plan in the Firebase Console.";
      } else {
        firebaseError = msg;
      }
    }
  }

  const stripeConfigured = env("STRIPE_SECRET_KEY") && env("STRIPE_WEBHOOK_SECRET");
  const brevoConfigured = env("BREVO_API_KEY");
  const appBaseUrlConfigured = env("APP_BASE_URL");
  const manageBookingSecretConfigured = env("MANAGE_BOOKING_SECRET");

  const ready =
    firebaseConfigured &&
    firebaseConnected &&
    experienceCount > 0 &&
    stripeConfigured &&
    brevoConfigured &&
    appBaseUrlConfigured &&
    manageBookingSecretConfigured;

  return {
    firebaseConfigured,
    firebaseConnected,
    firebaseError,
    experienceCount,
    stripeConfigured,
    brevoConfigured,
    appBaseUrlConfigured,
    manageBookingSecretConfigured,
    ready,
  };
}
