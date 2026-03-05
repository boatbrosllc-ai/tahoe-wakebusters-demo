import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { safeHasFirebaseConfig, getFirebaseConfigStatus } from "@/lib/booking/env";
import type { ExperienceRate } from "@/lib/booking/types";

const RATES_FIREBASE_HINT =
  "Rates require Firebase. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in your deployment environment.";

export async function GET(request: NextRequest) {
  try {
    if (!safeHasFirebaseConfig()) {
      const detail = (() => {
        try {
          return getFirebaseConfigStatus();
        } catch {
          return { summary: RATES_FIREBASE_HINT };
        }
      })();
      return NextResponse.json(
        { error: "Booking is not configured.", hint: RATES_FIREBASE_HINT, firebaseDetail: detail },
        { status: 503 }
      );
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
    const rates = ratesSnap.docs
      .map((r) => {
        const d = r.data() as ExperienceRate;
        return {
          id: r.id,
          durationHours: d.durationHours,
          displayName: d.displayName,
          priceCents: d.priceCents,
        };
      })
      .sort((a, b) => (a.durationHours ?? 0) - (b.durationHours ?? 0));
    return NextResponse.json(
      { rates },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
        },
      }
    );
  } catch (err) {
    console.error("[experiences/rates]", err);
    return NextResponse.json(
      { error: "Service temporarily unavailable.", hint: RATES_FIREBASE_HINT },
      { status: 503 }
    );
  }
}
