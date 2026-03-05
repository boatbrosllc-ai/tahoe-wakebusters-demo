"use client";

import { useCallback, useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/button";
import { ExperienceBookingCard } from "./ExperienceBookingCard";

interface BookingData {
  experienceId: string;
  experienceName: string;
  slug: string;
  rates: { id: string; durationHours: number; priceCents: number; displayName: string }[];
  addons: { id: string; name: string; priceCents: number; type: "toggle" | "quantity" | "tip"; maxQty?: number }[];
  maxGuests: number;
  petsMax: number;
  pricingType?: "charter" | "ticketed";
  maxCapacity?: number;
  departureHour?: number;
  departureMinute?: number;
}

interface BookingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, show the booking card immediately. */
  bookingData?: BookingData | null;
  /** When provided and bookingData is null, fetch this slug when modal opens (for static pages). */
  firestoreSlug?: string | null;
  /** Pre-select this date in the booking form (e.g. when user clicked a day in the calendar section). */
  initialDate?: string | null;
}

export function BookingModal({
  open,
  onOpenChange,
  bookingData,
  firestoreSlug,
  initialDate,
}: BookingModalProps) {
  const [fetchedData, setFetchedData] = useState<BookingData | null>(null);
  const [fetchComplete, setFetchComplete] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const doFetch = useCallback(() => {
    if (!firestoreSlug) return;
    setFetchComplete(false);
    setRetrying(true);
    setFetchError(null);
    fetch(`/api/experiences/${firestoreSlug}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.id) {
          setFetchedData({
            experienceId: data.id,
            experienceName: data.experience?.title ?? "",
            slug: data.experience?.slug ?? firestoreSlug,
            rates: data.rates ?? [],
            addons: data.addons ?? [],
            maxGuests: data.experience?.maxGuests ?? 14,
            petsMax: data.experience?.petsMax ?? 0,
            pricingType: data.experience?.pricingType,
            maxCapacity: data.experience?.maxCapacity,
            departureHour: data.experience?.departureHour,
            departureMinute: data.experience?.departureMinute,
          });
          setFetchError(null);
        } else if (!res.ok) {
          const error = typeof data?.error === "string" ? data.error : "Failed to load booking data";
          const hint = typeof data?.hint === "string" ? data.hint : undefined;
          setFetchError(hint ? `${error}. ${hint}` : error);
          setFetchedData(null);
        } else {
          setFetchError(null);
          setFetchedData(null);
        }
      })
      .finally(() => {
        setFetchComplete(true);
        setRetrying(false);
      });
  }, [firestoreSlug]);

  const data = bookingData ?? fetchedData;
  const loading = !bookingData && firestoreSlug && !fetchComplete;

  useEffect(() => {
    if (!open) return;
    if (bookingData) {
      setFetchedData(null);
      setFetchComplete(true);
      return;
    }
    if (!firestoreSlug) {
      setFetchComplete(true);
      return;
    }
    doFetch();
  }, [open, firestoreSlug, bookingData, doFetch]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={data ? data.experienceName : "Book now"}
      description={data ? "Choose your date and time, add your details, then pay. Your slot is held for 10 minutes." : undefined}
      className="w-full h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-w-xl sm:max-h-[90vh] md:max-w-2xl overflow-y-auto"
    >
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden -mx-2 px-2">
        {loading && (
          <div className="py-12 flex flex-col items-center justify-center text-brand-muted">
            <div className="h-10 w-10 rounded-full border-2 border-brand-primary border-t-transparent animate-spin mb-4" aria-hidden />
            <p className="text-sm font-medium">Loading…</p>
          </div>
        )}
        {data && !loading && (
          <ExperienceBookingCard
            experienceId={data.experienceId}
            experienceName={data.experienceName}
            slug={data.slug}
            rates={data.rates}
            addons={data.addons}
            maxGuests={data.maxGuests}
            petsMax={data.petsMax}
            pricingType={data.pricingType}
            maxCapacity={data.maxCapacity}
            departureHour={data.departureHour}
            departureMinute={data.departureMinute}
            initialDate={initialDate ?? undefined}
            className="border-0 shadow-none p-0 rounded-none"
          />
        )}
        {!data && !loading && !firestoreSlug && (
          <p className="text-sm text-brand-muted py-8 text-center">
            No booking data. Use the sidebar to book now.
          </p>
        )}
        {!data && !loading && firestoreSlug && (
          <div className="py-8 text-center space-y-4">
            <p className="text-sm text-brand-muted">
              {fetchError ?? "Booking setup is required. This experience may not be configured yet."}
            </p>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="rounded-xl"
              onClick={doFetch}
              disabled={retrying}
            >
              {retrying ? "Loading…" : "Try again"}
            </Button>
            <a
              href={`tel:${siteConfig.phoneTel}`}
              className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-brand-primary px-6 py-3 text-sm font-medium text-brand-primary hover:bg-brand-primary/10 transition-colors"
              aria-label={`Call ${siteConfig.phone} to book`}
            >
              Call to book
            </a>
          </div>
        )}
      </div>
    </Dialog>
  );
}
