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

  const doFetch = useCallback(() => {
    if (!firestoreSlug) return;
    setFetchComplete(false);
    setRetrying(true);
    fetch(`/api/experiences/${firestoreSlug}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.id) return;
        setFetchedData({
          experienceId: data.id,
          experienceName: data.experience?.title ?? "",
          slug: data.experience?.slug ?? firestoreSlug,
          rates: data.rates ?? [],
          addons: data.addons ?? [],
          maxGuests: data.experience?.maxGuests ?? 14,
          petsMax: data.experience?.petsMax ?? 0,
        });
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

  useEffect(() => {
    if (!open || bookingData || !firestoreSlug || data || loading) return;
    if (process.env.NODE_ENV !== "development" || typeof window === "undefined") return;
    const key = "boat-bros-seed-triggered";
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      fetch("/api/booking/seed-experiences", { method: "POST" }).catch(() => {});
    }
    const t1 = setTimeout(doFetch, 3000);
    const t2 = setTimeout(doFetch, 8000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [open, bookingData, firestoreSlug, data, loading, doFetch]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={data ? data.experienceName : "Book now"}
      description={data ? "Choose your date and time, add your details, then pay. Your slot is held for 10 minutes." : undefined}
      className="max-w-lg sm:max-w-xl md:max-w-2xl w-full max-h-[90dvh] sm:max-h-[88vh]"
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
              Booking isn&apos;t loading yet. Give it a moment, then click Try again.
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
            {process.env.NODE_ENV !== "development" && (
              <a
                href={`tel:${siteConfig.phoneTel}`}
                className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-brand-primary px-6 py-3 text-sm font-medium text-brand-primary hover:bg-brand-primary/10 transition-colors"
                aria-label={`Call ${siteConfig.phone} to book`}
              >
                Call to book
              </a>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
