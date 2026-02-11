"use client";

import { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { ChevronLeft } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { parseSlotId } from "@/lib/booking/experience-slots";

const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
const stripePromise = STRIPE_PUBLISHABLE_KEY ? loadStripe(STRIPE_PUBLISHABLE_KEY) : null;

interface ExperienceItem {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  heroMedia: { type: "image" | "video"; url: string };
  maxGuests: number;
  petsMax: number;
  fromPriceCents: number | null;
  active: boolean;
}

interface BoatOption {
  id: string;
  name: string;
  photos: string[];
  fromPriceCents: number | null;
  rates: { id: string; durationHours: number; displayName: string; priceCents: number }[];
}

interface SlotDto {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
}

interface RateOption {
  id: string;
  durationHours: number;
  displayName: string;
  priceCents: number;
}

interface AddonOption {
  id: string;
  name: string;
  description?: string;
  priceCents: number;
  type: string;
  maxQty?: number;
  highlight?: boolean;
}

function getNextDays(days: number): { dateStr: string; label: string; weekday: string }[] {
  const out: { dateStr: string; label: string; weekday: string }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    out.push({
      dateStr,
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
    });
  }
  return out;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function BookingPaymentForm({
  onSuccess,
  onError,
}: {
  onSuccess: () => void;
  onError: (message: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);
    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: typeof window !== "undefined" ? window.location.href : "" },
        redirect: "if_required",
      });
      if (error) onError(error.message ?? "Payment failed");
      else onSuccess();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setProcessing(false);
    }
  };
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <PaymentElement />
      <button
        type="submit"
        disabled={!stripe || processing}
        className="w-full rounded-xl bg-brand-primary text-white font-semibold py-3.5 px-4 hover:bg-brand-primary/90 active:scale-[0.99] transition-all focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 disabled:opacity-60 disabled:pointer-events-none"
      >
        {processing ? "Processing…" : "Pay now"}
      </button>
    </form>
  );
}

import type { BookingModalInitialSelection } from "@/components/site/BookingModalContext";

type BookingModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSelection?: BookingModalInitialSelection | null;
};

const PETS_MAX = 4;

