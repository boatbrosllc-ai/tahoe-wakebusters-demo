import { NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import type { Experience, ExperienceRate } from "@/lib/booking/types";

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
        maxGuests: exp.maxGuests ?? 14,
        petsMax: exp.petsMax ?? 0,
        fromPriceCents,
        active: exp.active ?? true,
      });
    }
    console.log("[experiences] GET", { count: list.length, docCount: snap.docs.length });
    return NextResponse.json({ experiences: list });
  } catch (err) {
    console.error("[experiences]", err);
    return NextResponse.json(
      { error: "Failed to load experiences", detail: process.env.NODE_ENV === "development" ? (err instanceof Error ? err.message : String(err)) : undefined },
      { status: 500 }
    );
  }
}
