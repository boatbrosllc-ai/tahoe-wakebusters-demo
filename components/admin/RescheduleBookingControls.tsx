"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";
import { buildSlotId, parseSlotId } from "@/lib/booking/experience-slots";
import {
  charterRescheduleStartOptions,
  clockValueFromSlot,
  formatSlotIdAdminLabel,
  isSharedTicketedReschedule,
  parseClockValue,
} from "@/lib/booking/admin-reschedule";

type RescheduleBooking = {
  id: string;
  slotId?: string | null;
  durationHours?: number | null;
  status: string;
  bookingMode?: string | null;
  pricingType?: string | null;
  boatId?: string | null;
  startDate?: string | null;
  startTime?: string | null;
};

function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function RescheduleBookingControls({
  booking,
  onMoved,
  notifyGuest = true,
}: {
  booking: RescheduleBooking;
  onMoved: () => void;
  /** Website bookings email the guest; Boatsetter / ingested marketplace bookings do not. */
  notifyGuest?: boolean;
}) {
  const parsed = booking.slotId ? parseSlotId(booking.slotId) : null;
  const ticketed = isSharedTicketedReschedule({
    bookingMode: booking.bookingMode,
    pricingType: booking.pricingType,
    boatId: booking.boatId,
  });
  const startOptions = useMemo(() => charterRescheduleStartOptions(), []);
  const [dateStr, setDateStr] = useState(parsed?.dateStr ?? "");
  const [clock, setClock] = useState(parsed ? clockValueFromSlot(parsed) : "7:00");
  const [confirmPricing, setConfirmPricing] = useState(false);
  const [pricingPrompt, setPricingPrompt] = useState<{ oldCents: number; newCents: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const next = booking.slotId ? parseSlotId(booking.slotId) : null;
    setDateStr(next?.dateStr ?? "");
    setClock(next ? clockValueFromSlot(next) : "7:00");
    setConfirmPricing(false);
    setPricingPrompt(null);
    setError(null);
    setSuccess(null);
    // Intentionally keyed on booking id only so a successful move can keep the green confirmation.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on open, not after slot rewrite
  }, [booking.id]);

  if (!booking.slotId || !BOOKING_STATUSES_SLOT_TAKEN.has(booking.status as never)) return null;

  const currentLabel = booking.slotId
    ? formatSlotIdAdminLabel(booking.slotId)
    : [booking.startDate, booking.startTime].filter(Boolean).join(" · ");

  const clearMessages = () => {
    setSuccess(null);
    setError(null);
    setConfirmPricing(false);
    setPricingPrompt(null);
  };

  const submit = async () => {
    if (!booking.slotId || !dateStr) return;
    const duration = parsed?.durationHours ?? booking.durationHours ?? 1;
    const clockParsed = parseClockValue(clock);
    const slotId = ticketed
      ? buildSlotId(dateStr, parsed?.startHour ?? 17, duration, parsed?.startMinute ?? 0)
      : buildSlotId(dateStr, clockParsed?.hour ?? parsed?.startHour ?? 7, duration, clockParsed?.minute ?? 0);
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/bookings/${booking.id}/reschedule`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId,
          dateStr,
          confirmPricingChange: confirmPricing,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        oldTotalCents?: number;
        newTotalCents?: number;
        label?: string;
        previousLabel?: string;
      };
      if (res.status === 409 && data.code === "PRICING_CHANGE_REQUIRES_CONFIRMATION") {
        const oldTotal = typeof data.oldTotalCents === "number" ? data.oldTotalCents : 0;
        const newTotal = typeof data.newTotalCents === "number" ? data.newTotalCents : 0;
        setPricingPrompt({ oldCents: oldTotal, newCents: newTotal });
        setConfirmPricing(false);
        setError(null);
        return;
      }
      if (!res.ok) {
        setPricingPrompt(null);
        setError(data.error ?? "Could not reschedule this booking.");
        return;
      }
      const movedTo = data.label ?? formatSlotIdAdminLabel(slotId);
      setPricingPrompt(null);
      setSuccess(
        notifyGuest
          ? `Moved to ${movedTo}. The guest will get a confirmation email.`
          : `Moved to ${movedTo}. Marketplace guests already have confirmation from that site.`
      );
      onMoved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reschedule this booking.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-w-0 w-full rounded-2xl border border-brand-dark/10 bg-brand-bg/40 p-4 space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Reschedule</p>
        <p className="mt-1 text-sm text-brand-dark break-words">
          Now booked for <span className="font-semibold">{currentLabel}</span>
        </p>
        <p className="mt-1 block w-full text-xs text-brand-muted break-words whitespace-normal">
          {ticketed
            ? `Still leaves at ${booking.startTime ?? "5:30 PM"}. Pick another day this listing runs.`
            : "Pick a new date and start time. The boat cannot overlap another trip."}
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <div className={`grid min-w-0 gap-3 ${ticketed ? "" : "sm:grid-cols-2"}`}>
          <label className="block min-w-0 text-xs font-medium text-brand-dark">
            New date
            <input
              type="date"
              value={dateStr}
              onChange={(e) => {
                setDateStr(e.target.value);
                clearMessages();
              }}
              className="mt-1 block w-full rounded-lg border border-brand-dark/20 bg-white px-3 py-2 text-sm text-brand-dark"
            />
          </label>
          {!ticketed && (
            <label className="block min-w-0 text-xs font-medium text-brand-dark">
              Start time
              <select
                value={clock}
                onChange={(e) => {
                  setClock(e.target.value);
                  clearMessages();
                }}
                className="mt-1 block w-full rounded-lg border border-brand-dark/20 bg-white px-3 py-2 text-sm text-brand-dark"
              >
                {startOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          disabled={loading || !dateStr || (pricingPrompt != null && !confirmPricing)}
          onClick={() => void submit()}
          className="w-full sm:w-auto"
        >
          {loading ? "Moving…" : "Reschedule"}
        </Button>
      </div>

      {pricingPrompt && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-2">
          <p className="text-sm text-amber-950 break-words">
            This date costs <span className="font-semibold">{formatUsd(pricingPrompt.newCents)}</span> instead of{" "}
            <span className="font-semibold">{formatUsd(pricingPrompt.oldCents)}</span>. Check the box to accept the new
            total, then click Reschedule again.
          </p>
          <label className="flex items-start gap-2 text-sm text-amber-950">
            <input
              type="checkbox"
              checked={confirmPricing}
              onChange={(e) => setConfirmPricing(e.target.checked)}
              className="mt-0.5 rounded border-amber-400"
            />
            Accept the new total
          </label>
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 break-words" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900 break-words" role="status">
          {success}
        </p>
      )}
    </div>
  );
}
