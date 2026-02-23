import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/booking/stripe-client";
import { getDb } from "@/lib/booking/firebase-admin";
import { getSlotStartEnd, parseSlotId } from "@/lib/booking/experience-slots";
import type { Booking, Slot, Boat, Rate } from "@/lib/booking/types";
import type { Experience, ExperienceRate, BoatRate } from "@/lib/booking/types";

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get("session_id");
    if (!sessionId) {
      return NextResponse.json({ error: "session_id required" }, { status: 400 });
    }
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["line_items"] });
    if (!session.payment_status || session.payment_status !== "paid") {
      return NextResponse.json({ error: "Session not paid" }, { status: 400 });
    }
    const db = getDb();
    const bookingsSnap = await db.collection("bookings").where("stripe.checkoutSessionId", "==", sessionId).limit(1).get();
    if (bookingsSnap.empty) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    const doc = bookingsSnap.docs[0];
    const booking = doc.data() as Booking;
    const hasExperience = !!booking.experienceId;
    const hasBoat = !!booking.boatId;
    const isListingBoatFlow = hasExperience && hasBoat;
    let experienceName: string;
    let boatName: string;
    let slot: Slot | null = null;
    let rate: Rate | ExperienceRate | BoatRate | null = null;
    if (isListingBoatFlow) {
      const expSnap = await db.collection("experiences").doc(booking.experienceId!).get();
      experienceName = expSnap.exists ? (expSnap.data() as Experience).title : "Charter";
      const boatSnap = await db.collection("boats").doc(booking.boatId!).get();
      boatName = boatSnap.exists ? (boatSnap.data() as { name?: string }).name ?? experienceName : experienceName;
      const slotSnap = await db.collection("boats").doc(booking.boatId!).collection("slots").doc(booking.slotId).get();
      const rateSnap = await db.collection("experiences").doc(booking.experienceId!).collection("rates").doc(booking.rateId).get();
      slot = slotSnap.exists ? (slotSnap.data() as Slot) : null;
      rate = rateSnap.exists ? (rateSnap.data() as ExperienceRate) : null;
    } else if (hasExperience) {
      const expSnap = await db.collection("experiences").doc(booking.experienceId!).get();
      experienceName = expSnap.exists ? (expSnap.data() as Experience).title : "Charter";
      boatName = experienceName;
      const slotSnap = await db.collection("experiences").doc(booking.experienceId!).collection("slots").doc(booking.slotId).get();
      const rateSnap = await db.collection("experiences").doc(booking.experienceId!).collection("rates").doc(booking.rateId).get();
      slot = slotSnap.exists ? (slotSnap.data() as Slot) : null;
      rate = rateSnap.exists ? (rateSnap.data() as ExperienceRate) : null;
    } else {
      const boatSnap = await db.collection("boats").doc(booking.boatId!).get();
      boatName = boatSnap.exists ? (boatSnap.data() as Boat).name : "Charter";
      experienceName = boatName;
      const slotSnap = await db.collection("boats").doc(booking.boatId!).collection("slots").doc(booking.slotId).get();
      const rateSnap = await db.collection("boats").doc(booking.boatId!).collection("rates").doc(booking.rateId).get();
      slot = slotSnap.exists ? (slotSnap.data() as Slot) : null;
      rate = rateSnap.exists ? (rateSnap.data() as Rate) : null;
    }
    // For shared-ticketed bookings no slot doc is written to Firestore — fall back to computing
    // start/end from the slotId so the success page and receipt show the correct time.
    let startAt: string | null = null;
    let endAt: string | null = null;
    if (slot?.startAt) {
      const d = (slot.startAt as { toDate(): Date }).toDate();
      if (!Number.isNaN(d.getTime())) startAt = d.toISOString();
    }
    if (slot?.endAt) {
      const d = (slot.endAt as { toDate(): Date }).toDate();
      if (!Number.isNaN(d.getTime())) endAt = d.toISOString();
    }
    if ((!startAt || !endAt) && booking.slotId) {
      const parsed = parseSlotId(booking.slotId);
      if (parsed) {
        const { start, end } = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute ?? 0);
        if (!Number.isNaN(start.getTime())) startAt = start.toISOString();
        if (!Number.isNaN(end.getTime())) endAt = end.toISOString();
      }
    }
    return NextResponse.json({
      bookingId: doc.id,
      customer: booking.customer,
      boatName,
      experienceName,
      startAt,
      endAt,
      durationHours: rate?.durationHours,
      addonSelections: booking.addonSelections,
      pricing: booking.pricing,
      status: booking.status,
    });
  } catch (err) {
    console.error("[receipt]", err);
    return NextResponse.json({ error: "Failed to load receipt" }, { status: 500 });
  }
}
