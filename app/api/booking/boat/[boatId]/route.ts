import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import type { Boat, Rate, Addon } from "@/lib/booking/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ boatId: string }> }
) {
  try {
    const { boatId } = await params;
    const db = getDb();
    const boatDoc = await db.collection("boats").doc(boatId).get();
    if (!boatDoc.exists) {
      return NextResponse.json({ error: "Boat not found" }, { status: 404 });
    }
    const boat = { id: boatId, ...boatDoc.data() } as Boat & { id: string };
    if (!boat.active) {
      return NextResponse.json({ error: "Boat not available" }, { status: 400 });
    }
    const [ratesSnap, addonsSnap] = await Promise.all([
      db.collection("boats").doc(boatId).collection("rates").where("active", "==", true).get(),
      db.collection("boats").doc(boatId).collection("addons").where("active", "==", true).get(),
    ]);
    const rates = ratesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Rate) }));
    const addons = addonsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Addon) }));
    return NextResponse.json({ boat, rates, addons });
  } catch (err) {
    console.error("[boat]", err);
    return NextResponse.json({ error: "Failed to load boat" }, { status: 500 });
  }
}
