/**
 * Seed Firestore with boats, rates, addons, and open slots (next 14 days).
 * Requires admin session (middleware + requireAdminSession). No production Bearer backdoor.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { requireSeedConfirmPhrase } from "@/lib/admin-destructive-confirm";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { buildSlotId } from "@/lib/booking/experience-slots";
import { LAUNCH_BOAT } from "@/content/launch-boat";

const SLOT_DURATION_MS = 4 * 60 * 60 * 1000;
const FIRST_SLOT_HOUR = 9;
const LAST_SLOT_HOUR = 17;

const RATES = [
  { durationHours: 3, displayName: "Three Hour Charter", active: true },
  { durationHours: 4, displayName: "Four Hour Charter", active: true },
  { durationHours: 5, displayName: "Five Hour Charter", active: true },
  { durationHours: 6, displayName: "Six Hour Charter", active: true },
  { durationHours: 7, displayName: "Seven Hour Charter", active: true },
  { durationHours: 8, displayName: "Eight Hour Charter", active: true },
];

const ADDONS = [
  { name: "Snack pack", priceCents: 2500, type: "quantity" as const, maxQty: 10, active: true },
  { name: "Ice", priceCents: 500, type: "quantity" as const, maxQty: 2, active: true },
  { name: "Towels", priceCents: 1500, type: "quantity" as const, maxQty: 14, active: true },
];

async function findExistingLaunchBoat(db: ReturnType<typeof getDb>) {
  const bySlug = await db.collection("boats").where("slug", "==", LAUNCH_BOAT.slug).limit(1).get();
  if (!bySlug.empty) return bySlug.docs[0];

  for (const prev of LAUNCH_BOAT.previousSlugs) {
    const snap = await db.collection("boats").where("slug", "==", prev).limit(1).get();
    if (!snap.empty) return snap.docs[0];
  }

  const byName = await db.collection("boats").where("name", "==", LAUNCH_BOAT.name).limit(1).get();
  if (!byName.empty) return byName.docs[0];

  for (const prev of LAUNCH_BOAT.previousNames) {
    const snap = await db.collection("boats").where("name", "==", prev).limit(1).get();
    if (!snap.empty) return snap.docs[0];
  }

  return null;
}

export async function POST(request: NextRequest) {
  const deny = await requireAdminSession(request.headers.get("cookie"));
  if (deny) return deny;
  const body = (await request.json().catch(() => ({}))) as { confirmPhrase?: string };
  const seedEnabled = process.env.ENABLE_SEED_ENDPOINT === "true";
  if (!seedEnabled) {
    return NextResponse.json(
      { error: "Seed endpoints are disabled. Set ENABLE_SEED_ENDPOINT=true to enable." },
      { status: 403 }
    );
  }
  const confirmDeny = requireSeedConfirmPhrase(body.confirmPhrase);
  if (confirmDeny) return confirmDeny;
  try {
    const db = getDb();
    const { FieldValue, Timestamp } = getFirestoreExports();
    const boatIds: string[] = [];

    const existingDoc = await findExistingLaunchBoat(db);
    let boatId: string;
    const listingFields = {
      name: LAUNCH_BOAT.name,
      slug: LAUNCH_BOAT.slug,
      previousSlugs: [...LAUNCH_BOAT.previousSlugs],
      description: LAUNCH_BOAT.description,
      heroSubtitle: LAUNCH_BOAT.heroSubtitle,
      capacity: LAUNCH_BOAT.capacity,
      photos: [...LAUNCH_BOAT.photos],
      timezone: LAUNCH_BOAT.timezone,
      capacityMax: LAUNCH_BOAT.capacityMax,
      petsMax: LAUNCH_BOAT.petsMax,
      defaultLocationText: LAUNCH_BOAT.defaultLocationText,
      cancellationPolicyText: LAUNCH_BOAT.cancellationPolicyText,
      active: true,
      isListingBoat: true as const,
    };

    if (existingDoc) {
      boatId = existingDoc.id;
      const existing = existingDoc.data();
      const experienceIds = Array.isArray(existing.experienceIds) ? existing.experienceIds : [];
      const prevSlugs = Array.isArray(existing.previousSlugs)
        ? existing.previousSlugs.filter((s): s is string => typeof s === "string")
        : [];
      const mergedPrevious = Array.from(
        new Set([
          ...prevSlugs,
          ...LAUNCH_BOAT.previousSlugs,
          ...(typeof existing.slug === "string" && existing.slug !== LAUNCH_BOAT.slug
            ? [existing.slug]
            : []),
        ])
      );
      await existingDoc.ref.set(
        {
          ...listingFields,
          previousSlugs: mergedPrevious,
          experienceIds,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      const boatRef = db.collection("boats").doc();
      boatId = boatRef.id;
      await boatRef.set({
        ...listingFields,
        experienceIds: [],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
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
    const nonOpenSlots = await slotsRef.where("status", "!=", "open").limit(1).get();
    if (nonOpenSlots.empty && existingSlots.empty) {
      const durationHours = 4;
      for (let d = 0; d < 14; d++) {
        const day = new Date(start);
        day.setDate(day.getDate() + d);
        const dateStr =
          day.getFullYear() +
          "-" +
          String(day.getMonth() + 1).padStart(2, "0") +
          "-" +
          String(day.getDate()).padStart(2, "0");
        for (let h = FIRST_SLOT_HOUR; h < LAST_SLOT_HOUR; h++) {
          const slotStart = new Date(day);
          slotStart.setHours(h, 0, 0, 0);
          const slotEnd = new Date(slotStart.getTime() + SLOT_DURATION_MS);
          if (slotEnd.getHours() > LAST_SLOT_HOUR || slotEnd.getDate() !== slotStart.getDate()) continue;
          const slotId = buildSlotId(dateStr, h, durationHours);
          await slotsRef.doc(slotId).set({
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

    return NextResponse.json({ ok: true, boatIds, slug: LAUNCH_BOAT.slug, name: LAUNCH_BOAT.name });
  } catch (err) {
    console.error("[admin/seed]", err);
    return NextResponse.json({ error: "Seed failed" }, { status: 500 });
  }
}
