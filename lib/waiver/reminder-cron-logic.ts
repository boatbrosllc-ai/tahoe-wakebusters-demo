/**
 * Shared waiver reminder cron: pending requests, 24h+ old, valid token, trip not past, template allows reminder.
 */

import { getDb } from "@/lib/booking/firebase-admin";
import { getFirestoreExports } from "@/lib/booking/firebase-admin";
import {
  getTemplateById,
  updateRequest,
  getTokenById,
  isTokenValid,
  expireStalePendingRequests,
  buildWaiverSigningUrlFromTokenId,
  getActiveGroupSigningUrlForBooking,
} from "@/lib/waiver/firestore";
import type { WaiverRequest } from "@/lib/waiver/types";
import { waiverEmailBrevo } from "@/lib/waiver/email-brevo";
import { logNotificationSent } from "@/lib/booking/email-log";
import { parseSlotId, getSlotStartEnd } from "@/lib/booking/experience-slots";
import { formatBookingTime } from "@/lib/booking/format-booking-datetime";
import { reconcileMissingWaivers } from "@/lib/waiver/reconcile-missing-waivers";

const PAGE_SIZE = 100;

export async function runWaiverReminderCron(
  logPrefix: string
): Promise<{ matched: number; sent: number; reconcileScanned: number; reconcileCreated: number }> {
  const { scanned: reconcileScanned, created: reconcileCreated } = await reconcileMissingWaivers(logPrefix);
  if (reconcileCreated > 0) {
    console.log(`[${logPrefix}] reconcile missing waivers: created`, reconcileCreated, "scanned", reconcileScanned);
  }

  const expired = await expireStalePendingRequests();
  if (expired > 0) {
    console.log(`[${logPrefix}] expired stale pending requests:`, expired);
  }

  const db = getDb();
  const { Timestamp } = getFirestoreExports();
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const templateCache = new Map<string, Awaited<ReturnType<typeof getTemplateById>>>();
  async function getTemplateCached(templateId: string) {
    if (templateCache.has(templateId)) return templateCache.get(templateId)!;
    const t = await getTemplateById(templateId);
    templateCache.set(templateId, t);
    return t;
  }

  const experienceNameCache = new Map<string, string>();
  async function getExperienceName(experienceId: string): Promise<string> {
    if (experienceNameCache.has(experienceId)) return experienceNameCache.get(experienceId)!;
    const snap = await db.collection("experiences").doc(experienceId).get();
    const title = snap.exists ? (snap.data() as { title?: string })?.title ?? experienceId : experienceId;
    experienceNameCache.set(experienceId, title);
    return title;
  }

  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  let matched = 0;
  let sent = 0;

  while (true) {
    let q = db
      .collection("waiverRequests")
      .where("status", "==", "pending")
      .limit(PAGE_SIZE);

    if (cursor) q = q.startAfter(cursor);

    const snap = await q.get();
    if (snap.empty) break;

    matched += snap.size;

    const pageRequests: { id: string; full: WaiverRequest & { id: string } }[] = snap.docs.map((doc) => {
      const full = { id: doc.id, ...(doc.data() as WaiverRequest) };
      return { id: doc.id, full };
    });

    const tokenIds = Array.from(new Set(pageRequests.map((r) => r.full.signingTokenId).filter(Boolean) as string[]));
    const tokenDocs = await (tokenIds.length > 0 ? Promise.all(tokenIds.map((id) => getTokenById(id))) : Promise.resolve([]));
    const tokenById = new Map(tokenIds.map((id, i) => [id, tokenDocs[i] ?? null]));

    const bookingIds = Array.from(new Set(pageRequests.map((r) => r.full.bookingId)));
    const bookingSnaps =
      bookingIds.length > 0
        ? await Promise.all(bookingIds.map((id) => db.collection("bookings").doc(id).get()))
        : [];
    const bookingById = new Map(bookingIds.map((id, i) => [id, bookingSnaps[i]]));

    for (const { id: docId, full } of pageRequests) {
      if (full.status !== "pending" || full.sent?.reminder1SentAt != null) continue;
      if (full.signingTokenId) {
        const tokenDoc = tokenById.get(full.signingTokenId) ?? null;
        if (!isTokenValid(tokenDoc)) continue;
      }
      const bookingSnap = bookingById.get(full.bookingId);
      const tripDateStr = bookingSnap?.exists
        ? (bookingSnap.data() as { startDateStr?: string })?.startDateStr ?? ""
        : "";
      if (tripDateStr && tripDateStr < todayStr) continue;
      const createdAtMs =
        typeof (full.createdAt as { seconds?: number })?.seconds === "number"
          ? (full.createdAt as { seconds: number }).seconds * 1000
          : 0;
      if (createdAtMs >= twentyFourHoursAgo.getTime()) continue;

      let toEmail = full.signerEmail;
      let toName = full.signerName ?? "Guest";
      let experienceName = "Your trip";
      let tripDate = "";
      let startTime: string | undefined;
      let endTime: string | undefined;
      let partySize: number | undefined;

      if (bookingSnap?.exists) {
        const booking = bookingSnap.data() as {
          experienceId?: string;
          slotId?: string;
          startDateStr?: string;
          partySize?: number;
          customer?: { name?: string; email?: string };
        };
        toEmail = toEmail ?? booking.customer?.email?.trim();
        toName = (toName || booking.customer?.name || "Guest").trim();
        tripDate = booking.startDateStr ?? "";
        partySize = booking.partySize;
        const parsed = booking.slotId ? parseSlotId(booking.slotId) : null;
        if (parsed) {
          tripDate = parsed.dateStr;
          const { start, end } = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute ?? 0);
          startTime = formatBookingTime(start);
          endTime = formatBookingTime(end);
        }
        if (booking.experienceId) {
          experienceName = await getExperienceName(booking.experienceId);
        }
      }

      if (!toEmail) continue;

      const template = full.templateId ? await getTemplateCached(full.templateId) : null;
      if (template?.sendWaiverReminder === false) continue;

      try {
        const signingUrlForEmail = full.signingTokenId
          ? buildWaiverSigningUrlFromTokenId(full.signingTokenId)
          : full.signingUrl;
        const groupUrlForEmail =
          (partySize ?? 1) > 1
            ? full.groupSigningUrl ?? (await getActiveGroupSigningUrlForBooking(full.bookingId)) ?? undefined
            : undefined;
        await waiverEmailBrevo.sendWaiverReminder({
          to: toEmail,
          name: toName,
          signingUrl: signingUrlForEmail,
          groupSigningUrl: groupUrlForEmail,
          bookingSummary: { experienceName, tripDate, startTime, endTime, partySize },
        });
        await logNotificationSent({
          channel: "email",
          to: toEmail,
          toName,
          templateId: "waiver_reminder",
          subject: "Reminder: Sign your waiver – Nasty Sport Fishing",
          bookingId: full.bookingId,
          eventSubtype: "waiver_reminder",
        }).catch((err) => console.error(`[${logPrefix}] logNotificationSent failed`, err));
        const ts = Timestamp.now();
        await updateRequest(docId, {
          sent: {
            ...full.sent,
            lastSentAt: ts,
            reminder1SentAt: ts,
          },
        });
        sent++;
      } catch (err) {
        console.error(`[${logPrefix}] send failed for`, docId, err);
      }
    }

    if (snap.size < PAGE_SIZE) break;
    cursor = snap.docs[snap.docs.length - 1];
  }

  return { matched, sent, reconcileScanned, reconcileCreated };
}
