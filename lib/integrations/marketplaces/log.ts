export const MARKETPLACE_LOG_EVENTS = [
  "gmail_watch_started",
  "gmail_watch_renewed",
  "gmail_notification_received",
  "marketplace_email_detected",
  "boatsetter_booking_created",
  "boatsetter_booking_updated",
  "boatsetter_booking_cancelled",
  "boatsetter_reminder_ignored",
  "getmyboat_booking_created",
  "getmyboat_booking_updated",
  "getmyboat_booking_cancelled",
  "viator_booking_created",
  "viator_booking_updated",
  "viator_booking_cancelled",
  "external_booking_duplicate_ignored",
  "marketplace_listing_unmapped",
  "marketplace_listing_auto_mapped",
  "marketplace_guest_block_converted",
  "marketplace_parse_failed",
  "marketplace_sync_failed",
  "gmail_sync_partial_failure",
] as const;

export type MarketplaceLogEvent = (typeof MARKETPLACE_LOG_EVENTS)[number];

export function marketplaceLog(
  event: MarketplaceLogEvent,
  data?: Record<string, unknown>
): void {
  const safe = data ? redactMarketplaceLog(data) : undefined;
  if (safe) {
    console.log(`[marketplace:${event}]`, safe);
  } else {
    console.log(`[marketplace:${event}]`);
  }
}

function redactMarketplaceLog(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    const key = k.toLowerCase();
    if (key.includes("token") || key.includes("secret") || key.includes("refresh") || key.includes("authorization")) {
      continue;
    }
    if (key.includes("email") || key.includes("phone") || key === "customername" || key === "customer") {
      continue;
    }
    out[k] = v;
  }
  return out;
}
