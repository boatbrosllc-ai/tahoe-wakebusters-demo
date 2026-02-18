import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import { getRequestById, updateRequest } from "@/lib/waiver/firestore";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminSession(_request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Request id required" }, { status: 400 });

  try {
    const req = await getRequestById(id);
    if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });

    let bookingSummary: { experienceName?: string; tripDate?: string; startTime?: string; endTime?: string } | null = null;
    const db = getDb();
    const bookingSnap = await db.collection("bookings").doc(req.bookingId).get();
    if (bookingSnap.exists) {
      const b = bookingSnap.data() as { experienceId?: string; slotId?: string; startDateStr?: string };
      let experienceName: string | undefined;
      if (b.experienceId) {
        const expSnap = await db.collection("experiences").doc(b.experienceId).get();
        if (expSnap.exists) {
          experienceName = (expSnap.data() as { title?: string })?.title;
        }
      }
      const { parseSlotId, getSlotStartEnd } = await import("@/lib/booking/experience-slots");
      const parsed = b.slotId ? parseSlotId(b.slotId) : null;
      let startTime: string | undefined;
      let endTime: string | undefined;
      if (parsed) {
        const { start, end } = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours);
        startTime = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        endTime = end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      }
      bookingSummary = {
        experienceName,
        tripDate: b.startDateStr ?? parsed?.dateStr,
        startTime,
        endTime,
      };
    }

    return NextResponse.json({ ...req, bookingSummary });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const isFirebase = /firebase|FIREBASE|config missing|credential/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebase && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebase ? 503 : 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Request id required" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as { status?: string };
  if (b.status !== "void" && b.status !== "expired") {
    return NextResponse.json({ error: "Only status void or expired can be set" }, { status: 400 });
  }

  try {
    await updateRequest(id, { status: b.status as "void" | "expired" });
    const req = await getRequestById(id);
    return NextResponse.json(req ?? { id });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
