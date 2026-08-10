"use client";

import { useMemo, useState } from "react";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  fishProcessingConfig,
  fishProcessingSpeciesList,
  type FishSpeciesId,
} from "@/content/seo/fish-processing";
import { analytics } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * Shipping estimate UI — structured for a future carrier-rate API.
 * Today: lead capture only (no fabricated rates).
 */
export type ShippingQuoteRequest = {
  speciesId: FishSpeciesId;
  estimatedFinishedLb: number;
  destinationPostal: string;
  destinationCountry: string;
  name: string;
  email: string;
  phone: string;
  charterDate: string;
  notes: string;
};

export type ShippingQuoteResult =
  | {
      status: "lead_required";
      summary: {
        estimatedProcessedWeightLb: number;
        destination: string;
        packagingRequirement: string;
        message: string;
      };
    }
  | {
      status: "quote";
      /** Reserved for live carrier integration. */
      amountUsd?: number;
      currency?: string;
      carrier?: string;
    };

function buildLeadRequiredSummary(input: {
  speciesId: FishSpeciesId;
  estimatedFinishedLb: number;
  destinationPostal: string;
  destinationCountry: string;
}): Extract<ShippingQuoteResult, { status: "lead_required" }>["summary"] {
  const speciesName =
    fishProcessingSpeciesList.find((s) => s.id === input.speciesId)?.name ?? "Catch";
  const destination = [input.destinationPostal.trim(), input.destinationCountry.trim()]
    .filter(Boolean)
    .join(", ");

  return {
    estimatedProcessedWeightLb: input.estimatedFinishedLb,
    destination: destination || "Not provided",
    packagingRequirement: `Insulated cold-chain packaging for ~${input.estimatedFinishedLb} lb finished ${speciesName}`,
    message: fishProcessingConfig.shipping.quoteDependsNote,
  };
}

function buildQuotePreview(input: {
  speciesId: FishSpeciesId;
  estimatedFinishedLb: number;
  destinationPostal: string;
  destinationCountry: string;
}): ShippingQuoteResult {
  // liveRatesEnabled reserved for future carrier-rate API → { status: "quote", ... }
  return {
    status: "lead_required",
    summary: buildLeadRequiredSummary(input),
  };
}

const inputClass = cn(
  "w-full rounded-xl border border-white/15 bg-white/5 text-white transition-colors",
  "placeholder:text-white/35",
  "focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary",
  "disabled:opacity-60 disabled:cursor-not-allowed h-11 px-4"
);

