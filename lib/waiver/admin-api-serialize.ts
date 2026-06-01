/**
 * Normalize Firestore Timestamp fields to ISO strings for admin JSON responses.
 */

import "server-only";

import { getFirestoreExports } from "@/lib/booking/firebase-admin";
import type { WaiverRequest } from "@/lib/waiver/types";

function firestoreLikeToIso(v: unknown): unknown {
  if (v == null || typeof v !== "object") return v;
  const { Timestamp } = getFirestoreExports();
  if (v instanceof Timestamp) return v.toDate().toISOString();
  const o = v as Record<string, unknown>;
  const secRaw = o.seconds ?? o._seconds;
  if (typeof secRaw === "number" || typeof secRaw === "string") {
    const sec = typeof secRaw === "number" ? secRaw : Number(secRaw);
    if (Number.isFinite(sec)) {
      const nsRaw = o.nanoseconds ?? o._nanoseconds ?? 0;
      const ns = typeof nsRaw === "number" ? nsRaw : typeof nsRaw === "string" ? Number(nsRaw) : 0;
      return new Date(sec * 1000 + (Number.isFinite(ns) ? ns / 1e6 : 0)).toISOString();
    }
  }
  return v;
}

export function waiverRequestDocToAdminJson(req: WaiverRequest & { id: string }) {
  const iso = firestoreLikeToIso;

  let signedOut = req.signed as Record<string, unknown> | undefined;
  if (req.signed) {
    const s = req.signed;
    const smr = s.requiresManualReview;
    signedOut = {
      ...(s as unknown as Record<string, unknown>),
      signedAt: iso(s.signedAt as unknown),
      ...(smr != null
        ? {
            requiresManualReview: {
              ...smr,
              at: iso((smr as { at?: unknown }).at),
            },
          }
        : {}),
    };
  }

  const topMr = req.requiresManualReview;
  const requiresManualReviewOut =
    topMr != null
      ? {
          ...topMr,
          at: iso((topMr as { at?: unknown }).at),
        }
      : req.requiresManualReview;

  return {
    ...(req as unknown as Record<string, unknown>),
    createdAt: iso(req.createdAt as unknown),
    pendingExpiresAt: iso(req.pendingExpiresAt as unknown),
    sent: req.sent
      ? {
          initialSentAt: iso(req.sent.initialSentAt as unknown),
          lastSentAt: iso(req.sent.lastSentAt as unknown),
          reminder1SentAt: iso(req.sent.reminder1SentAt as unknown),
        }
      : req.sent,
    signed: signedOut,
    requiresManualReview: requiresManualReviewOut,
  };
}
