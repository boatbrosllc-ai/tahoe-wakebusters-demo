import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import type { Hold, Experience, Slot } from "@/lib/booking/types";
import { checkRateLimitPublicRead, getClientKey } from "@/lib/booking/rate-limit";
import { verifyReleaseToken } from "@/lib/booking/releaseToken";
import { verifyReceiptClaimToken } from "@/lib/booking/receiptToken";
import { verifyAdminSessionCookie } from "@/lib/admin-auth-firebase";

export async function POST(request: NextRequest) {
  try {
    const rl = await checkRateLimitPublicRead(getClientKey(request));
    if (!rl.allowed) {
      const retryAfter = rl.retryAfterMs ? Math.ceil(rl.retryAfterMs / 1000) : 60;
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    const body = await request.json().catch(() => ({}));
    const holdId = typeof body.holdId === "string" ? body.holdId.trim() : "";
    if (!holdId) {
      return NextResponse.json({ error: "holdId is required" }, { status: 400 });
    }

    const releaseToken = typeof body.release_token === "string" ? body.release_token.trim() : "";
    const receiptClaimToken =
      typeof body.receipt_claim_token === "string" ? body.receipt_claim_token.trim() : "";

    const isAdmin = await verifyAdminSessionCookie(request.headers.get("cookie"));
    let authorized = isAdmin;
    if (!authorized && releaseToken) {
      const rel = verifyReleaseToken(releaseToken);
      if (rel?.holdId === holdId) authorized = true;
    }
    if (!authorized && receiptClaimToken) {
      const claim = verifyReceiptClaimToken(receiptClaimToken);
      if (claim?.holdId === holdId) authorized = true;
    }
    if (!authorized) {
      return NextResponse.json(
        { error: "Unauthorized", hint: "Pass release_token, receipt_claim_token, or use an admin session." },
        { status: 401 },
      );
    }

    const db = getDb();
    const holdSnap = await db.collection("holds").doc(holdId).get();
    if (!holdSnap.exists) {
      return NextResponse.json({ error: "Hold not found" }, { status: 404 });
    }
    const hold = holdSnap.data() as Hold;
    if (hold.status !== "active") {
      if (hold.status === "converted") {
        const bookingId =
          typeof hold.bookingId === "string" && hold.bookingId.trim() ? hold.bookingId.trim() : undefined;
        return NextResponse.json({
          converted: true as const,
          holdStatus: "converted" as const,
          ...(bookingId ? { bookingId } : {}),
        });
      }
      if (hold.status === "expired") {
        return NextResponse.json(
          { error: "Hold expired", holdStatus: "expired" as const },
          { status: 410 },
        );
      }
      return NextResponse.json({ error: "Hold is not active", holdStatus: hold.status }, { status: 409 });
    }
    const expiresAtIso = (hold.expiresAt as { toDate?: () => Date })?.toDate?.()?.toISOString?.() ?? null;
    const expId = hold.experienceId;
    const [experienceSnap, slotSnap] = await Promise.all([
      expId ? db.collection("experiences").doc(expId).get() : Promise.resolve(null),
      hold.boatId
        ? db.collection("boats").doc(hold.boatId).collection("slots").doc(hold.slotId).get()
        : expId
          ? db.collection("experiences").doc(expId).collection("slots").doc(hold.slotId).get()
          : Promise.resolve(null),
    ]);
    const exp = experienceSnap?.exists ? (experienceSnap.data() as Experience) : null;
    const slot = slotSnap?.exists ? (slotSnap.data() as Slot) : null;
    const slotSummary = slot
      ? {
          id: hold.slotId,
          startAt: (slot.startAt as { toDate?: () => Date })?.toDate?.()?.toISOString?.() ?? "",
          endAt: (slot.endAt as { toDate?: () => Date })?.toDate?.()?.toISOString?.() ?? "",
          status: slot.status,
          boatId: hold.boatId ?? null,
        }
      : { id: hold.slotId, startAt: "", endAt: "", status: "open", boatId: hold.boatId ?? null };

    return NextResponse.json({
      holdId,
      expiresAt: expiresAtIso,
      experience: exp
        ? {
            id: expId ?? null,
            slug: exp.slug ?? "",
            title: exp.title ?? "",
            pricingType: exp.pricingType ?? "charter",
            maxGuests: exp.maxGuests ?? 14,
            maxCapacity: exp.maxCapacity ?? null,
            departureHour: exp.departureHour ?? null,
            departureMinute: exp.departureMinute ?? null,
            allowDeposit: exp.allowDeposit === true,
          }
        : null,
      bookingMode: hold.bookingMode ?? "charter",
      selectedDate: (hold as { startDateStr?: string }).startDateStr ?? null,
      selectedSlot: slotSummary,
      selectedRateId: hold.rateId,
      selectedBoatId: hold.boatId ?? null,
      partySize: hold.partySize ?? 1,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read hold summary";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
