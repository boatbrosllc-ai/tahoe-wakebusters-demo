import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const db = getDb();

  async function summarizeCollection(name: string) {
    const snap = await db.collection(name).limit(20).get();
    return {
      exists: !snap.empty,
      sampleCount: snap.size,
      sampleIds: snap.docs.map((d) => d.id),
    };
  }

  const [bookings, holds, blocks] = await Promise.all([
    summarizeCollection("bookings"),
    summarizeCollection("holds"),
    summarizeCollection("blocks"),
  ]);

  return NextResponse.json({
    projectId: process.env.FIREBASE_PROJECT_ID ?? null,
    bookings,
    holds,
    blocks,
  });
}
