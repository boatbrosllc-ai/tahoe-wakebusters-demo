/**
 * Best-effort client→server operational alert (e.g. success recovery failed with captured payment).
 */
import { NextRequest, NextResponse } from "next/server";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
import { checkRateLimit, getClientKey } from "@/lib/booking/rate-limit";

const ALLOWED_TYPES = new Set(["booking_success_recovery_failed"]);

export async function POST(request: NextRequest) {
  try {
    const limited = await checkRateLimit(`client-op-alert:${getClientKey(request)}`);
    if (!limited.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    let body: { type?: string; paymentIntentId?: string; source?: string } = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const type = typeof body.type === "string" ? body.type.trim() : "";
    if (!ALLOWED_TYPES.has(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
    const paymentIntentId =
      typeof body.paymentIntentId === "string" && body.paymentIntentId.trim()
        ? body.paymentIntentId.trim().slice(0, 128)
        : undefined;
    await writeOperationalAlert({
      type,
      paymentIntentId,
      source: typeof body.source === "string" ? body.source.slice(0, 64) : "booking_modal",
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[client-operational-alert]", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
