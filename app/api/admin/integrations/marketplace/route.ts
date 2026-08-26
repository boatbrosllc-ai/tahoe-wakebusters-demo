import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { MARKETPLACE_EVENTS_COLLECTION } from "@/lib/integrations/gmail/constants";
import { gmailGetMessage } from "@/lib/integrations/gmail/client";
import { getGmailAccessToken } from "@/lib/integrations/gmail/token-store";
import { processGmailMarketplaceMessage } from "@/lib/integrations/marketplaces/process-message";
import { loadMarketplaceMappings, upsertMarketplaceMapping } from "@/lib/integrations/marketplaces/mapping-store";
import { requireFeatureResponse } from "@/lib/plan";
import {
  MARKETPLACE_MATCH_TYPES,
  MARKETPLACE_PROVIDERS,
  type MarketplaceListingMap,
  type MarketplaceMatchType,
  type MarketplaceProvider,
} from "@/lib/integrations/marketplaces/types";

export async function GET(request: NextRequest) {
  // PLAN_FEATURE_GATE
  {
    const planDenied = requireFeatureResponse("marketplaceSync");
    if (planDenied) return planDenied;
  }

  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;
  const maps = await loadMarketplaceMappings();
  return NextResponse.json({ mappings: maps });
}

function isMarketplaceProvider(value: unknown): value is MarketplaceProvider {
  return typeof value === "string" && (MARKETPLACE_PROVIDERS as readonly string[]).includes(value);
}

function isMarketplaceMatchType(value: unknown): value is MarketplaceMatchType {
  return typeof value === "string" && (MARKETPLACE_MATCH_TYPES as readonly string[]).includes(value);
}

async function experienceExists(opts: { experienceId?: string; experienceSlug?: string }): Promise<boolean> {
  const db = getDb();
  if (opts.experienceId) {
    const snap = await db.collection("experiences").doc(opts.experienceId).get();
    if (snap.exists) return true;
  }
  if (opts.experienceSlug) {
    const snap = await db.collection("experiences").where("slug", "==", opts.experienceSlug).limit(1).get();
    if (!snap.empty) return true;
  }
  return false;
}

export async function POST(request: NextRequest) {
  // PLAN_FEATURE_GATE
  {
    const planDenied = requireFeatureResponse("marketplaceSync");
    if (planDenied) return planDenied;
  }

  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;
  const body = (await request.json().catch(() => ({}))) as Partial<MarketplaceListingMap>;
  if (!body.provider || !body.matchType || !body.matchValue) {
    return NextResponse.json({ error: "provider, matchType, and matchValue are required" }, { status: 400 });
  }
  if (!isMarketplaceProvider(body.provider)) {
    return NextResponse.json({ error: "invalid provider" }, { status: 400 });
  }
  if (!isMarketplaceMatchType(body.matchType)) {
    return NextResponse.json({ error: "invalid matchType" }, { status: 400 });
  }
  if (!body.experienceSlug && !body.experienceId) {
    return NextResponse.json({ error: "experienceSlug or experienceId is required" }, { status: 400 });
  }
  if (!(await experienceExists({ experienceId: body.experienceId, experienceSlug: body.experienceSlug }))) {
    return NextResponse.json({ error: "experienceSlug or experienceId was not found" }, { status: 400 });
  }
  if (body.durationHours !== undefined) {
    if (!(Number.isFinite(body.durationHours) && body.durationHours > 0)) {
      return NextResponse.json({ error: "durationHours must be a positive number" }, { status: 400 });
    }
  }
  const id = await upsertMarketplaceMapping({
    provider: body.provider,
    matchType: body.matchType,
    matchValue: body.matchValue,
    experienceSlug: body.experienceSlug,
    experienceId: body.experienceId,
    boatId: body.boatId,
    durationHours: body.durationHours,
  });
  return NextResponse.json({ ok: true, id });
}

export async function PUT(request: NextRequest) {
  // PLAN_FEATURE_GATE
  {
    const planDenied = requireFeatureResponse("marketplaceSync");
    if (planDenied) return planDenied;
  }

  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;
  try {
    const body = (await request.json().catch(() => ({}))) as { eventId?: string };
    if (!body.eventId) return NextResponse.json({ error: "eventId is required" }, { status: 400 });
    const db = getDb();
    const { Timestamp } = getFirestoreExports();
    const eventSnap = await db.collection(MARKETPLACE_EVENTS_COLLECTION).doc(body.eventId).get();
    if (!eventSnap.exists) return NextResponse.json({ error: "Event not found" }, { status: 404 });
    const data = eventSnap.data() as { gmailMessageId?: string };
    if (!data.gmailMessageId) return NextResponse.json({ error: "Event has no Gmail message id" }, { status: 400 });
    const access = await getGmailAccessToken();
    const message = await gmailGetMessage(access, data.gmailMessageId);
    const result = await processGmailMarketplaceMessage(message, { force: true, eventDocId: body.eventId });
    await eventSnap.ref.set({ lastRetryAt: Timestamp.now(), lastRetryStatus: result.status, lastRetryAction: result.action ?? null }, { merge: true });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  // PLAN_FEATURE_GATE
  {
    const planDenied = requireFeatureResponse("marketplaceSync");
    if (planDenied) return planDenied;
  }

  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;
  try {
    const { backfillZeroDollarMarketplacePayouts } = await import(
      "@/lib/integrations/marketplaces/booking-service"
    );
    const result = await backfillZeroDollarMarketplacePayouts();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