export function ShippingEstimator() {
  const [speciesId, setSpeciesId] = useState<FishSpeciesId>("yellowfin");
  const [estimatedFinishedLb, setEstimatedFinishedLb] = useState(40);
  const [destinationPostal, setDestinationPostal] = useState("");
  const [destinationCountry, setDestinationCountry] = useState("USA");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [charterDate, setCharterDate] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const preview = useMemo(
    () =>
      buildQuotePreview({
        speciesId,
        estimatedFinishedLb,
        destinationPostal,
        destinationCountry,
      }),
    [speciesId, estimatedFinishedLb, destinationPostal, destinationCountry]
  );

  const canPreview =
    estimatedFinishedLb > 0 && (destinationPostal.trim().length > 0 || destinationCountry.trim().length > 0);

  const handlePreview = () => {
    if (!canPreview) return;
    setShowPreview(true);
    analytics.fishProcessingShippingStarted("shipping_estimator");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setStatus("loading");
    setErrorMessage(null);

    const speciesName =
      fishProcessingSpeciesList.find((s) => s.id === speciesId)?.name ?? speciesId;
    const message = [
      "SHIPPING QUOTE REQUEST — Cabo Fish Processing",
      `Lead source: ${fishProcessingConfig.shipping.leadSource}`,
      `Name: ${name.trim()}`,
      `Email: ${email.trim()}`,
      phone.trim() ? `Phone: ${phone.trim()}` : null,
      `Species: ${speciesName}`,
      `Estimated finished processed weight: ${estimatedFinishedLb} lb`,
      `Destination ZIP/postal: ${destinationPostal.trim() || "n/a"}`,
      `Destination country: ${destinationCountry.trim() || "n/a"}`,
      charterDate.trim() ? `Charter date: ${charterDate.trim()}` : null,
      notes.trim() ? `Notes: ${notes.trim()}` : null,
      "",
      fishProcessingConfig.shipping.availabilityNote,
    ]
      .filter((line) => line !== null)
      .join("\n");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          message,
        }),
      });
      if (!res.ok) {
        setErrorMessage(
          res.status === 429
            ? "Too many requests — please wait a moment and try again."
            : "Something went wrong. Try again or use the contact page."
        );
        setStatus("error");
        return;
      }
      analytics.fishProcessingShippingLeadSubmitted(fishProcessingConfig.shipping.leadSource);
      analytics.contactSubmit(fishProcessingConfig.shipping.leadSource);
      setStatus("success");
    } catch {
      setErrorMessage("Something went wrong. Try again or use the contact page.");
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <section
        id="shipping-estimator"
        className="scroll-mt-24 section-padding bg-[#0a1422] border-t border-white/5"
        aria-labelledby="shipping-estimator-heading"
      >
        <div className="container-wide mx-auto px-5 sm:px-6 lg:px-8 max-w-2xl text-center py-8">
          <CheckCircle className="h-12 w-12 text-brand-primary mx-auto mb-4" aria-hidden />
          <h2 id="shipping-estimator-heading" className="font-display font-bold text-white text-2xl">
            Quote request sent
          </h2>
          <p className="mt-3 text-white/65">
            We&apos;ll review destination eligibility and follow up with shipping options when
            available.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      id="shipping-estimator"
      className="scroll-mt-24 section-padding bg-[#0a1422] border-t border-white/5"
      aria-labelledby="shipping-estimator-heading"
    >
      <div className="container-wide mx-auto px-5 sm:px-6 lg:px-8">
        <div className="max-w-3xl mb-8">
          <h2
            id="shipping-estimator-heading"
            className="font-display font-extrabold text-white text-2xl sm:text-3xl lg:text-4xl tracking-tight"
          >
            SHIPPING ESTIMATE
          </h2>
          <p className="mt-3 text-white/65 leading-relaxed">
            Enter your catch details and destination. We&apos;ll prepare a quote request — live carrier
            rates are not shown here yet.
          </p>
          <p className="mt-2 text-sm text-white/45">{fishProcessingConfig.shipping.availabilityNote}</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 lg:gap-8">
          <div className="space-y-4 rounded-xl border border-white/10 bg-[#0c1829] p-5 sm:p-6">
            <div>
              <label htmlFor="ship-species" className="block text-sm font-medium text-white/80 mb-1.5">
                Species
              </label>
              <select
                id="ship-species"
                value={speciesId}
                onChange={(e) => setSpeciesId(e.target.value as FishSpeciesId)}
                className={inputClass}
              >
                {fishProcessingSpeciesList.map((s) => (
                  <option key={s.id} value={s.id} className="bg-brand-dark text-white">
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ship-weight" className="block text-sm font-medium text-white/80 mb-1.5">
                Estimated finished processed weight (lb)
              </label>
              <input
                id="ship-weight"
                type="number"
                min={1}
                max={500}
                value={estimatedFinishedLb}
                onChange={(e) => setEstimatedFinishedLb(Number(e.target.value) || 0)}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="ship-postal" className="block text-sm font-medium text-white/80 mb-1.5">
                Destination ZIP / postal code
              </label>
              <input
                id="ship-postal"
                type="text"
                value={destinationPostal}
                onChange={(e) => setDestinationPostal(e.target.value)}
                className={inputClass}
                autoComplete="postal-code"
                placeholder="e.g. 78701"
              />
            </div>

            <div>
              <label htmlFor="ship-country" className="block text-sm font-medium text-white/80 mb-1.5">
                Destination country
              </label>
              <input
                id="ship-country"
                type="text"
                value={destinationCountry}
                onChange={(e) => setDestinationCountry(e.target.value)}
                className={inputClass}
                autoComplete="country-name"
              />
            </div>

            <Button
              type="button"
              variant="outline"
              className="rounded-xl border-white/30 text-white hover:bg-white/10"
              disabled={!canPreview}
              onClick={handlePreview}
            >
              Preview quote request
            </Button>
          </div>

          <div className="space-y-5">
            {showPreview && preview.status === "lead_required" ? (
              <div className="rounded-xl border border-brand-primary/30 bg-brand-primary/10 p-5 sm:p-6 space-y-3">
                <p className="text-[11px] font-bold tracking-[0.18em] text-brand-primary uppercase">
                  Shipping quote request
                </p>
                <dl className="space-y-2 text-sm text-white/80">
                  <div className="flex justify-between gap-4">
                    <dt className="text-white/50">Processed weight</dt>
                    <dd className="font-semibold tabular-nums">
                      ≈ {preview.summary.estimatedProcessedWeightLb} lb
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-white/50">Destination</dt>
                    <dd className="font-semibold text-right">{preview.summary.destination}</dd>
                  </div>
                  <div>
                    <dt className="text-white/50 mb-1">Packaging</dt>
                    <dd>{preview.summary.packagingRequirement}</dd>
                  </div>
                </dl>
                <p className="text-xs text-white/55 leading-relaxed">{preview.summary.message}</p>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-white/15 p-5 text-sm text-white/45">
                Enter weight and destination, then preview your quote request. No live shipping rates
                are calculated on this page.
              </div>
            )}

            <form
              onSubmit={handleSubmit}
              className="rounded-xl border border-white/10 bg-[#0c1829] p-5 sm:p-6 space-y-4"
            >
              <p className="text-sm font-semibold text-white">Request a shipping quote</p>
              <div>
                <label htmlFor="ship-name" className="block text-sm font-medium text-white/80 mb-1.5">
                  Name
                </label>
                <input
                  id="ship-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                  autoComplete="name"
                  disabled={status === "loading"}
                />
              </div>
              <div>
                <label htmlFor="ship-email" className="block text-sm font-medium text-white/80 mb-1.5">
                  Email
                </label>
                <input
                  id="ship-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  autoComplete="email"
                  disabled={status === "loading"}
                />
              </div>
              <div>
                <label htmlFor="ship-phone" className="block text-sm font-medium text-white/80 mb-1.5">
                  Phone <span className="text-white/40">(optional)</span>
                </label>
                <input
                  id="ship-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputClass}
                  autoComplete="tel"
                  disabled={status === "loading"}
                />
              </div>
              <div>
                <label htmlFor="ship-date" className="block text-sm font-medium text-white/80 mb-1.5">
                  Charter date <span className="text-white/40">(optional)</span>
                </label>
                <input
                  id="ship-date"
                  type="date"
                  value={charterDate}
                  onChange={(e) => setCharterDate(e.target.value)}
                  className={inputClass}
                  disabled={status === "loading"}
                />
              </div>
              <div>
                <label htmlFor="ship-notes" className="block text-sm font-medium text-white/80 mb-1.5">
                  Notes <span className="text-white/40">(optional)</span>
                </label>
                <textarea
                  id="ship-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={cn(inputClass, "h-auto min-h-[88px] py-3 resize-y")}
                  disabled={status === "loading"}
                  placeholder="Destination details, preferred delivery window, etc."
                />
              </div>
              {status === "error" && errorMessage ? (
                <p className="text-sm text-red-400">{errorMessage}</p>
              ) : null}
              <Button
                type="submit"
                size="lg"
                className="w-full rounded-xl font-bold tracking-wide"
                disabled={status === "loading"}
              >
                {status === "loading" ? "Sending…" : "REQUEST SHIPPING QUOTE"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
