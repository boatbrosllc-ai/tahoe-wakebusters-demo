/**
 * Stable QR/kiosk links for waiver templates — Firestore collection waiverQrLinks.
 */

import "server-only";
import { randomUUID } from "crypto";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import type { WaiverQrLink } from "./types";

const COLL = "waiverQrLinks" as const;

export type WaiverQrLinkWithId = WaiverQrLink & { id: string };

export interface CreateWaiverQrLinkInput {
  templateId: string;
  label?: string;
  assignedBoat?: string;
  useCase?: string;
}

export async function createWaiverQrLink(input: CreateWaiverQrLinkInput): Promise<string> {
  const db = getDb();
  const { Timestamp } = getFirestoreExports();
  const now = Timestamp.now();
  const id = randomUUID();
  const doc: WaiverQrLink = {
    templateId: input.templateId.trim(),
    active: true,
    ...(input.label?.trim() ? { label: input.label.trim() } : {}),
    ...(input.assignedBoat?.trim() ? { assignedBoat: input.assignedBoat.trim() } : {}),
    ...(input.useCase?.trim() ? { useCase: input.useCase.trim() } : {}),
    createdAt: now,
    updatedAt: now,
  };
  await db.collection(COLL).doc(id).set(doc);
  return id;
}

export async function getWaiverQrLinkById(id: string): Promise<WaiverQrLinkWithId | null> {
  const rid = typeof id === "string" ? id.trim() : "";
  if (!rid) return null;
  const db = getDb();
  const snap = await db.collection(COLL).doc(rid).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as WaiverQrLink) };
}

export async function listWaiverQrLinksForTemplate(templateId: string): Promise<WaiverQrLinkWithId[]> {
  const tid = typeof templateId === "string" ? templateId.trim() : "";
  if (!tid) return [];
  const db = getDb();
  const snap = await db.collection(COLL).where("templateId", "==", tid).get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as WaiverQrLink) }));
  rows.sort((a, b) => {
    const ta = firestoreTimeToMs(a.createdAt);
    const tb = firestoreTimeToMs(b.createdAt);
    return tb - ta;
  });
  return rows;
}

function firestoreTimeToMs(ts: WaiverQrLink["createdAt"]): number {
  if (ts && typeof ts === "object" && "toDate" in ts && typeof ts.toDate === "function") {
    return ts.toDate().getTime();
  }
  const s = ts as { seconds?: number };
  return (s?.seconds ?? 0) * 1000;
}

export async function updateWaiverQrLink(
  id: string,
  updates: Partial<Pick<WaiverQrLink, "label" | "assignedBoat" | "useCase" | "active">>
): Promise<void> {
  const db = getDb();
  const { Timestamp } = getFirestoreExports();
  const ref = db.collection(COLL).doc(id.trim());
  const patch: Record<string, unknown> = { updatedAt: Timestamp.now() };
  if (updates.label !== undefined) patch.label = updates.label?.trim() ?? "";
  if (updates.assignedBoat !== undefined) patch.assignedBoat = updates.assignedBoat?.trim() ?? "";
  if (updates.useCase !== undefined) patch.useCase = updates.useCase?.trim() ?? "";
  if (updates.active !== undefined) patch.active = updates.active;
  await ref.update(patch);
}
