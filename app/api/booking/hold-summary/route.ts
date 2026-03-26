import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import type { Hold, Experience, Slot } from "@/lib/booking/types";

export async function GET(request: NextRequest) {
  try {
    const holdId = request.nextUrl.searchParams.get("holdId")?.trim();
    if (!holdId) {
      return NextResponse.json({ error: "holdId is required" }, { status: 400 });
    }
    const db = getDb();
    const holdSnap = await db.collection("holds").doc(holdId).get();
    if (!holdSnap.exists) {
      return NextResponse.json({ error: "Hold not found" }, { status: 404 });
    }
    const hold = holdSnap.data() as Hold;
    if (hold.status !== "active") {
      return NextResponse.json({ error: "Hold is not active", holdStatus: hold.status }, { status: 409 });
    }
    const expiresAtIso = (hold.expiresAt as { toDate?: () => Date })?.toDate?.()?.toISOString?.() ?? null;
    const expId = hold.experienceId;
    const [experienceSnap, slotSnap] = await Promise.all([
      expId ? db.collection("experiences").doc(expId).get() : Promise.resolve(null),
      hold.boatId
        ? db.collection("boats").doc(hold.boatId).collection("slots").doc(hold.slotId).get()
        : expId
          ? db.collection("experiences").doc(expId).collection("slots").doc(hold.slotId).get()
          : Promise.resolve(null),
    ]);
    const exp = experienceSnap?.exists ? (experienceSnap.data() as Experience) : null;
    const slot = slotSnap?.exists ? (slotSnap.data() as Slot) : null;
    const slotSummary = slot
      ? {
          id: hold.slotId,
          startAt: (slot.startAt as { toDate?: () => Date })?.toDate?.()?.toISOString?.() ?? "",
          endAt: (slot.endAt as { toDate?: () => Date })?.toDate?.()?.toISOString?.() ?? "",
          status: slot.status,
          boatId: hold.boatId ?? null,
        }
      : { id: hold.slotId, startAt: "", endAt: "", status: "open", boatId: hold.boatId ?? null };

    return NextResponse.json({
      holdId,
      expiresAt: expiresAtIso,
      experience: exp
        ? {
            id: expId ?? null,
            slug: exp.slug ?? "",
            title: exp.title ?? "",
            pricingType: exp.pricingType ?? "charter",
            maxGuests: exp.maxGuests ?? 14,
            maxCapacity: exp.maxCapacity ?? null,
            departureHour: exp.departureHour ?? null,
            departureMinute: exp.departureMinute ?? null,
            allowDeposit: exp.allowDeposit === true,
          }
        : null,
      bookingMode: hold.bookingMode ?? "charter",
      selectedDate: ((hold as { startDateStr?: string }).startDateStr ?? null),
      selectedSlot: slotSummary,
      selectedRateId: hold.rateId,
      selectedBoatId: hold.boatId ?? null,
      partySize: hold.partySize ?? 1,
      pricing: hold.pricing ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read hold summary";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

