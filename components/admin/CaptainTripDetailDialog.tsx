"use client";

import {
  Clock,
  ExternalLink,
  FileCheck,
  MapPin,
  MessageSquare,
  Package,
  Phone,
  Ship,
  StickyNote,
  Users,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { formatBookingDate } from "@/lib/booking/format-booking-datetime";
import { MarketplaceSourceBadge } from "@/components/admin/MarketplaceSourceBadge";
import { MarketplaceEmailDetails } from "@/components/admin/MarketplaceEmailDetails";
import { OperatorNotesTimeline } from "@/components/admin/OperatorNotesTimeline";
import { resolveMarketplaceSource } from "@/lib/admin/marketplace-source";
import { fromOperatorNoteAuthorLabel, readOperatorNotesLog } from "@/lib/admin/operator-notes";
import {
  captainGuestNotes,
  captainPickupHasDetails,
  captainTripLabel,
  captainWaiverLabel,
  type CaptainTrip,
} from "@/lib/admin/captain-trip";

export function CaptainTripDetailDialog({
  selected,
  onClose,
}: {
  selected: CaptainTrip | null;
  onClose: () => void;
}) {
  const market = selected ? resolveMarketplaceSource(selected) : null;
  const guestNotes = selected ? captainGuestNotes(selected) : null;
  const opsLog = selected ? readOperatorNotesLog(selected) : [];

  return (
    <Dialog
      open={!!selected}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={selected ? captainTripLabel(selected) : "Trip"}
      description={
        selected
          ? `${formatBookingDate(new Date(selected.startAt))}${selected.startTime ? ` · ${selected.startTime}` : ""}${selected.endTime ? ` – ${selected.endTime}` : ""}`
          : undefined
      }
      fullScreenOnMobile
    >
      {selected && (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-2xl bg-brand-bg/70 px-4 py-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand-muted">
                <Ship className="h-3.5 w-3.5" aria-hidden /> Boat
              </p>
              <p className="mt-1 font-medium text-brand-dark">{selected.boatName || "—"}</p>
              {selected.experienceName && (
                <p className="text-xs text-brand-muted">{selected.experienceName}</p>
              )}
              {selected.durationHours != null && selected.durationHours > 0 && (
                <p className="mt-1 flex items-center gap-1 text-xs text-brand-muted">
                  <Clock className="h-3 w-3" aria-hidden />
                  {selected.durationHours} hour{selected.durationHours !== 1 ? "s" : ""}
                </p>
              )}
            </div>
            <div className="rounded-2xl bg-brand-bg/70 px-4 py-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand-muted">
                <Users className="h-3.5 w-3.5" aria-hidden /> Party
              </p>
              <p className="mt-1 font-medium text-brand-dark">
                {selected.partySize != null
                  ? `${selected.partySize} guest${selected.partySize !== 1 ? "s" : ""}`
                  : "—"}
                {selected.petsCount
                  ? ` · ${selected.petsCount} pet${selected.petsCount !== 1 ? "s" : ""}`
                  : ""}
              </p>
              {selected.waiver?.status && (
                <p className="mt-1 flex items-center gap-1 text-xs text-brand-muted">
                  <FileCheck className="h-3 w-3" aria-hidden />
                  Waiver {captainWaiverLabel(selected.waiver.status).toLowerCase()}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-brand-dark/10 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-muted">Guest</p>
            <p className="mt-1 text-lg font-semibold text-brand-dark">{selected.customer?.name || "—"}</p>
            {selected.customer?.phone && (
              <a
                href={`tel:${selected.customer.phone}`}
                className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white"
              >
                <Phone className="h-4 w-4" aria-hidden />
                Call {selected.customer.phone}
              </a>
            )}
          </div>

          {(captainPickupHasDetails(selected.pickup) || selected.locationText) && (
            <div className="rounded-2xl bg-brand-dark px-4 py-3 text-white">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/50">
                <MapPin className="h-3.5 w-3.5" aria-hidden /> Pickup
              </p>
              {selected.pickup?.title && <p className="mt-1 font-medium">{selected.pickup.title}</p>}
              {selected.pickup?.address && (
                <p className="mt-0.5 text-sm leading-relaxed text-white/85">{selected.pickup.address}</p>
              )}
              {!selected.pickup?.title && !selected.pickup?.address && selected.locationText && (
                <p className="mt-1 text-sm leading-relaxed">{selected.locationText}</p>
              )}
              {selected.pickup?.notes && (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/80">
                  {selected.pickup.notes}
                </p>
              )}
              {selected.pickup?.arrivalInstructions && (
                <p className="mt-2 text-sm leading-relaxed text-white/70">{selected.pickup.arrivalInstructions}</p>
              )}
              {selected.pickup?.mapUrl && (
                <a
                  href={selected.pickup.mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/25"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  Get directions
                </a>
              )}
            </div>
          )}

          {(selected.addonsWithNames?.length ?? 0) > 0 && (
            <div className="rounded-2xl border border-brand-dark/10 px-4 py-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand-muted">
                <Package className="h-3.5 w-3.5" aria-hidden /> Add-ons
              </p>
              <ul className="mt-2 space-y-1.5 text-sm text-brand-dark">
                {selected.addonsWithNames!.map((a) => (
                  <li key={a.addonId} className="flex items-baseline justify-between gap-3">
                    <span>{a.name}</span>
                    <span className="tabular-nums text-brand-muted">×{a.qty}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {opsLog.length > 0 && (
            <div className="rounded-2xl border border-brand-primary/30 bg-brand-primary/10 px-4 py-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand-primary">
                <MessageSquare className="h-3.5 w-3.5" aria-hidden />{" "}
                {fromOperatorNoteAuthorLabel(opsLog[opsLog.length - 1]!)}
              </p>
              <OperatorNotesTimeline entries={opsLog} className="mt-3" tone="captain" />
            </div>
          )}

          {guestNotes && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-800">
                <StickyNote className="h-3.5 w-3.5" aria-hidden /> Guest requests
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-amber-950">{guestNotes}</p>
            </div>
          )}

          {market && (
            <div className="flex flex-wrap items-center gap-2">
              <MarketplaceSourceBadge booking={selected} />
              {selected.externalBookingId && (
                <span className="text-xs text-brand-muted">Ref {selected.externalBookingId}</span>
              )}
            </div>
          )}
          <MarketplaceEmailDetails details={selected.marketplaceDetails} />
        </div>
      )}
    </Dialog>
  );
}
