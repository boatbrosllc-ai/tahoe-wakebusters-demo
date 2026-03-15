import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import type { Booking, AddonSelection } from "@/lib/booking/types";
import { parseSlotIdRelaxed, getSlotStartEnd } from "@/lib/booking/experience-slots";
import { formatBookingTime } from "@/lib/booking/format-booking-datetime";

function toDate(ts: { seconds?: number; nanoseconds?: number; toDate?: () => Date }): string | null {
  if (ts.toDate) return ts.toDate().toISOString();
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000).toISOString();
  return null;
}

type AddonWithName = { addonId: string; name: string; qty: number };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Booking id required" }, { status: 400 });

  try {
    const db = getDb();
    const doc = await db.collection("bookings").doc(id).get();
    if (!doc.exists) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const b = doc.data() as Booking & { startDateStr?: string };
    const experienceId = b.experienceId;
    const boatId = b.boatId ?? null;

    let experienceName = "—";
    const addonMap = new Map<string, string>();
    if (experienceId) {
      const expSnap = await db.collection("experiences").doc(experienceId).get();
      if (expSnap.exists) experienceName = (expSnap.data() as { title?: string }).title ?? experienceId;
      const addonsSnap = await db.collection("experiences").doc(experienceId).collection("addons").get();
      addonsSnap.docs.forEach((ad) => {
        addonMap.set(ad.id, (ad.data() as { name?: string }).name ?? ad.id);
      });
    }

    let boatName: string | null = boatId;
    if (boatId) {
      const boatSnap = await db.collection("boats").doc(boatId).get();
      if (boatSnap.exists) boatName = (boatSnap.data() as { name?: string }).name ?? boatId;
    }

    const createdAt = b.createdAt ? toDate(b.createdAt as { seconds?: number; toDate?: () => Date }) : null;
    let startDate: string | null = b.startDateStr ?? null;
    let startTime: string | null = null;
    let endTime: string | null = null;
    let durationHours: number | null = null;
    const parsed = parseSlotIdRelaxed(b.slotId ?? "");
    if (parsed) {
      if (!startDate) startDate = parsed.dateStr;
      durationHours = parsed.durationHours;
      const { start, end } = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute ?? 0);
      startTime = formatBookingTime(start);
      endTime = formatBookingTime(end);
    }

    const addonsWithNames: AddonWithName[] = (b.addonSelections ?? []).map((sel: AddonSelection) => ({
      addonId: sel.addonId,
      name: addonMap.get(sel.addonId) ?? sel.addonId,
      qty: sel.qty ?? 1,
    }));

    const bWithExt = b as Booking & { card?: { brand?: string; last4?: string; expMonth?: number; expYear?: number }; finalChargeAt?: { seconds?: number; toDate?: () => Date } };
    const finalChargeAt = bWithExt.finalChargeAt;
    let finalChargeAtStr: string | null = null;
    if (finalChargeAt) {
      if (typeof finalChargeAt.toDate === "function") finalChargeAtStr = finalChargeAt.toDate().toISOString();
      else if (typeof (finalChargeAt as { seconds?: number }).seconds === "number") finalChargeAtStr = new Date((finalChargeAt as { seconds: number }).seconds * 1000).toISOString();
    }

    const bWaiver = (b as { waiver?: { requestId: string; status: string; templateId: string; templateVersion: number } }).waiver;

    return NextResponse.json({
      id: doc.id,
      experienceId: b.experienceId,
      experienceName,
      boatId,
      boatName,
      customer: b.customer,
      partySize: b.partySize ?? null,
      petsCount: b.petsCount ?? 0,
      specialNotes: b.specialNotes ?? null,
      answers: b.answers ?? {},
      addonSelections: b.addonSelections ?? [],
      addonsWithNames,
      durationHours,
      slotId: b.slotId ?? null,
      rateId: b.rateId ?? null,
      pricing: b.pricing,
      status: b.status,
      stripe: b.stripe ?? undefined,
      card: bWithExt.card ?? undefined,
      finalChargeAt: finalChargeAtStr,
      createdAt,
      startDate,
      startTime,
      endTime,
      waiver: bWaiver ?? undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebaseConfig ? 503 : 500 }
    );
  }
}
