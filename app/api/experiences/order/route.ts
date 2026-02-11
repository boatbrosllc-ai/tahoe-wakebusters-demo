import { NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import type { Experience } from "@/lib/booking/types";

/** Returns slugs in display order (for public listing page that uses static content). */
export async function GET() {
  try {
    const db = getDb();
    const snap = await db.collection("experiences").get();
    const items: { slug: string; sortOrder: number }[] = snap.docs.map((d) => {
      const exp = d.data() as Experience;
      return { slug: exp.slug ?? "", sortOrder: exp.sortOrder ?? 999 };
    });
    items.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.slug.localeCompare(b.slug);
    });
    return NextResponse.json({ order: items.map((i) => i.slug) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isConfigMissing =
      /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    if (isConfigMissing) {
      return NextResponse.json({ order: [] });
    }
    return NextResponse.json({ order: [] });
  }
}
