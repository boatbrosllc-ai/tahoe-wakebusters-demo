import { NextRequest, NextResponse } from "next/server";
import type { QuerySnapshot } from "firebase-admin/firestore";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { GMAIL_ACCOUNT_EMAIL, GMAIL_READONLY_SCOPE } from "@/lib/integrations/gmail/constants";
import { gmailGetProfile } from "@/lib/integrations/gmail/client";
import { loadGmailOauthStatus, getGmailAccessToken } from "@/lib/integrations/gmail/token-store";
import { loadGmailWatchState } from "@/lib/integrations/gmail/watch";
import { getDb } from "@/lib/booking/firebase-admin";
import { MARKETPLACE_EVENTS_COLLECTION } from "@/lib/integrations/gmail/constants";
import { providerLabel } from "@/lib/integrations/marketplaces/mapping";
import { hydrateMarketplaceInboxEvents } from "@/lib/integrations/marketplaces/hydrate-events";
import type { MarketplaceProvider } from "@/lib/integrations/marketplaces/types";
import { requireFeatureResponse } from "@/lib/plan";

export async function GET(request: NextRequest) {
  // PLAN_FEATURE_GATE
  {
    const planDenied = requireFeatureResponse("marketplaceSync");
    if (planDenied) return planDenied;
  }

  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;
  try {
    const oauth = await loadGmailOauthStatus();
    const watch = await loadGmailWatchState();
    const db = getDb();
    let eventsSnap: QuerySnapshot;
    try {
      eventsSnap = await db.collection(MARKETPLACE_EVENTS_COLLECTION).orderBy("createdAt", "desc").limit(40).get();
    } catch {
      eventsSnap = await db.collection(MARKETPLACE_EVENTS_COLLECTION).limit(40).get();
    }
    const rawEvents = eventsSnap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const createdAt = data.createdAt as { toDate?: () => Date; seconds?: number } | undefined;
      const createdAtIso = createdAt?.toDate?.()?.toISOString() ?? (typeof createdAt?.seconds === "number" ? new Date(createdAt.seconds * 1000).toISOString() : null);
      return { id: d.id, ...data, createdAt: createdAtIso };
    });
    const events = await hydrateMarketplaceInboxEvents(db, rawEvents);
    return NextResponse.json({
      gmailAccount: oauth?.connectedEmail ?? GMAIL_ACCOUNT_EMAIL,
      gmailStatus: oauth ? "Connected" : "Not connected",
      scope: oauth?.scope ?? GMAIL_READONLY_SCOPE,
      watchStatus: watch?.expirationMs && watch.expirationMs > Date.now() ? "Active" : watch ? "Expired" : "Inactive",
      watchExpires: watch?.expirationMs ? new Date(watch.expirationMs).toISOString() : null,
      lastGmailNotification: watch?.lastNotificationAtMs ? new Date(watch.lastNotificationAtMs).toISOString() : null,
      lastSuccessfulSync: watch?.lastSuccessfulSyncAtMs ? new Date(watch.lastSuccessfulSyncAtMs).toISOString() : null,
      lastRenewed: watch?.lastRenewedAtMs ? new Date(watch.lastRenewedAtMs).toISOString() : null,
      providers: (["boatsetter", "getmyboat", "viator"] as MarketplaceProvider[]).map((p) => ({
        id: p,
        label: providerLabel(p),
        status: oauth ? "Active" : "Paused",
      })),
      events,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // PLAN_FEATURE_GATE
  {
    const planDenied = requireFeatureResponse("marketplaceSync");
    if (planDenied) return planDenied;
  }

  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;
  try {
    const access = await getGmailAccessToken();
    const profile = await gmailGetProfile(access);
    return NextResponse.json({
      ok: true,
      emailAddress: profile.emailAddress,
      historyId: profile.historyId,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
