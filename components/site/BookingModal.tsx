"use client";

import { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

/** Texas combined sales tax (e.g. Austin: state 6.25% + local up to 2% = 8.25%). */
const TEXAS_SALES_TAX_RATE = 0.0825;

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

/** All days in a given calendar month (1-based). */
function getDaysInMonth(year: number, month: number): { dateStr: string; label: string; weekday: string }[] {
  const out: { dateStr: string; label: string; weekday: string }[] = [];
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const count = last.getDate();
  for (let day = 1; day <= count; day++) {
    const d = new Date(year, month - 1, day);
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
  const [experiencesLoadError, setExperiencesLoadError] = useState<string | null>(null);
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
  const today = useMemo(() => {
    const t = new Date();
    return { year: t.getFullYear(), month: t.getMonth() + 1 };
  }, []);
  const [viewMonthYear, setViewMonthYear] = useState(today.year);
  const [viewMonthMonth, setViewMonthMonth] = useState(today.month);
  const [selectedRateIdForCalendar, setSelectedRateIdForCalendar] = useState<string | null>(null);
  const [datePrices, setDatePrices] = useState<Record<string, number>>({});
  const [effectiveRateCents, setEffectiveRateCents] = useState<number | null>(null);
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
  const [addonQtyModalAddon, setAddonQtyModalAddon] = useState<AddonOption | null>(null);
  const [addonQtyModalQty, setAddonQtyModalQty] = useState(0);
  const [tipChoice, setTipChoice] = useState<"now" | "later" | null>(null);
  const [tipPercent, setTipPercent] = useState(20); // 20–100 when "Tip now"
  const [tipModalPercent, setTipModalPercent] = useState(20); // value while tip-amount modal is open
  const [tipNowModalOpen, setTipNowModalOpen] = useState(false);
  const [tipLaterMessageOpen, setTipLaterMessageOpen] = useState(false);
  const [howDidYouHear, setHowDidYouHear] = useState("");
  const [comments, setComments] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [cancellationAck, setCancellationAck] = useState(false);
  const [paymentPhase, setPaymentPhase] = useState<"form" | "loading" | "stripe" | "success">("form");
  const [holdId, setHoldId] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const dateOptions = useMemo(
    () => getDaysInMonth(viewMonthYear, viewMonthMonth),
    [viewMonthYear, viewMonthMonth]
  );
  const viewMonthLabel = useMemo(
    () => new Date(viewMonthYear, viewMonthMonth - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    [viewMonthYear, viewMonthMonth]
  );
  const isViewMonthCurrent = viewMonthYear === today.year && viewMonthMonth === today.month;

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
    const now = new Date();
    setViewMonthYear(now.getFullYear());
    setViewMonthMonth(now.getMonth() + 1);
    setSelectedRateIdForCalendar(null);
    setEffectiveRateCents(null);
    setDatePrices({});
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
    setPaymentIntentId(null);
    setClientSecret(null);
    setPaymentError(null);
    setExperiencesLoadError(null);
    fetch("/api/experiences")
      .then((res) => res.json().then((data) => ({ res, data })))
      .then(({ res, data }) => {
        const list = Array.isArray(data) ? data : (data?.experiences ?? []);
        if (!res.ok) {
          setExperiences([]);
          setExperiencesLoadError((data as { error?: string })?.error ?? "Failed to load experiences");
          return;
        }
        if (Array.isArray(list) && list.length > 0) setExperiences(list);
        else setExperiences([]);
      })
      .catch(() => {
        setExperiences([]);
        setExperiencesLoadError("Failed to load experiences");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when modal open state changes
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
  }, [open, initialSelection, initialSelection?.date, experiences]);

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

  const viewMonthStartStr = `${viewMonthYear}-${String(viewMonthMonth).padStart(2, "0")}-01`;
  useEffect(() => {
    if (!selectedExperience) {
      setDatePrices({});
      return;
    }
    const rateIdQ = selectedRateIdForCalendar ? `&rateId=${encodeURIComponent(selectedRateIdForCalendar)}` : "";
    fetch(
      `/api/booking/date-prices?experienceId=${encodeURIComponent(selectedExperience.id)}&startDate=${viewMonthStartStr}&days=35${rateIdQ}`
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.prices && typeof data.prices === "object") setDatePrices(data.prices);
        else setDatePrices({});
      })
      .catch(() => setDatePrices({}));
  }, [selectedExperience?.id, viewMonthStartStr, selectedRateIdForCalendar]);

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

  // Single definition: boat rates when boat selected, else experience rates (used for selectedRateId and step-4 effect)
  const ratesForSelection = selectedBoat
    ? (selectedBoat.rates as RateOption[])
    : experienceRates;
  // Keep calendar duration in sync with available rates (e.g. when switching boat/experience)
  useEffect(() => {
    if (ratesForSelection.length === 0) return;
    const valid = ratesForSelection.some((r) => r.id === selectedRateIdForCalendar);
    if (!valid) setSelectedRateIdForCalendar(ratesForSelection[0].id);
  }, [ratesForSelection, selectedRateIdForCalendar]);
  const rateForCalendar = useMemo(
    () => (selectedRateIdForCalendar ? ratesForSelection.find((r) => r.id === selectedRateIdForCalendar) ?? null : null),
    [selectedRateIdForCalendar, ratesForSelection]
  );
  const openSlotsByTime = useMemo(() => {
    const durationHours = rateForCalendar?.durationHours;
    const filtered =
      durationHours != null
        ? slots.filter((s) => {
            const parsed = parseSlotId(s.id);
            return parsed?.durationHours === durationHours;
          })
        : slots;
    const sorted = [...filtered].sort((a, b) => a.startAt.localeCompare(b.startAt));
    return sorted.map((s) => ({ ...s, timeLabel: formatTime(s.startAt) }));
  }, [slots, rateForCalendar?.durationHours]);
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

  // Add-ons to show (exclude sunscreen)
  const displayAddons = useMemo(
    () => addons.filter((a) => !/sunscreen/i.test(a.name)),
    [addons]
  );

  // Price breakdown for step 4: rate + addons + sales tax (8.25%) + tip (20–35% when "Tip now") → total (use effective price for selected date so it matches checkout)
  const priceSummary = useMemo(() => {
    const rateCents = effectiveRateCents ?? selectedRate?.priceCents ?? 0;
    const addonLines = displayAddons
      .filter((a) => (addonSelections[a.id] ?? 0) > 0)
      .map((a) => ({
        name: a.name,
        qty: addonSelections[a.id] ?? 0,
        priceCents: a.priceCents * (addonSelections[a.id] ?? 0),
      }));
    const addonsTotalCents = addonLines.reduce((s, l) => s + l.priceCents, 0);
    const subtotalBeforeTax = rateCents + addonsTotalCents;
    const salesTaxCents = Math.round(subtotalBeforeTax * TEXAS_SALES_TAX_RATE);
    const subtotalAfterTax = subtotalBeforeTax + salesTaxCents;
    const pct = Math.min(35, Math.max(20, tipPercent));
    const tipCents = tipChoice === "now" ? Math.round(subtotalBeforeTax * (pct / 100)) : 0;
    const totalCents = subtotalAfterTax + tipCents;
    return {
      rateLabel: selectedRate?.displayName ?? (selectedRate?.durationHours ? `${selectedRate.durationHours} hr` : "Rental"),
      rateCents,
      addonLines,
      salesTaxCents,
      tipCents,
      totalCents,
    };
  }, [effectiveRateCents, selectedRate, displayAddons, addonSelections, tipChoice, tipPercent]);

  // When opened with initialSelection (slot pre-picked), go to step 4 (details & payment).
  // Do not overwrite payment phase if user has already proceeded to Stripe or completed payment.
  useEffect(() => {
    if (!open || !initialSelection?.slotId || !selectedSlot || !selectedRateId) return;
    if (paymentPhase === "stripe" || paymentPhase === "loading" || paymentPhase === "success") return;
    setStep(4);
    setPaymentPhase("form");
  }, [open, initialSelection?.slotId, selectedSlot, selectedRateId, paymentPhase]);

  // When opened with initialSelection (date but no slot), go to step 3 (pick time)
  useEffect(() => {
    if (!open || !initialSelection?.date || initialSelection?.slotId) return;
    if (!selectedExperience || !selectedDate) return;
    setStep(3);
  }, [open, initialSelection?.date, initialSelection?.slotId, selectedExperience, selectedDate]);

  useEffect(() => {
    if (!selectedExperience || !selectedRateId || !selectedDate) {
      setEffectiveRateCents(null);
      return;
    }
    fetch(
      `/api/booking/effective-price?experienceId=${encodeURIComponent(selectedExperience.id)}&rateId=${encodeURIComponent(selectedRateId)}&date=${encodeURIComponent(selectedDate)}`
    )
      .then((res) => res.json())
      .then((data) => {
        if (typeof data?.priceCents === "number") setEffectiveRateCents(data.priceCents);
        else setEffectiveRateCents(null);
      })
      .catch(() => setEffectiveRateCents(null));
  }, [selectedExperience?.id, selectedRateId, selectedDate]);

  const handleBack = () => {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
    else if (step === 4) {
      setStep(3);
    setPaymentPhase("form");
    setClientSecret(null);
    setHoldId(null);
    setPaymentIntentId(null);
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
        const hint = holdData.hint ? ` ${holdData.hint}` : "";
        setPaymentError(holdRes.status === 409 ? "This time is no longer available. Please choose another date or time." : `${message}${hint}`);
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
      setPaymentIntentId(intentData.paymentIntentId ?? null);
      setPaymentPhase("stripe");
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : "Something went wrong");
      setPaymentPhase("form");
    }
  };

  const stepTitles = ["Pick category", "Choose your boat", "Pick date & time", "Details & payment"];

  // Smart modal: min-height per step to fit content (step 2 compact when no boats; step 4 content-fitting)
  // Only the active panel contributes to height so the modal grows per step
  const panel1Collapsed = step !== 1;
  const panel2Collapsed = step !== 2;
  const panel3Collapsed = step !== 3;
  const panel4Collapsed = step !== 4;

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
          "flex flex-col overflow-hidden max-h-[90vh] md:max-h-[88vh] min-h-[260px]",
          step === 4 ? "h-[85vh] min-h-[500px]" : "flex-1 min-h-0"
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

        {/* Sliding panels — fixed height on step 4 so inner scroll works */}
        <div className={cn("flex flex-col overflow-hidden min-h-0 flex-1", step === 4 && "min-h-0")}>
          <div
            className={cn(
              "flex w-[400%] transition-transform duration-300 ease-out items-stretch h-full min-h-0",
              step === 1 && "translate-x-0",
              step === 2 && "-translate-x-[25%]",
              step === 3 && "-translate-x-[50%]",
              step === 4 && "-translate-x-[75%]"
            )}
          >
            {/* Step 1: Category */}
            <div
              className={cn(
                "w-1/4 shrink-0 pr-1 overflow-y-auto flex flex-col min-h-0 transition-[min-height] duration-300",
                panel1Collapsed && "!min-h-0 !h-0 overflow-hidden"
              )}
            >
              {loading ? (
                <div className="py-12 flex justify-center">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
                </div>
              ) : experiences && experiences.length > 0 ? (
                <div className="grid grid-cols-2 grid-rows-[1fr_1fr] gap-4 md:gap-5 flex-1 min-h-0">
                  {experiences.map((exp) => {
                    const isSelected = selectedExperience?.id === exp.id;
                    const hasImage = exp.heroMedia?.url && exp.heroMedia.type === "image";
                    return (
                      <button
                        key={exp.id}
                        type="button"
                        onClick={() => handleSelectCategory(exp)}
                        className={cn(
                          "relative flex flex-col overflow-hidden rounded-2xl border-2 min-h-[165px] md:min-h-[200px] transition-all",
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
              ) : experiencesLoadError ? (
                <p className="text-sm text-amber-700 py-8 px-4">{experiencesLoadError}. Please try again or contact us.</p>
              ) : (
                <p className="text-sm text-brand-muted py-8">No experiences available.</p>
              )}
              <p className="text-center text-xs text-brand-muted mt-4">Select a category to continue</p>
            </div>

            {/* Step 2: Boat */}
            <div
              className={cn(
                "w-1/4 shrink-0 px-1 overflow-y-auto flex flex-col transition-[min-height] duration-300",
                panel2Collapsed && "!min-h-0 !h-0 overflow-hidden"
              )}
            >
              {boatsLoading ? (
                <div className="py-8 flex justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
                </div>
              ) : boats.length === 0 ? (
                <p className="text-sm text-brand-muted py-4 md:py-6">No boats assigned — continue to pick date.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 mb-6 flex-1 min-h-0 content-start">
                  {boats.map((boat) => {
                    const isSelected = selectedBoat?.id === boat.id;
                    const thumb = boat.photos?.[0];
                    return (
                      <button
                        key={boat.id}
                        type="button"
                        onClick={() => setSelectedBoat(boat)}
                        className={cn(
                          "flex flex-col overflow-hidden rounded-xl border-2 text-left transition-all min-h-[140px] sm:min-h-[160px]",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2",
                          isSelected ? "border-brand-primary bg-brand-primary/10 ring-2 ring-brand-primary/30" : "border-brand-dark/15 bg-white hover:border-brand-dark/30 hover:scale-[1.02] active:scale-[0.99]"
                        )}
                      >
                        <div className="relative w-full aspect-[4/3] min-h-[100px] bg-brand-dark/10 shrink-0">
                          {thumb ? (
                            <Image src={thumb} alt="" fill className="object-cover" sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, 33vw" />
                          ) : (
                            <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/15 to-brand-dark/10" />
                          )}
                        </div>
                        <div className="flex flex-col justify-center p-3 md:p-4 flex-1 min-w-0">
                          <span className="text-base md:text-lg font-semibold text-brand-dark truncate">{boat.name}</span>
                        </div>
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

            {/* Step 3: Date & time — compact panel; expands when date selected (time slots show) */}
            <div
              className={cn(
                "w-1/4 shrink-0 pl-1 overflow-y-auto flex flex-col min-h-0 transition-[min-height] duration-300",
                panel3Collapsed && "!min-h-0 !h-0 overflow-hidden"
              )}
            >
              <div className="space-y-3 md:space-y-4">
                {ratesForSelection.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-brand-dark mb-1.5 md:mb-2">Duration</p>
                    <div className="flex flex-wrap gap-1.5">
                      {ratesForSelection.map((r) => {
                        const isSelected = selectedRateIdForCalendar === r.id;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => setSelectedRateIdForCalendar(r.id)}
                            className={cn(
                              "rounded-lg border-2 px-2.5 py-1.5 text-xs font-medium transition-all",
                              isSelected ? "border-brand-primary bg-brand-primary/10 text-brand-dark" : "border-brand-dark/15 text-brand-muted hover:border-brand-dark/30"
                            )}
                          >
                            {r.displayName ?? `${r.durationHours} hr`}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5 md:mb-2">
                    <p className="text-xs font-semibold text-brand-dark">Date</p>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        disabled={isViewMonthCurrent}
                        onClick={() => {
                          if (viewMonthMonth === 1) {
                            setViewMonthYear((y) => y - 1);
                            setViewMonthMonth(12);
                          } else {
                            setViewMonthMonth((m) => m - 1);
                          }
                        }}
                        className={cn(
                          "rounded p-1.5 text-brand-dark transition-colors",
                          isViewMonthCurrent ? "cursor-not-allowed opacity-40" : "hover:bg-brand-dark/10"
                        )}
                        aria-label="Previous month"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="text-xs font-medium text-brand-dark min-w-[7rem] text-center">
                        {viewMonthLabel}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (viewMonthMonth === 12) {
                            setViewMonthYear((y) => y + 1);
                            setViewMonthMonth(1);
                          } else {
                            setViewMonthMonth((m) => m + 1);
                          }
                        }}
                        className="rounded p-1.5 text-brand-dark hover:bg-brand-dark/10 transition-colors"
                        aria-label="Next month"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5 md:gap-2">
                    {dateOptions.map(({ dateStr, label, weekday }) => {
                      const isSelected = selectedDate === dateStr;
                      const isPast = dateStr < new Date().toISOString().slice(0, 10);
                      const priceCents = datePrices[dateStr];
                      return (
                        <button
                          key={dateStr}
                          type="button"
                          disabled={isPast}
                          onClick={() => setSelectedDate(dateStr)}
                          className={cn(
                            "rounded-lg border-2 py-2 px-1.5 md:py-2.5 md:px-2 text-center transition-all text-[10px] md:text-xs min-h-[52px] md:min-h-[58px] flex flex-col justify-center",
                            isPast && "opacity-50 cursor-not-allowed",
                            isSelected ? "border-brand-primary bg-brand-primary/10 font-semibold" : !isPast && "border-brand-dark/15 hover:border-brand-dark/30"
                          )}
                        >
                          <span className="block text-[9px] md:text-[10px] text-brand-muted uppercase">{weekday}</span>
                          <span className="block font-medium mt-0.5">{label}</span>
                          {typeof priceCents === "number" && (
                            <span className="block text-[10px] font-semibold text-brand-primary mt-0.5">${(priceCents / 100).toFixed(0)}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {selectedDate && (
                  <div>
                    <p className="text-xs font-semibold text-brand-dark mb-1.5 md:mb-2">Time</p>
                    {slotsLoading ? (
                      <p className="text-xs text-brand-muted">Loading times…</p>
                    ) : openSlotsByTime.length === 0 ? (
                      <p className="text-xs text-brand-muted">No open slots this day.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 md:gap-2">
                        {openSlotsByTime.map((slot) => {
                          const isSelected = selectedSlot?.id === slot.id;
                          return (
                            <button
                              key={slot.id}
                              type="button"
                              onClick={() => setSelectedSlot(slot)}
                              className={cn(
                                "rounded-lg border-2 px-3 py-2 md:px-4 md:py-2.5 text-xs md:text-sm font-medium transition-all",
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
                className="mt-4 w-full rounded-xl bg-brand-primary text-white font-semibold py-3 px-4 hover:bg-brand-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                Continue to checkout
              </button>
              <p className="text-center text-[11px] text-brand-muted mt-2">Details & payment in next step</p>
            </div>

            {/* Step 4: Details & payment — scroll area has explicit max-height so it always scrolls */}
            <div
              className={cn(
                "w-1/4 shrink-0 pl-1 min-h-0 flex flex-col transition-[min-height] duration-300",
                step === 4 && !panel4Collapsed && "h-full min-h-0 max-h-full",
                panel4Collapsed && "!min-h-0 !h-0 overflow-hidden"
              )}
            >
              {paymentPhase === "form" && (
                <>
                <div
                  className="booking-step4-scroll overflow-x-hidden pr-1 space-y-5 pb-8 scroll-smooth overscroll-y-contain touch-pan-y min-h-0 max-h-[55vh] md:max-h-[58vh]"
                  role="region"
                  aria-label="Booking details form"
                >
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
                        {priceSummary.salesTaxCents > 0 && (
                          <div className="flex justify-between items-baseline text-sm">
                            <span className="text-brand-muted">Sales tax (8.25%)</span>
                            <span className="font-medium text-brand-dark">+${(priceSummary.salesTaxCents / 100).toFixed(2)}</span>
                          </div>
                        )}
                        {priceSummary.tipCents > 0 && (
                          <div className="flex justify-between items-baseline text-sm">
                            <span className="text-brand-muted">Tip ({Math.min(35, Math.max(20, tipPercent))}%)</span>
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

                  {/* Contact details — first so user can fill before party/add-ons */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted mb-3">Contact details</p>
                    <div className="space-y-3 rounded-xl border-2 border-brand-dark/10 bg-white p-4 shadow-sm">
                      <div>
                        <label htmlFor="booking-name" className="block text-sm font-medium text-brand-dark mb-1">Full name <span className="text-red-500 font-semibold" aria-hidden>*</span></label>
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
                        <label htmlFor="booking-email" className="block text-sm font-medium text-brand-dark mb-1">Email <span className="text-red-500 font-semibold" aria-hidden>*</span></label>
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
                        <label htmlFor="booking-phone" className="block text-sm font-medium text-brand-dark mb-1">Phone <span className="text-red-500 font-semibold" aria-hidden>*</span></label>
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

                  {/* Party & add-ons */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted mb-3">Party & add-ons</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="booking-party-size" className="block text-sm font-medium text-brand-dark mb-1">Party size <span className="text-red-500 font-semibold" aria-hidden>*</span></label>
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
                    ) : displayAddons.length > 0 ? (
                      <div className="mt-3 space-y-1.5">
                        {displayAddons.map((addon) => {
                          const rawQty = addonSelections[addon.id] ?? 0;
                          const name = addon.name.toLowerCase();
                          const effectiveMax = name.includes("towel") ? 14 : name.includes("ice") ? 2 : (addon.maxQty ?? 10);
                          const qty = Math.min(rawQty, effectiveMax);
                          return (
                            <button
                              key={addon.id}
                              type="button"
                              onClick={() => {
                                setAddonQtyModalAddon(addon);
                                setAddonQtyModalQty(Math.min(rawQty || 1, effectiveMax));
                              }}
                              className={cn(
                                "w-full flex items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all",
                                addon.highlight
                                  ? qty > 0
                                    ? "border-amber-500/60 bg-amber-50 shadow-sm ring-2 ring-amber-400/30"
                                    : "border-amber-300/50 bg-amber-50/50 hover:border-amber-400/60"
                                  : qty > 0
                                    ? "border-brand-primary/40 bg-brand-primary/5"
                                    : "border-brand-dark/10 bg-white hover:border-brand-dark/20"
                              )}
                            >
                              <span className={cn("text-sm font-medium", addon.highlight ? "text-brand-dark font-semibold" : "text-brand-dark")}>
                                {addon.name}
                                {addon.description && <span className="block text-xs font-normal text-brand-muted mt-0.5">{addon.description}</span>}
                                {qty > 0 && (
                                  <span className="block text-xs font-semibold text-brand-primary mt-1">Selected × {qty}</span>
                                )}
                              </span>
                              <span className="text-sm font-semibold text-brand-primary shrink-0">
                                +${(addon.priceCents / 100).toFixed(0)}{qty > 1 ? ` × ${qty}` : ""}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>

                  {/* Add-on quantity modal */}
                  <Dialog
                    open={!!addonQtyModalAddon}
                    onOpenChange={(open) => {
                      if (!open) setAddonQtyModalAddon(null);
                    }}
                    className="max-w-sm"
                  >
                    {addonQtyModalAddon && (() => {
                      const name = addonQtyModalAddon.name.toLowerCase();
                      const effectiveMax = name.includes("towel") ? 14 : name.includes("ice") ? 2 : (addonQtyModalAddon.maxQty ?? 10);
                      return (
                      <>
                        <h3 className="text-lg font-bold text-brand-dark mb-1">How many?</h3>
                        <p className="text-sm text-brand-muted mb-4">
                          {addonQtyModalAddon.name} — +${(addonQtyModalAddon.priceCents / 100).toFixed(0)} each
                          {effectiveMax < 10 && <span className="block text-xs mt-1">Max {effectiveMax} per rental</span>}
                        </p>
                        <div className="mb-4">
                          <label htmlFor="addon-qty" className="block text-xs font-medium text-brand-dark mb-1.5">Quantity</label>
                          <input
                            id="addon-qty"
                            type="number"
                            min={0}
                            max={effectiveMax}
                            value={addonQtyModalQty}
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10);
                              if (!Number.isNaN(v)) setAddonQtyModalQty(Math.min(effectiveMax, Math.max(0, v)));
                            }}
                            className="w-full rounded-xl border-2 border-brand-dark/15 bg-white px-3 py-2.5 text-sm focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setAddonSelections((prev) => ({
                              ...prev,
                              [addonQtyModalAddon.id]: addonQtyModalQty,
                            }));
                            setAddonQtyModalAddon(null);
                          }}
                          className="w-full rounded-xl bg-brand-primary text-white font-semibold py-3 px-4 hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2"
                        >
                          {addonQtyModalQty === 0 ? "Remove" : `Add ${addonQtyModalQty}`}
                        </button>
                      </>
                    );})()}
                  </Dialog>

                  {/* Tip — required: choose Tip now or Tip later */}
                  <div className="pb-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted mb-2">
                      Tip <span className="text-red-500 font-semibold normal-case" aria-hidden>*</span>
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setTipModalPercent(tipChoice === "now" ? tipPercent : 20);
                          setTipNowModalOpen(true);
                        }}
                        className={cn(
                          "flex-1 min-w-[7rem] rounded-xl border-2 py-3.5 px-3 text-sm font-semibold transition-all text-center ring-2 ring-brand-primary/50",
                          tipChoice === "now"
                            ? "border-brand-primary bg-brand-primary/15 text-brand-dark ring-brand-primary"
                            : "border-brand-primary bg-white text-brand-dark hover:bg-brand-primary/10 hover:border-brand-primary"
                        )}
                        title="Choose tip amount (20–35%)"
                      >
                        Tip now
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTipChoice("later");
                          setTipLaterMessageOpen(true);
                        }}
                        className={cn(
                          "flex-1 min-w-[7rem] rounded-xl border-2 py-3.5 px-3 text-sm font-semibold transition-all text-center",
                          tipChoice === "later"
                            ? "border-brand-primary/40 bg-brand-primary/5 text-brand-dark"
                            : "border-brand-dark/15 bg-white text-brand-muted hover:border-brand-dark/25 hover:text-brand-dark"
                        )}
                        title="Tip your crew later"
                      >
                        Tip later
                      </button>
                    </div>
                    {tipChoice === "now" && priceSummary.tipCents > 0 && (
                      <p className="text-xs text-brand-muted mt-1.5">{Math.min(35, Math.max(20, tipPercent))}% tip — +${(priceSummary.tipCents / 100).toFixed(2)} added to total</p>
                    )}
                    {tipChoice === "later" && (
                      <p className="text-xs text-brand-muted mt-1.5">You&apos;ll tip your captain directly.</p>
                    )}
                    {tipChoice === null && paymentError?.toLowerCase().includes("tip") && (
                      <p className="text-xs text-red-600 mt-1.5">Please choose Tip now or Tip later.</p>
                    )}
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
                      <span className="text-sm text-brand-dark">I have read and accept the cancellation policy <span className="text-red-500 font-semibold" aria-hidden>*</span></span>
                    </label>
                  </div>
                </div>

                  {/* Sticky pay block — always visible at bottom of step 4 */}
                  <div className="shrink-0 pt-4 pb-2 mt-2 border-t-2 border-brand-dark/10 bg-white shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
                    <div className="rounded-xl border-2 border-brand-primary/20 bg-brand-primary/5 p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
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
                    <p className="text-center text-[11px] text-brand-muted mt-2">Secure payment via Stripe · Card, Apple Pay, Google Pay</p>
                  </div>
                </>
              )}
              {paymentPhase === "loading" && (
                <div className="py-8 flex flex-col items-center justify-center gap-3">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
                  <p className="text-sm text-brand-muted">Preparing checkout…</p>
                </div>
              )}
              {paymentPhase === "stripe" && clientSecret && stripePromise && selectedExperience && selectedSlot && selectedRate && (
                <div className="flex flex-col gap-4 min-h-0">
                  <div className="rounded-xl border-2 border-brand-primary/25 bg-brand-primary/8 p-4 shrink-0 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
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
                    {/* Itemized list */}
                    <div className="border-t border-brand-primary/20 pt-3 space-y-1.5 text-sm">
                      <div className="flex justify-between text-brand-dark">
                        <span className="text-brand-muted">{priceSummary.rateLabel}</span>
                        <span>${(priceSummary.rateCents / 100).toFixed(2)}</span>
                      </div>
                      {priceSummary.addonLines.map((line) => (
                        <div key={line.name} className="flex justify-between text-brand-dark">
                          <span className="text-brand-muted">
                            {line.name}
                            {line.qty > 1 ? ` × ${line.qty}` : ""}
                          </span>
                          <span>+${(line.priceCents / 100).toFixed(2)}</span>
                        </div>
                      ))}
                      {priceSummary.salesTaxCents > 0 && (
                        <div className="flex justify-between text-brand-dark">
                          <span className="text-brand-muted">Sales tax (8.25%)</span>
                          <span>+${(priceSummary.salesTaxCents / 100).toFixed(2)}</span>
                        </div>
                      )}
                      {priceSummary.tipCents > 0 && (
                        <div className="flex justify-between text-brand-dark">
                          <span className="text-brand-muted">Tip ({Math.min(35, Math.max(20, tipPercent))}%)</span>
                          <span>+${(priceSummary.tipCents / 100).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-semibold text-brand-dark pt-1.5 border-t border-brand-dark/10">
                        <span>Total due</span>
                        <span>${(priceSummary.totalCents / 100).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="min-h-[220px] flex flex-col shrink-0">
                    <Elements stripe={stripePromise} options={{ clientSecret }}>
                      <BookingPaymentForm
                        onSuccess={async () => {
                          if (!holdId || !paymentIntentId) {
                            console.error("[BookingModal] complete-after-payment skipped: missing holdId or paymentIntentId", { holdId: !!holdId, paymentIntentId: !!paymentIntentId });
                            setPaymentError("Your payment succeeded. If you don't see a confirmation email, contact us with your email and we'll confirm your booking.");
                            setPaymentPhase("success");
                            return;
                          }
                          try {
                            const res = await fetch("/api/booking/complete-after-payment", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ holdId, paymentIntentId }),
                            });
                            const data = await res.json().catch(() => ({}));
                            if (!res.ok) {
                              const errMsg = (data as { error?: string }).error ?? "Booking is being created; check your email and Admin in a moment.";
                              console.error("[BookingModal] complete-after-payment failed", res.status, data);
                              setPaymentError(errMsg);
                            }
                          } catch (e) {
                            console.error("[BookingModal] complete-after-payment request failed", e);
                            setPaymentError("Your payment succeeded. If you don't see a booking or email, contact us with your email.");
                          }
                          setPaymentPhase("success");
                        }}
                        onError={(msg) => {
                          setPaymentError(msg);
                        }}
                      />
                    </Elements>
                  </div>
                </div>
              )}
              {/* Tip amount modal — 20% minimum, up to 100%; presets + custom */}
              <Dialog
                open={tipNowModalOpen}
                onOpenChange={(open) => {
                  setTipNowModalOpen(open);
                  if (!open) setTipModalPercent(tipChoice === "now" ? tipPercent : 20);
                }}
                className="max-w-sm"
              >
                <h3 className="text-lg font-bold text-brand-dark mb-1">Choose tip amount</h3>
                <p className="text-xs text-brand-muted mb-4">20–35%. Tips go directly to your captain and crew.</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {[20, 22, 25, 28, 30, 35].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setTipModalPercent(p)}
                      className={cn(
                        "rounded-xl border-2 px-4 py-2.5 text-sm font-semibold transition-all",
                        tipModalPercent === p
                          ? "border-brand-primary bg-brand-primary/15 text-brand-dark ring-2 ring-brand-primary/30"
                          : "border-brand-dark/15 bg-white text-brand-muted hover:border-brand-dark/25 hover:text-brand-dark"
                      )}
                    >
                      {p}%
                    </button>
                  ))}
                </div>
                <div className="mb-4">
                  <label htmlFor="tip-custom-pct" className="block text-xs font-medium text-brand-dark mb-1.5">Or enter custom % (20–35)</label>
                  <input
                    id="tip-custom-pct"
                    type="number"
                    min={20}
                    max={35}
                    value={tipModalPercent}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!Number.isNaN(v)) setTipModalPercent(Math.min(35, Math.max(20, v)));
                    }}
                    className="w-full rounded-xl border-2 border-brand-dark/15 bg-white px-3 py-2.5 text-sm focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setTipPercent(Math.min(35, Math.max(20, tipModalPercent)));
                    setTipChoice("now");
                    setTipNowModalOpen(false);
                  }}
                  className="w-full rounded-xl bg-brand-primary text-white font-semibold py-3 px-4 hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2"
                >
                  Apply {tipModalPercent}% tip
                </button>
              </Dialog>
              {/* Tip later message dialog */}
              <Dialog open={tipLaterMessageOpen} onOpenChange={setTipLaterMessageOpen} className="max-w-sm">
                <h3 className="text-lg font-bold text-brand-dark mb-2">We encourage tipping</h3>
                <p className="text-sm text-brand-muted leading-relaxed mb-4">
                  Our crew works hard to make your trip great. Tips go directly to your captain and crew and are a meaningful way to show appreciation. You can add a tip when you pay or tip your captain directly.
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
                    <h3 className="text-xl font-bold text-brand-dark">You&apos;re all set!</h3>
                    <p className="text-sm text-brand-muted mt-1.5 max-w-[280px] mx-auto">
                      {selectedExperience && priceSummary.totalCents > 0 ? (
                        <>We&apos;ve received your payment of <span className="font-semibold text-brand-dark">${(priceSummary.totalCents / 100).toFixed(2)}</span> for {selectedExperience.title}. You&apos;ll get a confirmation email shortly.</>
                      ) : (
                        "We&apos;ve received your payment. You&apos;ll get a confirmation email shortly."
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
