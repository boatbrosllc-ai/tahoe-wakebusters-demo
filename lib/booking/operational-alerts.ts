/**
 * Best-effort operational alerts for admin dashboards (payment edge cases, etc.).
 */

import { createHash } from "crypto";
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

/** Deterministic id so repeated alerts (e.g. client polls) collapse to one document. */
export function operationalAlertDedupeDocId(parts: string[]): string {
  const h = createHash("sha256").update(parts.join("|")).digest("hex");
  return `oa_${h.slice(0, 48)}`;
}

/** Writes only once per `docId` — use with {@link operationalAlertDedupeDocId} for stable keys. */
export async function writeOperationalAlertIfNewDocId(docId: string, alert: OperationalAlertInput): Promise<void> {
  try {
    const db = getDb();
    const { Timestamp } = getFirestoreExports();
    const ref = db.collection("operationalAlerts").doc(docId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) return;
      tx.set(ref, { ...alert, createdAt: Timestamp.now() });
    });
  } catch (e) {
    console.error("[operational-alerts] writeOperationalAlertIfNewDocId failed", e);
  }
}
