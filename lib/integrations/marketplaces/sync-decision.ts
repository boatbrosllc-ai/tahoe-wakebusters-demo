import { findListingMapping } from "./mapping";
import type { ExternalBookingEvent, MarketplaceSyncAction } from "./types";
import type { MarketplaceListingMap } from "./types";

export type ExistingExternalBooking = {
  id: string;
  status?: string;
  externalKey?: string;
  slotId?: string;
  partySize?: number;
  experienceId?: string;
  boatId?: string;
};

export type DecideSyncInput = {
  event: ExternalBookingEvent;
  existing: ExistingExternalBooking | null;
  mappings: MarketplaceListingMap[];
  mappedExperienceId?: string | null;
  mappedDurationHours?: number | null;
  messageAlreadyProcessed?: boolean;
};

export function decideMarketplaceSyncAction(input: DecideSyncInput): MarketplaceSyncAction {
  if (input.messageAlreadyProcessed) {
    return { type: "ignore", reason: "duplicate_gmail_message" };
  }
  const { event, existing } = input;
  if (event.eventType === "informational") {
    return { type: "informational", reason: "reminder_or_secondary_email" };
  }
  if (!event.externalBookingId) {
    return { type: "needs_review", reason: "missing_booking_id" };
  }
  if (event.eventType === "booking_cancelled") {
    if (!existing || existing.status === "canceled" || existing.status === "refunded") {
      return { type: "ignore", reason: existing ? "already_canceled" : "no_existing_booking_to_cancel" };
    }
    return { type: "cancel" };
  }

  const mapping = findListingMapping(event, input.mappings);
  if (!mapping && !input.mappedExperienceId) {
    return { type: "needs_mapping", reason: "marketplace_listing_unmapped" };
  }

  const duration = event.durationHours ?? mapping?.durationHours ?? input.mappedDurationHours ?? null;

  if (event.eventType === "booking_created") {
    if (existing && existing.status !== "canceled" && existing.status !== "refunded") {
      return { type: "ignore", reason: "duplicate_external_booking" };
    }
    if (!event.startAt) {
      return { type: "needs_review", reason: "invalid_date_time" };
    }
    if (!duration) {
      return { type: "needs_review", reason: "missing_duration" };
    }
    return { type: "create" };
  }

  if (event.eventType === "booking_updated") {
    if (!event.startAt) {
      return { type: "needs_review", reason: "invalid_date_time" };
    }
    if (!duration) {
      return { type: "needs_review", reason: "missing_duration" };
    }
    if (!existing || existing.status === "canceled" || existing.status === "refunded") {
      return { type: "create" };
    }
    return { type: "update" };
  }

  return { type: "ignore", reason: "unhandled_event_type" };
}
