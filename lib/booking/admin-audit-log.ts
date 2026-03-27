import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";

type AdminAuditPayload = Record<string, unknown>;

function truncateValue(value: unknown): unknown {
  if (typeof value === "string") return value.slice(0, 300);
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => truncateValue(v));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 20)) {
      out[k] = truncateValue(v);
    }
    return out;
  }
  return String(value).slice(0, 300);
}

export async function writeAdminAuditLog(action: string, payload: AdminAuditPayload): Promise<void> {
  try {
    const db = getDb();
    const { Timestamp } = getFirestoreExports();
    await db.collection("adminAuditLog").add({
      action: action.slice(0, 80),
      payload: truncateValue(payload),
      createdAt: Timestamp.now(),
    });
  } catch (err) {
    console.error("[admin-audit-log] write failed", err);
  }
}
