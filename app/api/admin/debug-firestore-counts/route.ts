import { NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";

export async function GET() {
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

