import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { hasFirebaseConfig } from "@/lib/booking/env";
import type { ExperienceRate } from "@/lib/booking/types";

export async function GET(request: NextRequest) {
  try {
    if (!hasFirebaseConfig()) {
      return NextResponse.json({ rates: [] });
    }
    const experienceId = request.nextUrl.searchParams.get("experienceId");
    if (!experienceId) {
      return NextResponse.json({ error: "experienceId required" }, { status: 400 });
    }
    const db = getDb();
    const ratesSnap = await db
      .collection("experiences")
      .doc(experienceId)
      .collection("rates")
      .where("active", "==", true)
      .get();
    const rates = ratesSnap.docs.map((r) => {
      const d = r.data() as ExperienceRate;
      return {
        id: r.id,
        durationHours: d.durationHours,
        displayName: d.displayName,
        priceCents: d.priceCents,
      };
    });
    return NextResponse.json({ rates });
  } catch (err) {
    console.error("[experiences/rates]", err);
    return NextResponse.json({ rates: [] });
  }
}
