import { NextRequest, NextResponse } from "next/server";
import { getGaMeasurementId } from "@/lib/ga-measurement-id";

type CollectBody = {
  clientId?: unknown;
  eventName?: unknown;
  params?: unknown;
};

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v != null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export async function POST(request: NextRequest) {
  const apiSecret = process.env.GA4_MEASUREMENT_PROTOCOL_API_SECRET?.trim();
  const measurementId = getGaMeasurementId();
  if (!apiSecret || !measurementId) {
    return NextResponse.json({ ok: false, reason: "ga_fallback_not_configured" }, { status: 202 });
  }

  let body: CollectBody = {};
  try {
    body = (await request.json()) as CollectBody;
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_json" }, { status: 400 });
  }

  const eventName = typeof body.eventName === "string" ? body.eventName.trim() : "";
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  const params = asRecord(body.params);

  if (!eventName || !clientId) {
    return NextResponse.json({ ok: false, reason: "invalid_payload" }, { status: 400 });
  }

  const endpoint = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
  const upstream = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      events: [{ name: eventName, params }],
    }),
    cache: "no-store",
  });

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    console.error("[ga-fallback] Measurement Protocol rejected event", {
      status: upstream.status,
      body: text.slice(0, 300),
    });
    return NextResponse.json({ ok: false, reason: "upstream_error" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
