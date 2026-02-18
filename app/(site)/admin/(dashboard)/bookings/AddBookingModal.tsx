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
  { value: "Email", label: "Email" },
  { value: "Other", label: "Other" },
];

const DURATION_OPTIONS = [2, 3, 4, 6, 8];
const START_HOURS = Array.from({ length: 12 }, (_, i) => i + 7); // 7–18 (operating hours 7am–7pm)

type ExperienceOption = { id: string; title: string };
type BoatOption = { id: string; name: string; experienceIds?: string[] };

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
  const [referenceNumber, setReferenceNumber] = useState("");
  const [specialNotes, setSpecialNotes] = useState("");
  const [boats, setBoats] = useState<BoatOption[]>([]);
  const [boatId, setBoatId] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoadingExperiences(true);
    setError(null);
    Promise.all([
      fetch("/api/admin/experiences", { credentials: "include" }).then((res) => res.json()),
      fetch("/api/admin/boats", { credentials: "include" }).then((res) => res.json()),
    ])
      .then(([expData, boatData]) => {
        const expList = Array.isArray(expData) ? expData : [];
        setExperiences(expList.map((e: { id: string; title?: string }) => ({ id: e.id, title: e.title ?? e.id })));
        if (expList.length > 0 && !experienceId) setExperienceId(expList[0].id);
        const boatList = Array.isArray((boatData as { boats?: unknown })?.boats) ? (boatData as { boats: BoatOption[] }).boats : Array.isArray(boatData) ? (boatData as BoatOption[]) : [];
        setBoats(boatList.map((b) => ({ id: b.id, name: b.name ?? b.id, experienceIds: b.experienceIds })));
      })
      .catch(() => {
        setExperiences([]);
        setBoats([]);
      })
      .finally(() => setLoadingExperiences(false));
  }, [open]);

  const boatsForExperience = experienceId
    ? boats.filter((b) => b.experienceIds?.includes(experienceId))
    : [];
  const showBoatSelect = boatsForExperience.length > 1;
  useEffect(() => {
    setBoatId("");
  }, [experienceId]);

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
          boatId: boatId && boatsForExperience.some((b) => b.id === boatId) ? boatId : undefined,
          customer: { name: customerName.trim(), email: customerEmail.trim(), phone: customerPhone.trim() },
          partySize: partySize > 0 ? partySize : 1,
          totalCents,
          source: source || undefined,
          externalReference: referenceNumber.trim() || undefined,
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
      setReferenceNumber("");
      setSpecialNotes("");
      setBoatId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create booking");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = "w-full rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none";
  const dialogDescription = "Enter booking details from another source (GetMyBoat, Viator, phone, etc.) to keep everything in one place.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Add booking" description={dialogDescription}>
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

        {showBoatSelect && (
          <div>
            <label htmlFor="add-booking-boat" className="block text-sm font-medium text-brand-dark mb-1">Boat</label>
            <select
              id="add-booking-boat"
              value={boatId}
              onChange={(e) => setBoatId(e.target.value)}
              className={inputClass}
            >
              <option value="">Any / assign later</option>
              {boatsForExperience.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}

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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <label htmlFor="add-booking-reference" className="block text-sm font-medium text-brand-dark mb-1">Confirmation / reference #</label>
            <input
              id="add-booking-reference"
              type="text"
              placeholder="e.g. GMB-12345"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
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
