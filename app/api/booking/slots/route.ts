import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import {
  buildSlotId,
  getSlotGrid,
  getSlotStartEnd,
} from "@/lib/booking/experience-slots";
import type { Slot } from "@/lib/booking/types";
import type { ExperienceRate } from "@/lib/booking/types";

export async function GET(request: NextRequest) {
  try {
    const boatId = request.nextUrl.searchParams.get("boatId");
    const experienceId = request.nextUrl.searchParams.get("experienceId");
    const startDate = request.nextUrl.searchParams.get("startDate");
    const endDate = request.nextUrl.searchParams.get("endDate");
    if ((!boatId && !experienceId) || !startDate || !endDate) {
      return NextResponse.json({ error: "boatId or experienceId, startDate, endDate required (YYYY-MM-DD)" }, { status: 400 });
    }
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T23:59:59");
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }
    const maxDays = 92;
    const daysMs = end.getTime() - start.getTime();
    if (daysMs > maxDays * 24 * 60 * 60 * 1000 || daysMs < 0) {
      return NextResponse.json({ error: `Date range must be between 1 and ${maxDays} days` }, { status: 400 });
    }
    const db = getDb();
    const { Timestamp } = getFirestoreExports();

    if (experienceId) {
      // Experiences: all dates available until booked or blocked. Return grid of slots;
      // use Firestore only for held/booked/blocked; otherwise synthetic "open".
      const expRef = db.collection("experiences").doc(experienceId);
      const expDoc = await expRef.get();
      if (!expDoc.exists) {
        return NextResponse.json({ error: "Experience not found" }, { status: 404 });
      }
      const ratesSnap = await expRef.collection("rates").where("active", "==", true).get();
      const durations = ratesSnap.docs.map((d) => (d.data() as ExperienceRate).durationHours);
      const durationsUnique = Array.from(new Set(durations));
      if (durationsUnique.length === 0) {
        return NextResponse.json({ slots: [] });
      }
      const slotsRef = expRef.collection("slots");
      const snap = await slotsRef
        .where("startAt", ">=", Timestamp.fromDate(start))
        .where("startAt", "<=", Timestamp.fromDate(end))
        .get();
      const existingByKey = new Map<string, { id: string; startAt: string; endAt: string; status: string; holdId: string | null; bookingId: string | null; updatedAt: string | null }>();
      snap.docs.forEach((doc) => {
        const data = doc.data() as Slot;
        const startAt = (data.startAt as { toDate(): Date }).toDate();
        const endAt = (data.endAt as { toDate(): Date }).toDate();
        const updatedAt = data.updatedAt as { toDate(): Date } | undefined;
        existingByKey.set(doc.id, {
          id: doc.id,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          status: data.status,
          holdId: data.holdId,
          bookingId: data.bookingId,
          updatedAt: updatedAt?.toDate?.()?.toISOString?.() ?? null,
        });
      });
      const grid = getSlotGrid(start, end, durationsUnique);
      const slots = grid.map(({ dateStr, startHour, durationHours }) => {
        const slotId = buildSlotId(dateStr, startHour, durationHours);
        const existing = existingByKey.get(slotId);
        if (existing) return existing;
        const { start: slotStart, end: slotEnd } = getSlotStartEnd(dateStr, startHour, durationHours);
        return {
          id: slotId,
          startAt: slotStart.toISOString(),
          endAt: slotEnd.toISOString(),
          status: "open" as const,
          holdId: null,
          bookingId: null,
          updatedAt: null,
        };
      });
      // Enrich held slots with hold expiry (for admin calendar countdown)
      const heldHoldIds = Array.from(new Set(slots.filter((s) => s.status === "held" && s.holdId).map((s) => s.holdId!)));
      if (heldHoldIds.length > 0) {
        const holdSnap = await Promise.all(heldHoldIds.map((id) => db.collection("holds").doc(id).get()));
        const expiresByHoldId = new Map<string, string>();
        holdSnap.forEach((doc, i) => {
          if (doc.exists) {
            const data = doc.data();
            const exp = data?.expiresAt as { toDate(): Date } | undefined;
            if (exp) expiresByHoldId.set(heldHoldIds[i], exp.toDate().toISOString());
          }
        });
        slots.forEach((s) => {
          if (s.status === "held" && s.holdId) {
            const exp = expiresByHoldId.get(s.holdId);
            if (exp) (s as Record<string, unknown>).expiresAt = exp;
          }
        });
      }
      return NextResponse.json({ slots });
    }

    // Boats: legacy – only return existing Firestore slots
    const slotsRef = db.collection("boats").doc(boatId!).collection("slots");
    const snap = await slotsRef
      .where("startAt", ">=", Timestamp.fromDate(start))
      .where("startAt", "<=", Timestamp.fromDate(end))
      .orderBy("startAt", "asc")
      .get();
    const slots = snap.docs.map((doc) => {
      const data = doc.data() as Slot;
      const startAt = data.startAt as { toDate(): Date };
      const endAt = data.endAt as { toDate(): Date };
      const updatedAt = data.updatedAt as { toDate(): Date } | undefined;
      return {
        id: doc.id,
        startAt: startAt.toDate().toISOString(),
        endAt: endAt.toDate().toISOString(),
        status: data.status,
        holdId: data.holdId,
        bookingId: data.bookingId,
        updatedAt: updatedAt?.toDate?.()?.toISOString?.() ?? null,
      };
    });
    return NextResponse.json({ slots });
  } catch (err) {
    console.error("[slots]", err);
    return NextResponse.json({ error: "Failed to load slots" }, { status: 500 });
  }
}
