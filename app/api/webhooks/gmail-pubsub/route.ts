import { NextRequest, NextResponse } from "next/server";
import { bookingEnv } from "@/lib/booking/env";
import {
  decodePubSubMessageData,
  isExpectedGmailPush,
  pubSubDeliveryId,
  pubSubTokenMatches,
  verifyGoogleOidcToken,
  type PubSubPushBody,
} from "@/lib/integrations/gmail/pubsub";
import { gmailPubSubAudience } from "@/lib/integrations/gmail/constants";
import { processGmailHistoryNotification } from "@/lib/integrations/gmail/process-notification";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";

export const maxDuration = 26;

export async function POST(request: NextRequest) {
  const audience = gmailPubSubAudience(bookingEnv.appBaseUrl);
  const auth = request.headers.get("authorization");
  const skipOidc = process.env.GMAIL_PUBSUB_SKIP_OIDC === "1";
  if (!skipOidc || auth) {
    if (!auth) {
      return NextResponse.json({ error: "Missing OIDC token" }, { status: 401 });
    }
    const oidcOk = await verifyGoogleOidcToken(auth, audience);
    if (!oidcOk) {
      return NextResponse.json({ error: "Invalid OIDC token" }, { status: 401 });
    }
  }
  const expectedToken = process.env.GMAIL_PUBSUB_PUSH_TOKEN?.trim();
  const provided = request.nextUrl.searchParams.get("token");
  if (!pubSubTokenMatches(provided, expectedToken)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as PubSubPushBody;
  const deliveryId = pubSubDeliveryId(body);
  const db = getDb();
  const { Timestamp } = getFirestoreExports();
  const claimRef = db.collection("gmailPubSubDeliveries").doc(deliveryId);
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(claimRef);
    if (snap.exists) return false;
    tx.set(claimRef, { receivedAt: Timestamp.now() });
    return true;
  });
  if (!claimed) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const notification = decodePubSubMessageData(body.message?.data);
  if (!isExpectedGmailPush(notification)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    const result = await processGmailHistoryNotification(notification!);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    await claimRef.delete().catch(() => {});
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
