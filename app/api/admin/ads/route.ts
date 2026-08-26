import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import { adsAttributionDisplay, isGoogleAdsAttribution, type AdsAttribution } from "@/lib/ads/attribution";
import { bookingCountsTowardActiveRevenueTotals, totalSummaryAttributedRevenueCents } from "@/lib/booking/summary-revenue";
import type { Booking } from "@/lib/booking/types";
import { requireFeatureResponse } from "@/lib/plan";

export const maxDuration = 26;

const SAMPLE_LIMIT = 250;

function toIso(ts: { toDate?: () => Date; seconds?: number } | null | undefined): string | null {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate().toISOString();
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000).toISOString();
  return null;
}

function isPaidAdsDoc(data: { adsChannel?: string; adsAttribution?: AdsAttribution | null }): boolean {
  if (data.adsChannel === "google_ads" || data.adsChannel === "other_paid") return true;
  return Boolean(data.adsAttribution && (data.adsAttribution.gclid || data.adsAttribution.utmMedium));
}

export async function GET(request: NextRequest) {
  // PLAN_FEATURE_GATE
  {
    const planDenied = requireFeatureResponse("adsAttribution");
    if (planDenied) return planDenied;
  }

  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const db = getDb();
    const [bookingSnap, leadSnap] = await Promise.all([
      db.collection("bookings").orderBy("createdAt", "desc").limit(SAMPLE_LIMIT).get(),
      db.collection("leads").orderBy("createdAt", "desc").limit(SAMPLE_LIMIT).get(),
    ]);

    const bookings = bookingSnap.docs
      .map((doc) => {
        const data = doc.data() as Booking & { adsAttribution?: AdsAttribution; adsChannel?: string };
        if (!isPaidAdsDoc(data)) return null;
        const attr = data.adsAttribution ?? null;
        const display = adsAttributionDisplay(attr);
        return {
          id: doc.id,
          kind: "booking" as const,
          createdAt: toIso(data.createdAt),
          name: data.customer?.name ?? "—",
          email: data.customer?.email ?? "—",
          ...display,
          channel: data.adsChannel ?? attr?.channel ?? "google_ads",
          amountCents: bookingCountsTowardActiveRevenueTotals(data) ? totalSummaryAttributedRevenueCents(data) : 0,
          googleAds: isGoogleAdsAttribution(attr) || data.adsChannel === "google_ads",
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);

    const leads = leadSnap.docs
      .map((doc) => {
        const data = doc.data() as {
          adsAttribution?: AdsAttribution;
          adsChannel?: string;
          name?: string | null;
          email?: string;
          source?: string;
          page?: string | null;
          createdAt?: { toDate?: () => Date; seconds?: number };
        };
        if (!isPaidAdsDoc(data)) return null;
        const attr = data.adsAttribution ?? null;
        const display = adsAttributionDisplay(attr);
        return {
          id: doc.id,
          kind: data.source === "contact" ? ("contact" as const) : ("lead" as const),
          createdAt: toIso(data.createdAt),
          name: data.name || "—",
          email: data.email ?? "—",
          ...display,
          landingPath: display.landingPath ?? data.page ?? null,
          channel: data.adsChannel ?? attr?.channel ?? "google_ads",
          amountCents: 0,
          googleAds: isGoogleAdsAttribution(attr) || data.adsChannel === "google_ads",
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);

    const googleBookings = bookings.filter((b) => b.googleAds);
    const revenueCents = googleBookings.reduce((sum, b) => sum + b.amountCents, 0);

    return NextResponse.json({
      sampledBookings: bookingSnap.size,
      sampledLeads: leadSnap.size,
      bookingsFromAds: bookings.length,
      googleAdsBookings: googleBookings.length,
      revenueCents,
      leadsFromAds: leads.length,
      rows: [...bookings, ...leads]
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
        .slice(0, 80),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/firebase|credential|FIREBASE/i.test(message)) {
      return NextResponse.json({ error: FIREBASE_SETUP_HINT, hint: message }, { status: 503 });
    }
    console.error("[admin/ads]", err);
    return NextResponse.json({ error: "Failed to load ads conversions" }, { status: 500 });
  }
}
