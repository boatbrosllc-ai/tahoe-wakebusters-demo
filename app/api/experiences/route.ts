import { NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import type { Experience } from "@/lib/booking/types";
import { getMaxGuestsForExperience } from "@/lib/booking/experience-capacity";
import { getExperienceBySlug } from "@/content/experiences";

function inferTicketedFromSlugOrTitle(exp: Experience): boolean {
  const slug = (exp.slug ?? "").toLowerCase();
  const title = (exp.title ?? (exp as { name?: string }).name ?? "").toLowerCase();
  if (/sunset|cruise/.test(slug) || /sunset|cruise/.test(title)) return true;
  if (/holiday|festive/.test(slug) || /holiday|festive/.test(title)) return true;
  return false;
}

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
  pricingType?: "charter" | "ticketed";
  maxCapacity?: number;
  departureHour?: number;
  departureMinute?: number;
  allowDeposit?: boolean;
}

export async function GET() {
  try {
    const db = getDb();
    const snap = await db.collection("experiences").where("active", "==", true).get();
    const list: ExperienceListItem[] = snap.docs.map((doc) => {
        const exp = doc.data() as Experience;
        // Read the denormalized field written by admin save paths; fall back to content override when set.
        let fromPriceCents: number | null = exp.fromPriceCents ?? null;
        const contentExp = getExperienceBySlug(exp.slug ?? "");
        if (contentExp?.fromPriceCents != null) fromPriceCents = contentExp.fromPriceCents;
        const isTicketed = exp.pricingType === "ticketed" || (exp.pricingType !== "charter" && inferTicketedFromSlugOrTitle(exp));
        return {
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
          pricingType: isTicketed ? ("ticketed" as const) : ("charter" as const),
          ...(isTicketed && (exp.maxCapacity != null ? { maxCapacity: exp.maxCapacity } : { maxCapacity: 35 })),
          ...(isTicketed && { departureHour: exp.departureHour ?? 19 }),
          ...(isTicketed && { departureMinute: exp.departureMinute ?? 0 }),
          allowDeposit: exp.allowDeposit === true,
        };
      });
    // Book now modal order: Pontoon first, then Watersports, then Sunset, Holiday last (slug order wins)
    const slugOrder = ["pontoon", "watersports", "sunset", "holiday"];
    const slugOrderIndex = (slug: string): number => {
      const lower = (slug ?? "").toLowerCase();
      const i = slugOrder.findIndex((s) => lower.includes(s) || lower === s);
      return i >= 0 ? i : slugOrder.length;
    };
    list.sort((a, b) => {
      const slugA = slugOrderIndex(a.slug);
      const slugB = slugOrderIndex(b.slug);
      if (slugA !== slugB) return slugA - slugB;
      const orderA = a.sortOrder ?? 999;
      const orderB = b.sortOrder ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return (a.title ?? "").localeCompare(b.title ?? "");
    });
    return NextResponse.json({ experiences: list }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
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
