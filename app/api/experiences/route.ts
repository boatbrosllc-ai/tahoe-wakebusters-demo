import { NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import type { Experience, ExperienceRate } from "@/lib/booking/types";
import { getMaxGuestsForExperience } from "@/lib/booking/experience-capacity";

export interface ExperienceListItem {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  heroMedia: { type: "image" | "video"; url: string };
  maxGuests: number;
  petsMax: number;
  fromPriceCents: number | null;
  active: boolean;
  sortOrder?: number;
}

export async function GET() {
  try {
    const db = getDb();
    const snap = await db.collection("experiences").where("active", "==", true).get();
    const list: ExperienceListItem[] = [];
    for (const doc of snap.docs) {
      const exp = doc.data() as Experience;
      const ratesSnap = await db.collection("experiences").doc(doc.id).collection("rates").where("active", "==", true).get();
      let fromPriceCents: number | null = null;
      ratesSnap.docs.forEach((r) => {
        const rate = r.data() as ExperienceRate;
        if (fromPriceCents == null || rate.priceCents < fromPriceCents) fromPriceCents = rate.priceCents;
      });
      list.push({
        id: doc.id,
        slug: exp.slug ?? "",
        title: exp.title ?? "",
        subtitle: exp.subtitle ?? "",
        heroMedia: exp.heroMedia ?? { type: "image", url: "" },
        maxGuests: getMaxGuestsForExperience(exp),
        petsMax: exp.petsMax ?? 0,
        fromPriceCents,
        active: exp.active ?? true,
        sortOrder: exp.sortOrder,
      });
    }
    // Book Now category order: Pontoon first, then Watersports, Sunset, Holiday last
    const slugOrder = ["pontoon", "watersports", "sunset", "holiday"];
    const slugOrderIndex = (slug: string): number => {
      const lower = (slug ?? "").toLowerCase();
      const i = slugOrder.findIndex((s) => lower.includes(s) || lower === s);
      return i >= 0 ? i : slugOrder.length;
    };
    list.sort((a, b) => {
      const orderA = a.sortOrder ?? 999;
      const orderB = b.sortOrder ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      const slugA = slugOrderIndex(a.slug);
      const slugB = slugOrderIndex(b.slug);
      if (slugA !== slugB) return slugA - slugB;
      return (a.title ?? "").localeCompare(b.title ?? "");
    });
    return NextResponse.json({ experiences: list });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isConfigMissing =
      message.includes("Firebase config missing") ||
      message.includes("FIREBASE_PRIVATE_KEY is truncated") ||
      message.includes("Missing required env");
    console.error("[experiences]", err);
    if (isConfigMissing) {
      return NextResponse.json(
        {
          error: "Booking is not configured. Set Firebase env vars (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) in your host.",
          code: "FIREBASE_NOT_CONFIGURED",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "Failed to load experiences", detail: process.env.NODE_ENV === "development" ? message : undefined },
      { status: 500 }
    );
  }
}
