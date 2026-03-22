import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import { getNotificationOutboxStats } from "@/lib/booking/notification-outbox";

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const db = getDb();
    const stats = await getNotificationOutboxStats(db);
    return NextResponse.json(stats);
  } catch (err) {
    console.error("[admin/notification-outbox-stats]", err);
    return NextResponse.json({ error: "Failed to load outbox stats" }, { status: 500 });
  }
}
