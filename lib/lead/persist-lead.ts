import { bookingEnv, hasFirebaseConfig } from "@/lib/booking/env";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { upsertBrevoContact } from "@/lib/booking/brevo";
import { emailLookupVariants, normalizeCustomerEmail } from "@/lib/admin/customer-crm";
import type { ParsedLeadCapture } from "@/lib/lead/lead";

export async function persistLead(input: ParsedLeadCapture): Promise<{ id: string | null; stored: boolean }> {
  if (!hasFirebaseConfig()) {
    return { id: null, stored: false };
  }
  const db = getDb();
  const { Timestamp } = getFirestoreExports();
  const ref = db.collection("leads").doc();
  await ref.set({
    email: input.email.trim(),
    emailLower: normalizeCustomerEmail(input.email),
    name: input.name || null,
    phone: input.phone || null,
    source: input.source,
    page: input.page || null,
    interest: input.interest,
    message: input.message || null,
    createdAt: Timestamp.now(),
    ...(input.adsAttribution
      ? { adsAttribution: input.adsAttribution, adsChannel: input.adsAttribution.channel }
      : {}),
  });
  return { id: ref.id, stored: true };
}

/** Best-effort marketing list subscribe. Never throws. */
export async function subscribeLeadToBrevo(input: Pick<ParsedLeadCapture, "email" | "name" | "phone">): Promise<void> {
  if (!process.env.BREVO_API_KEY?.trim()) return;
  try {
    await upsertBrevoContact(
      input.email.trim(),
      input.name.trim(),
      input.phone.trim(),
      bookingEnv.brevoMarketingListId
    );
  } catch (err) {
    console.error("[Lead] Brevo contact upsert failed", err);
  }
}

export async function markLeadsContacted(email: string): Promise<number> {
  if (!hasFirebaseConfig()) return 0;
  const variants = emailLookupVariants(email);
  if (variants.length === 0) return 0;
  const db = getDb();
  const { Timestamp, FieldValue } = getFirestoreExports();
  const snaps = await Promise.all(
    variants.flatMap((v) => [
      db.collection("leads").where("email", "==", v).limit(50).get(),
      db.collection("leads").where("emailLower", "==", normalizeCustomerEmail(v)).limit(50).get(),
    ])
  );
  const seen = new Set<string>();
  const batch = db.batch();
  let count = 0;
  for (const snap of snaps) {
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      batch.set(
        d.ref,
        { lastContactedAt: Timestamp.now(), updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
      count += 1;
    }
  }
  if (count === 0) return 0;
  await batch.commit();
  return count;
}
