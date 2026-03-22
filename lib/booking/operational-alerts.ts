/**
 * Best-effort operational alerts for admin dashboards (payment edge cases, etc.).
 */

import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";

export type OperationalAlertInput = {
  type: string;
  paymentIntentId?: string;
  holdId?: string;
  amount?: number;
  currency?: string;
  sessionId?: string;
  source?: string;
  [key: string]: unknown;
};

export async function writeOperationalAlert(alert: OperationalAlertInput): Promise<void> {
  try {
    const db = getDb();
    const { Timestamp } = getFirestoreExports();
    await db.collection("operationalAlerts").add({
      ...alert,
      createdAt: Timestamp.now(),
    });
  } catch (e) {
    console.error("[operational-alerts] write failed", e);
  }
}