export function BookingModal({ open, onOpenChange, initialSelection }: BookingModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [experiences, setExperiences] = useState<ExperienceItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedExperience, setSelectedExperience] = useState<ExperienceItem | null>(null);
  const [boats, setBoats] = useState<BoatOption[]>([]);
  const [boatsLoading, setBoatsLoading] = useState(false);
  const [selectedBoat, setSelectedBoat] = useState<BoatOption | null>(null);
  const [experienceRates, setExperienceRates] = useState<RateOption[]>([]);
  const [experienceRatesLoading, setExperienceRatesLoading] = useState(false);
  const [addons, setAddons] = useState<AddonOption[]>([]);
  const [addonsLoading, setAddonsLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotDto[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<SlotDto | null>(null);
  // Step 4 form
  const [partySize, setPartySize] = useState(1);
  const [petsCount, setPetsCount] = useState(0);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [addonSelections, setAddonSelections] = useState<Record<string, number>>({});
  const [tipChoice, setTipChoice] = useState<"now" | "later" | null>(null);
  const [tipLaterMessageOpen, setTipLaterMessageOpen] = useState(false);
  const [howDidYouHear, setHowDidYouHear] = useState("");
  const [comments, setComments] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [cancellationAck, setCancellationAck] = useState(false);
  const [paymentPhase, setPaymentPhase] = useState<"form" | "loading" | "stripe" | "success">("form");
  const [holdId, setHoldId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const dateOptions = useMemo(() => getNextDays(35), []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    // When opening with pre-selection (date/slot), start at step 3 so we don't flash step 1
    if (initialSelection?.date) setStep(3);
    else setStep(1);
    setSelectedExperience(null);
    setBoats([]);
    setSelectedBoat(null);
    setExperienceRates([]);
    setAddons([]);
    setSelectedDate(null);
    setSlots([]);
    setSelectedSlot(null);
    setPartySize(1);
    setPetsCount(0);
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setAddonSelections({});
    setTipChoice(null);
    setTipLaterMessageOpen(false);
    setHowDidYouHear("");
    setComments("");
    setMarketingOptIn(false);
    setCancellationAck(false);
    setPaymentPhase("form");
    setHoldId(null);
    setClientSecret(null);
    setPaymentError(null);
    fetch("/api/experiences")
      .then((res) => res.json())
      .then((data) => {
        if (data.experiences?.length) setExperiences(data.experiences);
        else setExperiences([]);
      })
      .catch(() => setExperiences([]))
      .finally(() => setLoading(false));
  }, [open]);

  // When opened with initialSelection, apply it once experiences (and boats/slots) are ready
  useEffect(() => {
    if (!open || !initialSelection || !experiences?.length) return;
    const exp = experiences.find(
      (e) => e.id === initialSelection.experienceId || e.slug === initialSelection.experienceSlug
    );
    if (exp) {
      setSelectedExperience(exp);
      if (initialSelection.date) setSelectedDate(initialSelection.date);
    }
  }, [open, initialSelection, experiences]);

  useEffect(() => {
    if (!open || !initialSelection?.boatId || !boats.length) return;
    const boat = boats.find((b) => b.id === initialSelection.boatId);
    if (boat) setSelectedBoat(boat);
  }, [open, initialSelection, boats]);

  useEffect(() => {
    if (!open || !initialSelection?.slotId || !slots.length) return;
    const slot = slots.find((s) => s.id === initialSelection.slotId);
    if (slot) setSelectedSlot(slot);
  }, [open, initialSelection, slots]);

  useEffect(() => {
    if (!selectedExperience) {
      setBoats([]);
      setSelectedBoat(null);
      return;
    }
    setBoatsLoading(true);
    setSelectedBoat(null);
    fetch(`/api/booking/boats?experienceId=${encodeURIComponent(selectedExperience.id)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.boats && Array.isArray(data.boats)) setBoats(data.boats);
        else setBoats([]);
      })
      .catch(() => setBoats([]))
      .finally(() => setBoatsLoading(false));
  }, [selectedExperience]);

  useEffect(() => {
    if (!selectedExperience) {
      setAddons([]);
      return;
    }
    setAddonsLoading(true);
    fetch(`/api/booking/experience-addons?experienceId=${encodeURIComponent(selectedExperience.id)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.addons && Array.isArray(data.addons)) setAddons(data.addons);
        else setAddons([]);
      })
      .catch(() => setAddons([]))
      .finally(() => setAddonsLoading(false));
  }, [selectedExperience]);

  useEffect(() => {
    if (!selectedExperience || boats.length > 0) {
      setExperienceRates([]);
      return;
    }
    setExperienceRatesLoading(true);
    fetch(`/api/experiences/rates?experienceId=${encodeURIComponent(selectedExperience.id)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.rates && Array.isArray(data.rates)) setExperienceRates(data.rates);
        else setExperienceRates([]);
      })
      .catch(() => setExperienceRates([]))
      .finally(() => setExperienceRatesLoading(false));
  }, [selectedExperience, boats.length]);

  useEffect(() => {
    if (!selectedExperience || !selectedDate) {
      setSlots([]);
      setSelectedSlot(null);
      return;
    }
    setSlotsLoading(true);
    setSelectedSlot(null);
    fetch(
      `/api/booking/slots?experienceId=${encodeURIComponent(selectedExperience.id)}&startDate=${selectedDate}&endDate=${selectedDate}`
    )
      .then((res) => res.json())
      .then((data) => {
        const list = data?.slots ?? [];
        setSlots(list.filter((s: SlotDto) => s.status === "open"));
      })
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [selectedExperience, selectedDate]);

  const openSlotsByTime = useMemo(() => {
    const sorted = [...slots].sort((a, b) => a.startAt.localeCompare(b.startAt));
    return sorted.map((s) => ({ ...s, timeLabel: formatTime(s.startAt) }));
  }, [slots]);

  // Single definition: boat rates when boat selected, else experience rates (used for selectedRateId and step-4 effect)
  const ratesForSelection = selectedBoat
    ? (selectedBoat.rates as RateOption[])
    : experienceRates;
  const selectedRateId = useMemo(() => {
    if (!selectedSlot || ratesForSelection.length === 0) return null;
    const parsed = parseSlotId(selectedSlot.id);
    const durationHours = parsed?.durationHours ?? 0;
    const rate = ratesForSelection.find((r) => r.durationHours === durationHours);
    return rate?.id ?? null;
  }, [selectedSlot, ratesForSelection]);

  const selectedRate = useMemo(
    () => (selectedRateId ? ratesForSelection.find((r) => r.id === selectedRateId) ?? null : null),
    [selectedRateId, ratesForSelection]
  );

  // Price breakdown for step 4: rate + addons + tip (20% when "Tip now") → total
  const priceSummary = useMemo(() => {
    const rateCents = selectedRate?.priceCents ?? 0;
    const addonLines = addons
      .filter((a) => (addonSelections[a.id] ?? 0) > 0)
      .map((a) => ({
        name: a.name,
        qty: addonSelections[a.id] ?? 0,
        priceCents: a.priceCents * (addonSelections[a.id] ?? 0),
      }));
    const addonsTotalCents = addonLines.reduce((s, l) => s + l.priceCents, 0);
    const subtotalBeforeTip = rateCents + addonsTotalCents;
    const tipCents = tipChoice === "now" ? Math.round(subtotalBeforeTip * 0.2) : 0;
    const totalCents = subtotalBeforeTip + tipCents;
    return {
      rateLabel: selectedRate?.displayName ?? (selectedRate?.durationHours ? `${selectedRate.durationHours} hr` : "Rental"),
      rateCents,
      addonLines,
      tipCents,
      totalCents,
    };
  }, [selectedRate, addons, addonSelections, tipChoice]);

  // When opened with initialSelection (slot pre-picked), go to step 4 (details & payment)
  useEffect(() => {
    if (!open || !initialSelection?.slotId || !selectedSlot || !selectedRateId) return;
    setStep(4);
    setPaymentPhase("form");
  }, [open, initialSelection?.slotId, selectedSlot, selectedRateId]);

  // When opened with initialSelection (date but no slot), go to step 3 (pick time)
  useEffect(() => {
    if (!open || !initialSelection?.date || initialSelection?.slotId) return;
    if (!selectedExperience || !selectedDate) return;
    setStep(3);
  }, [open, initialSelection?.date, initialSelection?.slotId, selectedExperience, selectedDate]);

  const handleBack = () => {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
    else if (step === 4) {
      setStep(3);
    setPaymentPhase("form");
    setClientSecret(null);
    setHoldId(null);
    setPaymentError(null);
    setTipChoice(null);
    setTipLaterMessageOpen(false);
  }
};

  const handleSelectCategory = (exp: ExperienceItem) => {
    setSelectedExperience(exp);
    setStep(2);
  };

  const handleStep2Next = () => {
    if (boats.length === 0 || selectedBoat) setStep(3);
  };

  const canGoToStep4 =
    selectedExperience &&
    (boats.length === 0 || selectedBoat) &&
    selectedDate &&
    selectedSlot &&
    selectedRateId;

  const handleContinueToCheckout = () => {
    if (!canGoToStep4) return;
    setStep(4);
    setPaymentPhase("form");
  };

  const handleProceedToPayment = async () => {
    if (
      !selectedExperience ||
      !selectedSlot ||
      !selectedRateId ||
      !customerName.trim() ||
      !customerEmail.trim() ||
      !customerPhone.trim() ||
      !cancellationAck
    ) {
      setPaymentError("Please fill required fields and acknowledge the cancellation policy.");
      return;
    }
    const maxGuests = selectedExperience.maxGuests ?? 14;
    const maxPets = selectedExperience.petsMax ?? 0;
    if (partySize < 1 || partySize > maxGuests) {
      setPaymentError(partySize < 1 ? "Party size is required." : `Party size must be between 1 and ${maxGuests}.`);
      return;
    }
    if (tipChoice === null) {
      setPaymentError("Please choose Tip now or Tip later.");
      return;
    }
    if (petsCount < 0 || petsCount > Math.min(maxPets, PETS_MAX)) {
      setPaymentError(`Pets must be between 0 and ${Math.min(maxPets, PETS_MAX)}.`);
      return;
    }
    setPaymentError(null);
    setPaymentPhase("loading");
    const addonList = Object.entries(addonSelections)
      .filter(([, qty]) => qty > 0)
      .map(([addonId, qty]) => ({ addonId, qty }));
    const tipCentsToSend = tipChoice === "now" ? priceSummary.tipCents : 0;
    try {
      const holdRes = await fetch("/api/booking/create-hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experienceId: selectedExperience.id,
          boatId: selectedBoat?.id ?? undefined,
          slotId: selectedSlot.id,
          rateId: selectedRateId,
          partySize,
          petsCount,
          addonSelections: addonList,
          customerDraft: { name: customerName.trim(), email: customerEmail.trim(), phone: customerPhone.trim() },
          marketingOptIn: marketingOptIn,
          answers: { how_did_you_hear: howDidYouHear.trim(), comments: comments.trim() },
          ...(tipCentsToSend > 0 && { tipCents: tipCentsToSend }),
        }),
      });
      const holdData = await holdRes.json();
      if (!holdRes.ok) {
        const message = holdData.error ?? "Failed to create hold";
        setPaymentError(holdRes.status === 409 ? "This time is no longer available. Please choose another date or time." : message);
        setPaymentPhase("form");
        if (holdRes.status === 409) setStep(3);
        return;
      }
      const { holdId: newHoldId } = holdData;
      setHoldId(newHoldId);
      const intentRes = await fetch("/api/booking/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdId: newHoldId }),
      });
      const intentData = await intentRes.json();
      if (!intentRes.ok) {
        setPaymentError(intentData.error ?? "Failed to start payment");
        setPaymentPhase("form");
        return;
      }
      const secret = intentData.clientSecret;
      if (!secret) {
        setPaymentError("Payment intent missing client secret");
        setPaymentPhase("form");
        return;
      }
      if (!STRIPE_PUBLISHABLE_KEY) {
        setPaymentError(
          "Stripe publishable key not found. Add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to .env.local (no quotes), then restart the dev server (npm run dev)."
        );
        setPaymentPhase("form");
        return;
      }
      setClientSecret(secret);
      setPaymentPhase("stripe");
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : "Something went wrong");
      setPaymentPhase("form");
    }
  };

  const stepTitles = ["Pick category", "Choose your boat", "Pick date & time", "Details & payment"];

  // Smart modal: min-height per step to fit content (step 2 compact when no boats; step 4 content-fitting)
  const stepMinHeight =
    step === 1
      ? "min-h-[280px] md:min-h-[360px]"
      : step === 2
        ? boats.length === 0 && !boatsLoading
          ? "min-h-[200px] md:min-h-[260px]"
          : "min-h-[280px] md:min-h-[360px]"
        : step === 3
          ? "min-h-[420px] md:min-h-[520px]"
          : "min-h-0";

  const isCompactStep = step === 2 && boats.length === 0 && !boatsLoading;
  const isStep4 = step === 4;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      className={cn(
        "w-[calc(100vw-2rem)] max-w-md",
        "md:max-w-2xl md:max-h-[88vh]",
        "lg:max-w-3xl"
      )}
    >
      <div
        className={cn(
          "flex flex-col flex-1 overflow-hidden max-h-[90vh] md:max-h-[88vh]",
          isCompactStep && "min-h-[320px] md:min-h-[380px]",
          !isCompactStep && !isStep4 && "min-h-[50vh] md:min-h-[420px]",
          isStep4 && "min-h-[320px] md:min-h-[360px]"
        )}
      >
        {/* Step indicator + back */}
        <div className="flex items-center justify-between gap-3 mb-4 shrink-0">
          <button
            type="button"
            onClick={step > 1 ? handleBack : () => onOpenChange(false)}
            className="flex items-center gap-1 rounded-lg p-2 text-brand-muted hover:bg-brand-bg hover:text-brand-dark transition-colors"
            aria-label={step > 1 ? "Back" : "Close"}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
            {step > 1 ? <span className="text-sm font-medium">Back</span> : null}
          </button>
          <div className="flex items-center gap-1.5">
            {([1, 2, 3, 4] as const).map((s) => (
              <span
                key={s}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  step === s ? "w-6 bg-brand-primary" : "w-2 bg-brand-dark/20"
                )}
                aria-hidden
              />
            ))}
          </div>
          <div className="w-14" aria-hidden />
        </div>
        <p className="text-xs font-medium text-brand-muted uppercase tracking-wider mb-3 shrink-0">
          Step {step} of 4
        </p>
        <h2 className="text-lg font-semibold text-brand-dark mb-4 shrink-0">{stepTitles[step - 1]}</h2>

        {paymentError && (
          <div className="mb-4 shrink-0 rounded-xl bg-red-50 border border-red-200 px-4 py-3 flex items-start justify-between gap-3">
            <span className="text-sm text-red-700">{paymentError}</span>
            <button
              type="button"
              onClick={() => setPaymentError(null)}
              className="shrink-0 text-sm font-medium text-red-700 hover:text-red-800 underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Sliding panels — min height per step so content fits (step 3 needs more for full calendar) */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <div
            className={cn(
              "flex w-[400%] transition-transform duration-300 ease-out",
              step === 1 && "translate-x-0",
              step === 2 && "-translate-x-[25%]",
              step === 3 && "-translate-x-[50%]",
              step === 4 && "-translate-x-[75%]",
              stepMinHeight
            )}
          >
            {/* Step 1: Category — tap category to go to step 2; cards fill panel to avoid empty space */}
            <div className="w-1/4 shrink-0 pr-1 overflow-y-auto flex flex-col min-h-0">
              {loading ? (
                <div className="py-12 flex justify-center">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
                </div>
              ) : experiences && experiences.length > 0 ? (
                <div className="grid grid-cols-2 grid-rows-[1fr_1fr] gap-3 md:gap-4 flex-1 min-h-0">
                  {experiences.map((exp) => {
                    const isSelected = selectedExperience?.id === exp.id;
                    const hasImage = exp.heroMedia?.url && exp.heroMedia.type === "image";
                    return (
                      <button
                        key={exp.id}
                        type="button"
                        onClick={() => handleSelectCategory(exp)}
                        className={cn(
                          "relative flex flex-col overflow-hidden rounded-2xl border-2 min-h-[140px] md:min-h-[170px] transition-all",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2",
                          isSelected ? "border-brand-primary ring-2 ring-brand-primary/30" : "border-brand-dark/15 hover:border-brand-dark/30 hover:scale-[1.02] active:scale-[0.99]"
                        )}
                      >
                        <div className="absolute inset-0 bg-brand-dark/5">
                          {hasImage ? (
                            <Image src={exp.heroMedia.url} alt="" fill className="object-cover" sizes="(max-width: 768px) 50vw, 280px" />
                          ) : (
                            <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/15 to-brand-dark/10" />
                          )}
                        </div>
                        <div className="relative flex flex-1 flex-col justify-end p-4 md:p-5 bg-gradient-to-t from-black/80 via-black/30 to-transparent">
                          <span className="text-base md:text-lg font-semibold text-white drop-shadow-md">{exp.title}</span>
                          {exp.subtitle ? (
                            <span className="text-xs md:text-sm text-white/90 mt-0.5 line-clamp-1">{exp.subtitle}</span>
                          ) : null}
                          {exp.fromPriceCents != null && (
                            <span className="text-sm font-medium text-white/95 mt-1">From ${(exp.fromPriceCents / 100).toFixed(0)}</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-brand-muted py-8">No experiences available.</p>
              )}
              <p className="text-center text-xs text-brand-muted mt-4">Select a category to continue</p>
            </div>

            {/* Step 2: Boat */}
            <div className="w-1/4 shrink-0 px-1 overflow-y-auto flex flex-col">
              {boatsLoading ? (
                <div className="py-8 flex justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
                </div>
              ) : boats.length === 0 ? (
                <p className="text-sm text-brand-muted py-4 md:py-6">No boats assigned — continue to pick date.</p>
              ) : (
                <div className="flex flex-wrap gap-3 md:gap-4 mb-6">
                  {boats.map((boat) => {
                    const isSelected = selectedBoat?.id === boat.id;
                    const thumb = boat.photos?.[0];
                    return (
                      <button
                        key={boat.id}
                        type="button"
                        onClick={() => setSelectedBoat(boat)}
                        className={cn(
                          "inline-flex items-center gap-3 rounded-xl border-2 px-4 py-3 md:px-5 md:py-3.5 text-left transition-all min-w-0",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2",
                          isSelected ? "border-brand-primary bg-brand-primary/10 font-semibold" : "border-brand-dark/15 bg-white hover:border-brand-dark/30"
                        )}
                      >
                        {thumb ? (
                          <span className="relative h-10 w-14 md:h-12 md:w-16 shrink-0 block overflow-hidden rounded-lg">
                            <Image src={thumb} alt="" width={64} height={48} className="object-cover h-full w-full" />
                          </span>
                        ) : (
                          <span className="h-10 w-14 md:h-12 md:w-16 shrink-0 rounded-lg bg-brand-dark/10" />
                        )}
                        <span className="text-sm md:text-base font-medium truncate">{boat.name}</span>
                        {boat.fromPriceCents != null && (
                          <span className="text-sm text-brand-muted shrink-0 font-medium">${(boat.fromPriceCents / 100).toFixed(0)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              <button
                type="button"
                onClick={handleStep2Next}
                className="mt-auto w-full rounded-xl bg-brand-primary text-white font-semibold py-3 px-4 md:py-3.5 hover:bg-brand-primary/90 transition-colors"
              >
                Continue
              </button>
            </div>

            {/* Step 3: Date & time — taller panel so full calendar dates fit */}
            <div className="w-1/4 shrink-0 pl-1 overflow-y-auto flex flex-col">
              <div className="space-y-5 md:space-y-6">
                <div>
                  <p className="text-sm font-medium text-brand-dark mb-2 md:mb-3">Date</p>
                  <div className="grid grid-cols-5 gap-2 md:gap-2.5">
                    {dateOptions.map(({ dateStr, label, weekday }) => {
                      const isSelected = selectedDate === dateStr;
                      const isPast = dateStr < new Date().toISOString().slice(0, 10);
                      return (
                        <button
                          key={dateStr}
                          type="button"
                          disabled={isPast}
                          onClick={() => setSelectedDate(dateStr)}
                          className={cn(
                            "rounded-xl border-2 py-3 px-2 md:py-4 md:px-2.5 text-center transition-all text-xs md:text-sm min-h-[52px] md:min-h-[60px]",
                            isPast && "opacity-50 cursor-not-allowed",
                            isSelected ? "border-brand-primary bg-brand-primary/10 font-semibold" : !isPast && "border-brand-dark/15 hover:border-brand-dark/30"
                          )}
                        >
                          <span className="block text-[10px] md:text-xs text-brand-muted uppercase">{weekday}</span>
                          <span className="block font-medium mt-0.5 md:mt-1">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {selectedDate && (
                  <div>
                    <p className="text-sm font-medium text-brand-dark mb-2 md:mb-3">Time</p>
                    {slotsLoading ? (
                      <p className="text-sm text-brand-muted">Loading times…</p>
                    ) : openSlotsByTime.length === 0 ? (
                      <p className="text-sm text-brand-muted">No open slots this day.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2 md:gap-3">
                        {openSlotsByTime.map((slot) => {
                          const isSelected = selectedSlot?.id === slot.id;
                          return (
                            <button
                              key={slot.id}
                              type="button"
                              onClick={() => setSelectedSlot(slot)}
                              className={cn(
                                "rounded-xl border-2 px-4 py-3 md:px-5 md:py-3.5 text-sm md:text-base font-medium transition-all",
                                isSelected ? "border-brand-primary bg-brand-primary/10" : "border-brand-dark/15 hover:border-brand-dark/30"
                              )}
                            >
                              {slot.timeLabel}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleContinueToCheckout}
                disabled={!canGoToStep4}
                className="mt-6 w-full rounded-xl bg-brand-primary text-white font-semibold py-3.5 px-4 md:py-4 hover:bg-brand-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Continue to checkout
              </button>
              <p className="text-center text-xs text-brand-muted mt-3">Details & payment in next step</p>
            </div>

            {/* Step 4: Details & payment — order summary + form; content-fitting height */}
            <div className="w-1/4 shrink-0 pl-1 overflow-y-auto min-h-0 flex flex-col">
              {paymentPhase === "form" && (
                <div className="space-y-5 pb-4">
                  {/* Order summary: what you're booking + price breakdown */}
                  {selectedExperience && selectedDate && selectedSlot && selectedRate && (
                    <div className="rounded-2xl border-2 border-brand-dark/10 bg-white shadow-sm overflow-hidden">
                      <div className="p-4 bg-gradient-to-br from-brand-primary/8 to-brand-primary/4 border-b border-brand-dark/5">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-primary/90 mb-1">Booking summary</p>
                        <h3 className="font-bold text-brand-dark text-lg leading-tight">{selectedExperience.title}</h3>
                        {selectedBoat && (
                          <p className="text-sm font-medium text-brand-dark/80 mt-0.5">{selectedBoat.name}</p>
                        )}
                        <p className="text-sm text-brand-muted mt-2 flex items-center gap-1.5">
                          <span>{new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span>
                          <span aria-hidden>·</span>
                          <span>{formatTime(selectedSlot.startAt)}</span>
                          <span aria-hidden>·</span>
                          <span>{selectedRate.durationHours} hr</span>
                        </p>
                      </div>
                      <div className="p-4 space-y-2">
                        <div className="flex justify-between items-baseline text-sm">
                          <span className="text-brand-muted">{priceSummary.rateLabel}</span>
                          <span className="font-semibold text-brand-dark">${(priceSummary.rateCents / 100).toFixed(2)}</span>
                        </div>
                        {priceSummary.addonLines.map((line) => (
                          <div key={line.name} className="flex justify-between items-baseline text-sm">
                            <span className="text-brand-muted">
                              {line.name}
                              {line.qty > 1 ? ` × ${line.qty}` : ""}
                            </span>
                            <span className="font-medium text-brand-dark">+${(line.priceCents / 100).toFixed(2)}</span>
                          </div>
                        ))}
                        {priceSummary.tipCents > 0 && (
                          <div className="flex justify-between items-baseline text-sm">
                            <span className="text-brand-muted">Tip (20%)</span>
                            <span className="font-medium text-brand-dark">+${(priceSummary.tipCents / 100).toFixed(2)}</span>
                          </div>
                        )}
                        <div className="border-t border-brand-dark/10 pt-3 mt-3 flex justify-between items-baseline">
                          <span className="text-sm font-semibold text-brand-dark">Total</span>
                          <span className="text-xl font-bold text-brand-primary">${(priceSummary.totalCents / 100).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Party & add-ons */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted mb-3">Party & add-ons</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="booking-party-size" className="block text-sm font-medium text-brand-dark mb-1">Party size *</label>
                        <input
                          id="booking-party-size"
                          type="number"
                          min={1}
                          max={selectedExperience?.maxGuests ?? 14}
                          value={partySize}
                          onChange={(e) => setPartySize(Math.max(1, parseInt(e.target.value, 10) || 1))}
                          required
                          className="w-full rounded-xl border-2 border-brand-dark/15 bg-white px-3 py-2.5 text-sm focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-colors"
                        />
                      </div>
                      <div>
                        <label htmlFor="booking-pets" className="block text-sm font-medium text-brand-dark mb-1">Pets</label>
                        <input
                          id="booking-pets"
                          type="number"
                          min={0}
                          max={Math.min(selectedExperience?.petsMax ?? 0, PETS_MAX)}
                          value={petsCount}
                          onChange={(e) => setPetsCount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                          className="w-full rounded-xl border-2 border-brand-dark/15 bg-white px-3 py-2.5 text-sm focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-colors"
                        />
                        {(selectedExperience?.petsMax ?? 0) > 0 && (
                          <p className="text-[11px] text-brand-muted mt-0.5">Max {Math.min(selectedExperience?.petsMax ?? 0, PETS_MAX)}</p>
                        )}
                      </div>
                    </div>
                    {addonsLoading ? (
                      <p className="text-sm text-brand-muted mt-3">Loading add-ons…</p>
                    ) : addons.length > 0 ? (
                      <div className="mt-3 space-y-1.5">
                        {addons.map((addon) => (
                          <label
                            key={addon.id}
                            className={cn(
                              "flex items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 cursor-pointer transition-all",
                              addon.highlight
                                ? (addonSelections[addon.id] ?? 0) > 0
                                  ? "border-amber-500/60 bg-amber-50 shadow-sm ring-2 ring-amber-400/30"
                                  : "border-amber-300/50 bg-amber-50/50 hover:border-amber-400/60"
                                : (addonSelections[addon.id] ?? 0) > 0
                                  ? "border-brand-primary/40 bg-brand-primary/5"
                                  : "border-brand-dark/10 bg-white hover:border-brand-dark/20"
                            )}
                          >
                            <span className={cn("text-sm font-medium", addon.highlight ? "text-brand-dark font-semibold" : "text-brand-dark")}>
                              {addon.name}
                              {addon.description && <span className="block text-xs font-normal text-brand-muted mt-0.5">{addon.description}</span>}
                            </span>
                            <span className="text-sm font-semibold text-brand-primary shrink-0">+${(addon.priceCents / 100).toFixed(0)}</span>
                            <input
                              type="checkbox"
                              checked={(addonSelections[addon.id] ?? 0) > 0}
                              onChange={(e) =>
                                setAddonSelections((prev) => ({
                                  ...prev,
                                  [addon.id]: e.target.checked ? 1 : 0,
                                }))
                              }
                              className="sr-only"
                              aria-label={`Add ${addon.name} for $${(addon.priceCents / 100).toFixed(0)}`}
                            />
                          </label>
                        ))}
                      </div>
                    ) : null}

                    {/* Tip: Tip now (20%) or Tip later */}
                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted mb-2">Tip</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setTipChoice("now")}
                          className={cn(
                            "flex-1 rounded-xl border-2 py-3 px-4 text-sm font-semibold transition-all",
                            tipChoice === "now"
                              ? "border-brand-primary bg-brand-primary/15 text-brand-dark ring-2 ring-brand-primary/30"
                              : "border-brand-dark/15 bg-white text-brand-muted hover:border-brand-dark/25 hover:text-brand-dark"
                          )}
                        >
                          Tip now (20%)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setTipChoice("later");
                            setTipLaterMessageOpen(true);
                          }}
                          className={cn(
                            "flex-1 rounded-xl border-2 py-3 px-4 text-sm font-semibold transition-all",
                            tipChoice === "later"
                              ? "border-brand-primary/40 bg-brand-primary/5 text-brand-dark"
                              : "border-brand-dark/15 bg-white text-brand-muted hover:border-brand-dark/25 hover:text-brand-dark"
                          )}
                        >
                          Tip later
                        </button>
                      </div>
                      {tipChoice === "now" && priceSummary.tipCents > 0 && (
                        <p className="text-xs text-brand-muted mt-1.5">+${(priceSummary.tipCents / 100).toFixed(2)} added to total</p>
                      )}
                    </div>
                  </div>

                  {/* Contact */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted mb-3">Contact details</p>
                    <div className="space-y-3 rounded-xl border-2 border-brand-dark/10 bg-white p-4 shadow-sm">
                      <div>
                        <label htmlFor="booking-name" className="block text-sm font-medium text-brand-dark mb-1">Full name *</label>
                        <input
                          id="booking-name"
                          type="text"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          required
                          placeholder="As on ID"
                          className="w-full rounded-xl border-2 border-brand-dark/15 bg-white px-3 py-2.5 text-sm placeholder:text-brand-muted/70 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-colors"
                        />
                      </div>
                      <div>
                        <label htmlFor="booking-email" className="block text-sm font-medium text-brand-dark mb-1">Email *</label>
                        <input
                          id="booking-email"
                          type="email"
                          value={customerEmail}
                          onChange={(e) => setCustomerEmail(e.target.value)}
                          required
                          placeholder="you@example.com"
                          className="w-full rounded-xl border-2 border-brand-dark/15 bg-white px-3 py-2.5 text-sm placeholder:text-brand-muted/70 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-colors"
                        />
                      </div>
                      <div>
                        <label htmlFor="booking-phone" className="block text-sm font-medium text-brand-dark mb-1">Phone *</label>
                        <input
                          id="booking-phone"
                          type="tel"
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          required
                          placeholder="(555) 000-0000"
                          className="w-full rounded-xl border-2 border-brand-dark/15 bg-white px-3 py-2.5 text-sm placeholder:text-brand-muted/70 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-colors"
                        />
                      </div>
                    </div>
                    <label className="mt-2 flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={marketingOptIn}
                        onChange={(e) => setMarketingOptIn(e.target.checked)}
                        className="h-4 w-4 rounded border-2 border-brand-dark/30 text-brand-primary focus:ring-brand-primary/30"
                      />
                      <span className="text-xs text-brand-muted">Get occasional updates and offers from Boat Bros</span>
                    </label>
                  </div>

                  {/* Optional */}
                  <div className="space-y-2 pt-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted">Optional</p>
                    <input
                      id="booking-how-hear"
                      type="text"
                      value={howDidYouHear}
                      onChange={(e) => setHowDidYouHear(e.target.value)}
                      placeholder="How did you hear about us?"
                      className="w-full rounded-xl border border-brand-dark/10 bg-white px-3 py-2 text-sm placeholder:text-brand-muted focus:border-brand-dark/20 focus:outline-none transition-colors"
                    />
                    <textarea
                      id="booking-comments"
                      value={comments}
                      onChange={(e) => setComments(e.target.value)}
                      placeholder="Special requests or notes"
                      rows={2}
                      className="w-full rounded-xl border border-brand-dark/10 bg-white px-3 py-2 text-sm resize-none placeholder:text-brand-muted focus:border-brand-dark/20 focus:outline-none transition-colors"
                    />
                  </div>

                  {/* Cancellation */}
                  <div className="rounded-xl border-2 border-amber-200/60 bg-amber-50/50 p-4">
                    <p className="text-xs font-semibold text-brand-dark mb-1.5">Cancellation policy</p>
                    <p className="text-[11px] text-brand-muted leading-relaxed">
                      Free cancel until 30 days before · 50% refund 15–30 days · No refund within 14 days · Full refund if we cancel (e.g. weather).
                    </p>
                    <label className="mt-3 flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cancellationAck}
                        onChange={(e) => setCancellationAck(e.target.checked)}
                        className="h-4 w-4 rounded border-2 border-brand-dark/30 text-brand-primary focus:ring-brand-primary/30 mt-0.5 shrink-0"
                      />
                      <span className="text-sm text-brand-dark">I have read and accept the cancellation policy *</span>
                    </label>
                  </div>

                  <div className="rounded-xl border-2 border-brand-primary/20 bg-brand-primary/5 p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-brand-dark">Total due</p>
                      <p className="text-2xl font-bold text-brand-primary">${(priceSummary.totalCents / 100).toFixed(2)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleProceedToPayment}
                      className="shrink-0 rounded-xl bg-brand-primary text-white font-semibold py-3.5 px-6 hover:bg-brand-primary/90 active:scale-[0.99] transition-all focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 shadow-lg shadow-brand-primary/20"
                    >
                      Proceed to payment
                    </button>
                  </div>
                  <p className="text-center text-[11px] text-brand-muted">Secure payment via Stripe · Card, Apple Pay, Google Pay</p>
                </div>
              )}
              {paymentPhase === "loading" && (
                <div className="py-8 flex flex-col items-center justify-center gap-3">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
                  <p className="text-sm text-brand-muted">Preparing checkout…</p>
                </div>
              )}
              {paymentPhase === "stripe" && clientSecret && stripePromise && selectedExperience && selectedSlot && selectedRate && (
                <div className="flex flex-col gap-4 min-h-0">
                  <div className="rounded-xl border-2 border-brand-primary/25 bg-brand-primary/8 p-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary/90">Paying now</p>
                      <p className="font-bold text-brand-dark mt-0.5">{selectedExperience.title}</p>
                      <p className="text-sm text-brand-muted">
                        {selectedDate && new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                        {" · "}
                        {formatTime(selectedSlot.startAt)}
                        {" · "}
                        {priceSummary.rateLabel}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-brand-primary">${(priceSummary.totalCents / 100).toFixed(2)}</p>
                      <p className="text-[11px] text-brand-muted">Total due</p>
                    </div>
                  </div>
                  <div className="min-h-[220px] flex flex-col shrink-0">
                    <Elements stripe={stripePromise} options={{ clientSecret }}>
                      <BookingPaymentForm
                        onSuccess={() => setPaymentPhase("success")}
                        onError={(msg) => {
                          setPaymentError(msg);
                          setPaymentPhase("form");
                        }}
                      />
                    </Elements>
                  </div>
                </div>
              )}
              {/* Tip later message dialog */}
              <Dialog open={tipLaterMessageOpen} onOpenChange={setTipLaterMessageOpen} className="max-w-sm">
                <h3 className="text-lg font-bold text-brand-dark mb-2">We encourage tipping</h3>
                <p className="text-sm text-brand-muted leading-relaxed mb-4">
                  Our crew works hard to make your trip great. Tips go directly to your captain and crew and are a meaningful way to show appreciation. You can add a tip when you pay or leave one after your trip.
                </p>
                <button
                  type="button"
                  onClick={() => setTipLaterMessageOpen(false)}
                  className="w-full rounded-xl bg-brand-primary text-white font-semibold py-3 px-4 hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2"
                >
                  Got it
                </button>
              </Dialog>
              {paymentPhase === "success" && (
                <div className="py-8 flex flex-col items-center gap-5 text-center">
                  <div className="w-14 h-14 rounded-full bg-brand-primary/15 flex items-center justify-center">
                    <svg className="w-7 h-7 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-brand-dark">You're all set!</h3>
                    <p className="text-sm text-brand-muted mt-1.5 max-w-[280px] mx-auto">
                      {selectedExperience && priceSummary.totalCents > 0 ? (
                        <>We've received your payment of <span className="font-semibold text-brand-dark">${(priceSummary.totalCents / 100).toFixed(2)}</span> for {selectedExperience.title}. You'll get a confirmation email shortly.</>
                      ) : (
                        "We've received your payment. You'll get a confirmation email shortly."
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="rounded-xl bg-brand-primary text-white font-semibold py-3 px-6 hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
