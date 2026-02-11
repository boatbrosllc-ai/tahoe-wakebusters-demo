/**
 * GET /api/booking/experience-addons?experienceId=... — returns add-ons for an experience (for booking modal).
 */
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import type { ExperienceAddon } from "@/lib/booking/types";

export async function GET(request: NextRequest) {
  const experienceId = request.nextUrl.searchParams.get("experienceId");
  if (!experienceId) {
    return NextResponse.json({ error: "experienceId required" }, { status: 400 });
  }
  try {
    const db = getDb();
    const snap = await db
      .collection("experiences")
      .doc(experienceId)
      .collection("addons")
      .where("active", "==", true)
      .get();
    const addons = snap.docs
      .map((d) => {
        const data = d.data() as ExperienceAddon;
        return {
          id: d.id,
          name: data.name,
          description: data.description,
          priceCents: data.priceCents,
          type: data.type,
          maxQty: data.maxQty,
          highlight: data.highlight ?? false,
        };
      })
      .filter((a) => a.type !== "tip"); // Tip is shown as "Tip now" / "Tip later" buttons, not as addon
    return NextResponse.json({ addons });
  } catch (err) {
    console.error("[booking/experience-addons]", err);
    return NextResponse.json({ error: "Failed to load add-ons", addons: [] }, { status: 500 });
  }
}
