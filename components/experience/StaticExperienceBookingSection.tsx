"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExperienceBookingCard } from "./ExperienceBookingCard";
import { BookingCTA } from "@/components/site/BookingCTA";
import { Button } from "@/components/ui/button";
import type { Experience } from "@/content/experiences";
import { STATIC_TO_FIRESTORE_SLUG } from "@/lib/booking/static-slug-map";

interface ExperienceDetailFromApi {
  id: string;
  experience: { title: string; slug: string; maxGuests: number; petsMax: number };
  rates: { id: string; durationHours: number; displayName: string; priceCents: number; active: boolean }[];
  addons: { id: string; name: string; priceCents: number; type: "toggle" | "quantity" | "tip"; active: boolean; maxQty?: number }[];
}

interface StaticExperienceBookingSectionProps {
  experience: Experience;
  /** When set, the fallback can show a "Book now" button that opens the booking modal. */
  onOpenBookingModal?: () => void;
}

export function StaticExperienceBookingSection({ experience, onOpenBookingModal }: StaticExperienceBookingSectionProps) {
  const slug = experience.slug;
  const firestoreSlug = STATIC_TO_FIRESTORE_SLUG[slug] ?? null;
  const [apiData, setApiData] = useState<ExperienceDetailFromApi | null>(null);
  const [loading, setLoading] = useState(!!firestoreSlug);

  const refetch = useCallback(() => {
    if (!firestoreSlug) return;
    setLoading(true);
    fetch(`/api/experiences/${firestoreSlug}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data?.id && setApiData(data))
      .finally(() => setLoading(false));
  }, [firestoreSlug]);

  useEffect(() => {
    if (!firestoreSlug) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/experiences/${firestoreSlug}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.id) {
          setApiData(data);
          return;
        }
        if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
          const key = "boat-bros-seed-triggered";
          if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, "1");
            fetch("/api/booking/seed-experiences", { method: "POST" }).catch(() => {});
          }
          const retryMs = 3000;
          setTimeout(() => {
            if (cancelled) return;
            fetch(`/api/experiences/${firestoreSlug}`)
              .then((r) => (r.ok ? r.json() : null))
              .then((d) => d?.id && setApiData(d));
          }, retryMs);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [firestoreSlug]);

  if (loading && !apiData) {
    return (
      <div className="rounded-2xl border border-brand-dark/10 bg-white shadow-soft p-6 animate-pulse">
        <div className="h-6 bg-brand-dark/10 rounded w-1/2 mb-4" />
        <div className="h-32 bg-brand-dark/5 rounded mb-4" />
        <div className="h-10 bg-brand-dark/10 rounded w-full" />
      </div>
    );
  }

  if (apiData) {
    return (
      <ExperienceBookingCard
        experienceId={apiData.id}
        experienceName={apiData.experience.title}
        slug={apiData.experience.slug}
        rates={apiData.rates}
        addons={apiData.addons}
        maxGuests={apiData.experience.maxGuests ?? 14}
        petsMax={apiData.experience.petsMax ?? 0}
      />
    );
  }

  return (
    <div className="rounded-2xl border border-brand-dark/8 bg-white shadow-soft-lg p-6 sm:p-7 lg:sticky lg:top-24">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">From</p>
      <p className="text-base font-medium text-brand-dark mt-1">{experience.pricingNote}</p>
      <p className="text-sm text-brand-muted mt-2">{experience.duration} · {experience.capacity}</p>
      {firestoreSlug ? (
        <StaticCalendarFallback
          firestoreSlug={firestoreSlug}
          onOpenBookingModal={onOpenBookingModal}
          onRefetch={refetch}
        />
      ) : null}
      <div className="mt-6 pt-6 border-t border-brand-dark/10">
        <BookingCTA
          source="experience_detail"
          page={`experiences/${slug}`}
          experience={slug}
          variant="primary"
        />
      </div>
    </div>
  );
}

function StaticCalendarFallback({
  firestoreSlug,
  onOpenBookingModal,
  onRefetch,
}: {
  firestoreSlug: string;
  onOpenBookingModal?: () => void;
  onRefetch?: () => void;
}) {
  return (
    <>
      <p className="mt-4 text-sm text-brand-muted">
        The calendar will appear here in a moment. You can also open the booking modal or try loading again.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {onOpenBookingModal && (
          <Button size="lg" className="w-full rounded-xl" onClick={onOpenBookingModal}>
            Book now
          </Button>
        )}
        {onRefetch && (
          <Button variant="outline" size="lg" className="w-full rounded-xl" onClick={onRefetch}>
            Load times
          </Button>
        )}
        <Button asChild variant="outline" size="lg" className="w-full rounded-xl">
          <Link href={`/experiences/${firestoreSlug}`}>Book now</Link>
        </Button>
      </div>
    </>
  );
}
