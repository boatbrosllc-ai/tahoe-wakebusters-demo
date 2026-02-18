"use client";

import { useState, useEffect } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SOURCE_OPTIONS = [
  { value: "", label: "Select source (optional)" },
  { value: "GetMyBoat", label: "GetMyBoat" },
  { value: "Viator", label: "Viator" },
  { value: "Phone", label: "Phone" },
  { value: "Other", label: "Other" },
];

const DURATION_OPTIONS = [2, 3, 4, 6, 8];
const START_HOURS = Array.from({ length: 17 }, (_, i) => i + 7); // 7–23

type ExperienceOption = { id: string; title: string };

export function AddBookingModal({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}) {
  const [experiences, setExperiences] = useState<ExperienceOption[]>([]);
  const [loadingExperiences, setLoadingExperiences] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [experienceId, setExperienceId] = useState("");
  const [tripDate, setTripDate] = useState("");
  const [startHour, setStartHour] = useState(11);
  const [durationHours, setDurationHours] = useState(4);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [partySize, setPartySize] = useState(4);
  const [totalDollars, setTotalDollars] = useState("");
  const [source, setSource] = useState("");
  const [specialNotes, setSpecialNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoadingExperiences(true);
    setError(null);
    fetch("/api/admin/experiences", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setExperiences(list.map((e: { id: string; title?: string }) => ({ id: e.id, title: e.title ?? e.id })));
        if (list.length > 0 && !experienceId) setExperienceId(list[0].id);
      })
      .catch(() => setExperiences([]))
      .finally(() => setLoadingExperiences(false));
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!customerName.trim() || !customerEmail.trim()) {
      setError("Customer name and email are required.");
      return;
    }
    const totalCents = Math.round(parseFloat(totalDollars || "0") * 100);
    if (totalCents < 0) {
      setError("Total amount must be ≥ 0.");
      return;
    }
    if (!experienceId || !tripDate) {
      setError("Experience and trip date are required.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          experienceId,
          tripDate,
          startHour,
          durationHours,
          customer: { name: customerName.trim(), email: customerEmail.trim(), phone: customerPhone.trim() },
          partySize: partySize > 0 ? partySize : 1,
          totalCents,
          source: source || undefined,
          specialNotes: specialNotes.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to create booking");
      }
      onOpenChange(false);
      onSuccess?.();
      setCustomerName("");
      setCustomerEmail("");
      setCustomerPhone("");
      setTotalDollars("");
      setSource("");
      setSpecialNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create booking");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = "w-full rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none";

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Add booking" description="Manually add a booking (e.g. from GetMyBoat, Viator, or phone).">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="add-booking-experience" className="block text-sm font-medium text-brand-dark mb-1">Experience *</label>
          <select
            id="add-booking-experience"
            value={experienceId}
            onChange={(e) => setExperienceId(e.target.value)}
            className={inputClass}
            required
            disabled={loadingExperiences}
          >
            {loadingExperiences ? (
              <option>Loading…</option>
            ) : (
              <>
                <option value="">Select experience</option>
                {experiences.map((e) => (
                  <option key={e.id} value={e.id}>{e.title}</option>
                ))}
              </>
            )}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="add-booking-date" className="block text-sm font-medium text-brand-dark mb-1">Trip date *</label>
            <input
              id="add-booking-date"
              type="date"
              value={tripDate}
              onChange={(e) => setTripDate(e.target.value)}
              className={inputClass}
              required
            />
          </div>
          <div>
            <label htmlFor="add-booking-time" className="block text-sm font-medium text-brand-dark mb-1">Start time</label>
            <select
              id="add-booking-time"
              value={startHour}
              onChange={(e) => setStartHour(parseInt(e.target.value, 10))}
              className={inputClass}
            >
              {START_HOURS.map((h) => (
                <option key={h} value={h}>
                  {h === 12 ? "12:00 PM" : h < 12 ? `${h}:00 AM` : `${h - 12}:00 PM`}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="add-booking-duration" className="block text-sm font-medium text-brand-dark mb-1">Duration (hours)</label>
          <select
            id="add-booking-duration"
            value={durationHours}
            onChange={(e) => setDurationHours(parseInt(e.target.value, 10))}
            className={inputClass}
          >
            {DURATION_OPTIONS.map((d) => (
              <option key={d} value={d}>{d} hrs</option>
            ))}
          </select>
        </div>

        <div className="border-t border-brand-dark/10 pt-4">
          <p className="text-sm font-medium text-brand-dark mb-2">Customer</p>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Name *"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className={inputClass}
              required
            />
            <input
              type="email"
              placeholder="Email *"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              className={inputClass}
              required
            />
            <input
              type="tel"
              placeholder="Phone"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="add-booking-party" className="block text-sm font-medium text-brand-dark mb-1">Party size</label>
            <input
              id="add-booking-party"
              type="number"
              min={1}
              value={partySize}
              onChange={(e) => setPartySize(parseInt(e.target.value, 10) || 1)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="add-booking-total" className="block text-sm font-medium text-brand-dark mb-1">Total (USD) *</label>
            <input
              id="add-booking-total"
              type="number"
              min={0}
              step={0.01}
              placeholder="0.00"
              value={totalDollars}
              onChange={(e) => setTotalDollars(e.target.value)}
              className={inputClass}
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="add-booking-source" className="block text-sm font-medium text-brand-dark mb-1">Source</label>
          <select
            id="add-booking-source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className={inputClass}
          >
            {SOURCE_OPTIONS.map((o) => (
              <option key={o.value || "none"} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="add-booking-notes" className="block text-sm font-medium text-brand-dark mb-1">Notes</label>
          <textarea
            id="add-booking-notes"
            rows={2}
            placeholder="Optional notes"
            value={specialNotes}
            onChange={(e) => setSpecialNotes(e.target.value)}
            className={cn(inputClass, "resize-none")}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Add booking"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
