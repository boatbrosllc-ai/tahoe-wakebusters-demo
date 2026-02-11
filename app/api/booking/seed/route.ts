/**
 * Seed Firestore with boats (Long Pontoon, Wake Board, Lake Travis Pontoon), rates (3–8h), addons, and open slots for the next 14 days.
 * Call with POST and Authorization: Bearer <SEED_SECRET> or CRON_SECRET.
 * Idempotent: creates each boat only if none exist (by name), then rates/addons/slots.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";

const SLOT_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours per slot
const FIRST_SLOT_HOUR = 9;
const LAST_SLOT_HOUR = 17;

const BOATS = [
  {
    name: "Long Pontoon",
    timezone: "America/Chicago",
    capacityMax: 16,
    petsMax: 4,
    defaultLocationText: "Lake Travis — we'll send exact meeting point after booking.",
    cancellationPolicyText: "Cancel 24h before for full refund. See terms for details.",
  },
  {
    name: "Wake Board",
    timezone: "America/Chicago",
    capacityMax: 8,
    petsMax: 0,
    defaultLocationText: "Lake Austin — we'll send exact meeting point after booking.",
    cancellationPolicyText: "Cancel 24h before for full refund. See terms for details.",
  },
  {
    name: "Lake Travis Pontoon",
    timezone: "America/Chicago",
    capacityMax: 14,
    petsMax: 4,
    defaultLocationText: "Lake Travis / Lake Austin — we'll send exact meeting point after booking.",
    cancellationPolicyText: "Cancel 24h before for full refund. See terms for details.",
  },
];

const RATES = [
  { durationHours: 3, basePriceCents: 45000, displayName: "Three Hour Charter", active: true },
  { durationHours: 4, basePriceCents: 60000, displayName: "Four Hour Charter", active: true },
  { durationHours: 5, basePriceCents: 75000, displayName: "Five Hour Charter", active: true },
  { durationHours: 6, basePriceCents: 90000, displayName: "Six Hour Charter", active: true },
  { durationHours: 7, basePriceCents: 105000, displayName: "Seven Hour Charter", active: true },
  { durationHours: 8, basePriceCents: 120000, displayName: "Eight Hour Charter", active: true },
];

const ADDONS = [
  { name: "Snack pack", priceCents: 2500, type: "toggle" as const, active: true },
  { name: "Ice", priceCents: 500, type: "toggle" as const, active: true },
  { name: "Towels", priceCents: 1500, type: "quantity" as const, maxQty: 10, active: true },
  { name: "Sunscreen", priceCents: 800, type: "toggle" as const, active: true },
];

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const secret = process.env.SEED_SECRET ?? process.env.CRON_SECRET;
    if (secret && authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const db = getDb();
    const { FieldValue, Timestamp } = getFirestoreExports();
    const boatIds: string[] = [];

    for (const boatConfig of BOATS) {
      const boatsSnap = await db.collection("boats").where("name", "==", boatConfig.name).limit(1).get();
      let boatId: string;
      if (!boatsSnap.empty) {
        boatId = boatsSnap.docs[0].id;
      } else {
        const boatRef = db.collection("boats").doc();
        boatId = boatRef.id;
        await boatRef.set({
          ...boatConfig,
          active: true,
        });
      }
      boatIds.push(boatId);

      const boatsRef = db.collection("boats").doc(boatId);
      const ratesRef = boatsRef.collection("rates");
      const addonsRef = boatsRef.collection("addons");
      const slotsRef = boatsRef.collection("slots");

      const existingRates = await ratesRef.get();
      if (existingRates.empty) {
        for (const r of RATES) {
          await ratesRef.doc().set(r);
        }
      }

      const existingAddons = await addonsRef.get();
      if (existingAddons.empty) {
        for (const a of ADDONS) {
          await addonsRef.doc().set(a);
        }
      }

      const now = new Date();
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 14);
      const existingSlots = await slotsRef
        .where("startAt", ">=", Timestamp.fromDate(start))
        .where("startAt", "<", Timestamp.fromDate(end))
        .limit(1)
        .get();
      if (existingSlots.empty) {
        for (let d = 0; d < 14; d++) {
          const day = new Date(start);
          day.setDate(day.getDate() + d);
          for (let h = FIRST_SLOT_HOUR; h < LAST_SLOT_HOUR; h++) {
            const slotStart = new Date(day);
            slotStart.setHours(h, 0, 0, 0);
            const slotEnd = new Date(slotStart.getTime() + SLOT_DURATION_MS);
            if (slotEnd.getHours() > LAST_SLOT_HOUR || slotEnd.getDate() !== slotStart.getDate()) continue;
            await slotsRef.doc().set({
              startAt: Timestamp.fromDate(slotStart),
              endAt: Timestamp.fromDate(slotEnd),
              status: "open",
              holdId: null,
              bookingId: null,
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
        }
      }
    }

    return NextResponse.json({ ok: true, boatIds });
  } catch (err) {
    console.error("[seed]", err);
    return NextResponse.json({ error: "Seed failed" }, { status: 500 });
  }
}
