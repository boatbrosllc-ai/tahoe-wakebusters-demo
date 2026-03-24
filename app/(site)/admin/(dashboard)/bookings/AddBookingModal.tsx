"use client";

import { useState, useEffect, useMemo } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TAX_RATE } from "@/lib/booking/constants";

const SOURCE_OPTIONS = [
  { value: "", label: "Select source (optional)" },
  { value: "GetMyBoat", label: "GetMyBoat" },
  { value: "Viator", label: "Viator" },
  { value: "Phone", label: "Phone" },
  { value: "Email", label: "Email" },
  { value: "Other", label: "Other" },
];

const CARD_BRANDS = [
  { value: "", label: "Select brand (optional)" },
  { value: "Visa", label: "Visa" },
  { value: "Mastercard", label: "Mastercard" },
  { value: "Amex", label: "Amex" },
  { value: "Discover", label: "Discover" },
  { value: "Other", label: "Other" },
];

const DURATION_OPTIONS = [2, 3, 4, 6, 8];
const START_HOURS = Array.from({ length: 13 }, (_, i) => i + 7); // 7–19 (last departure 7pm)

const taxPercentLabel = `${(TAX_RATE * 100).toFixed(2)}%`;

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
  const [amountIncludesTax, setAmountIncludesTax] = useState(false);
  const [source, setSource] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [specialNotes, setSpecialNotes] = useState("");
  const [boats, setBoats] = useState<BoatOption[]>([]);
  const [boatId, setBoatId] = useState("");
  // Billing & payment (optional)
  const [billingLine1, setBillingLine1] = useState("");
  const [billingLine2, setBillingLine2] = useState("");
  const [billingCity, setBillingCity] = useState("");
  const [billingState, setBillingState] = useState("");
  const [billingZip, setBillingZip] = useState("");
  const [billingCountry, setBillingCountry] = useState("");
  const [cardLast4, setCardLast4] = useState("");
  const [cardBrand, setCardBrand] = useState("");
  const [cardExpMonth, setCardExpMonth] = useState("");
  const [cardExpYear, setCardExpYear] = useState("");
  const [confirmZeroDollarBooking, setConfirmZeroDollarBooking] = useState(false);

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

  const boatsForExperience = useMemo(
    () => (experienceId ? boats.filter((b) => b.experienceIds?.includes(experienceId)) : []),
    [experienceId, boats]
  );

  const pricingPreview = useMemo(() => {
    const raw = Math.round(parseFloat(totalDollars || "0") * 100);
    if (raw < 0 || Number.isNaN(raw)) return { subtotalCents: 0, taxCents: 0, totalCents: 0 };
    const subtotalCents = amountIncludesTax ? Math.floor(raw / (1 + TAX_RATE)) : raw;
    const taxCents = Math.round(subtotalCents * TAX_RATE);
    return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
  }, [totalDollars, amountIncludesTax]);
  const showBoatSelect = boatsForExperience.length > 1;
  useEffect(() => {
    if (boatsForExperience.length === 1) {
      setBoatId(boatsForExperience[0].id);
    } else {
      setBoatId("");
    }
  }, [experienceId, boatsForExperience]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!customerName.trim() || !customerEmail.trim()) {
      setError("Customer name and email are required.");
      return;
    }
    const rawCents = Math.round(parseFloat(totalDollars || "0") * 100);
    const subtotalCents = amountIncludesTax ? Math.floor(rawCents / (1 + TAX_RATE)) : rawCents;
    if (subtotalCents < 0) {
      setError("Subtotal must be ≥ 0.");
      return;
    }
    if (subtotalCents === 0 && !confirmZeroDollarBooking) {
      setError("Check the box to confirm a $0 booking, or enter a non-zero amount.");
      return;
    }
    if (!experienceId || !tripDate) {
      setError("Experience and trip date are required.");
      return;
    }
    if (showBoatSelect && !boatId) {
      setError("Select which boat this booking is for.");
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
          boatId:
            boatId && boatsForExperience.some((b) => b.id === boatId)
              ? boatId
              : boatsForExperience.length === 1
                ? boatsForExperience[0].id
                : undefined,
          customer: { name: customerName.trim(), email: customerEmail.trim(), phone: customerPhone.trim() },
          partySize: partySize > 0 ? partySize : 1,
          subtotalCents,
          amountIncludesTax,
          ...(subtotalCents === 0 ? { confirmZeroDollarBooking: true } : {}),
          source: source || undefined,
          externalReference: referenceNumber.trim() || undefined,
          specialNotes: specialNotes.trim() || undefined,
          ...(billingLine1.trim() || billingCity.trim() || billingZip.trim()
            ? {
                billingAddress: {
                  line1: billingLine1.trim() || undefined,
                  line2: billingLine2.trim() || undefined,
                  city: billingCity.trim() || undefined,
                  state: billingState.trim() || undefined,
                  zip: billingZip.trim() || undefined,
                  country: billingCountry.trim() || undefined,
                },
              }
            : {}),
          ...(cardLast4.replace(/\D/g, "").length >= 4 || cardBrand
            ? {
                card: {
                  last4: cardLast4.replace(/\D/g, "").slice(-4) || undefined,
                  brand: cardBrand || undefined,
                  expMonth: cardExpMonth ? parseInt(cardExpMonth, 10) : undefined,
                  expYear: cardExpYear ? parseInt(cardExpYear, 10) : undefined,
                },
              }
            : {}),
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
      setBillingLine1("");
      setBillingLine2("");
      setBillingCity("");
      setBillingState("");
      setBillingZip("");
      setBillingCountry("");
      setCardLast4("");
      setCardBrand("");
      setCardExpMonth("");
      setCardExpYear("");
      setConfirmZeroDollarBooking(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create booking");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = "w-full rounded-lg border border-brand-dark/20 px-3 py-2.5 min-h-[44px] text-sm text-brand-dark focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none";
  const dialogDescription = "Enter booking details from another source (GetMyBoat, Viator, phone, etc.) to keep everything in one place.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Add booking" description={dialogDescription} fullScreenOnMobile>
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
            <label htmlFor="add-booking-boat" className="block text-sm font-medium text-brand-dark mb-1">Boat *</label>
            <select
              id="add-booking-boat"
              value={boatId}
              onChange={(e) => setBoatId(e.target.value)}
              className={inputClass}
              required
            >
              <option value="">Select boat</option>
              {boatsForExperience.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <label htmlFor="add-booking-total" className="block text-sm font-medium text-brand-dark mb-1">
              {amountIncludesTax
                ? `Total collected (USD, includes ${taxPercentLabel} tax) *`
                : `Subtotal (before ${taxPercentLabel} tax) (USD) *`}
            </label>
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
              aria-describedby="add-booking-total-hint"
            />
            <label className="mt-2 flex items-center gap-2 cursor-pointer text-sm text-brand-dark">
              <input
                type="checkbox"
                checked={amountIncludesTax}
                onChange={(e) => setAmountIncludesTax(e.target.checked)}
                className="h-4 w-4 rounded border-brand-dark/30 text-brand-primary"
              />
              Amount entered includes sales tax (we&apos;ll back-calculate the pre-tax subtotal)
            </label>
            <p id="add-booking-total-hint" className="text-xs text-brand-muted mt-1">
              {amountIncludesTax
                ? `We derive the pre-tax subtotal from your total (floor cents) so tax is not applied twice; totals may differ by up to 1¢ from a pure round-trip.`
                : `Tax (${taxPercentLabel}) is added to this subtotal; the stored booking total includes tax.`}
            </p>
            <p className="text-xs font-medium text-brand-dark mt-2">
              Total stored: ${(pricingPreview.totalCents / 100).toFixed(2)} including tax
              {!amountIncludesTax && (
                <span className="block font-normal text-brand-muted mt-0.5">
                  (subtotal ${(pricingPreview.subtotalCents / 100).toFixed(2)} + tax ${(pricingPreview.taxCents / 100).toFixed(2)})
                </span>
              )}
            </p>
            {pricingPreview.subtotalCents === 0 && (
              <label className="mt-3 flex items-start gap-2 cursor-pointer text-sm text-brand-dark">
                <input
                  type="checkbox"
                  checked={confirmZeroDollarBooking}
                  onChange={(e) => setConfirmZeroDollarBooking(e.target.checked)}
                  className="h-4 w-4 mt-0.5 rounded border-brand-dark/30 text-brand-primary"
                />
                <span>I confirm this is a complimentary or $0 booking</span>
              </label>
            )}
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

        <div className="border-t border-brand-dark/10 pt-4">
          <p className="text-sm font-medium text-brand-dark mb-2">Billing & payment</p>
          <p className="text-xs text-brand-muted mb-3">Optional. For records only. Do not enter full card numbers.</p>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Billing address line 1"
              value={billingLine1}
              onChange={(e) => setBillingLine1(e.target.value)}
              className={inputClass}
            />
            <input
              type="text"
              placeholder="Address line 2"
              value={billingLine2}
              onChange={(e) => setBillingLine2(e.target.value)}
              className={inputClass}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <input
                type="text"
                placeholder="City"
                value={billingCity}
                onChange={(e) => setBillingCity(e.target.value)}
                className={inputClass}
              />
              <input
                type="text"
                placeholder="State"
                value={billingState}
                onChange={(e) => setBillingState(e.target.value)}
                className={inputClass}
              />
              <input
                type="text"
                placeholder="ZIP"
                value={billingZip}
                onChange={(e) => setBillingZip(e.target.value)}
                className={inputClass}
              />
              <input
                type="text"
                placeholder="Country"
                value={billingCountry}
                onChange={(e) => setBillingCountry(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div>
                <label htmlFor="add-booking-card-last4" className="block text-xs font-medium text-brand-muted mb-1">Card last 4</label>
                <input
                  id="add-booking-card-last4"
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="1234"
                  value={cardLast4}
                  onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="add-booking-card-brand" className="block text-xs font-medium text-brand-muted mb-1">Card brand</label>
                <select
                  id="add-booking-card-brand"
                  value={cardBrand}
                  onChange={(e) => setCardBrand(e.target.value)}
                  className={inputClass}
                >
                  {CARD_BRANDS.map((o) => (
                    <option key={o.value || "none"} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="add-booking-card-exp-month" className="block text-xs font-medium text-brand-muted mb-1">Exp month</label>
                  <input
                    id="add-booking-card-exp-month"
                    type="text"
                    inputMode="numeric"
                    maxLength={2}
                    placeholder="MM"
                    value={cardExpMonth}
                    onChange={(e) => setCardExpMonth(e.target.value.replace(/\D/g, "").slice(0, 2))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="add-booking-card-exp-year" className="block text-xs font-medium text-brand-muted mb-1">Exp year</label>
                  <input
                    id="add-booking-card-exp-year"
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="YYYY"
                    value={cardExpYear}
                    onChange={(e) => setCardExpYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    className={inputClass}
                  />
                </div>
              </div>
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
