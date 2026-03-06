"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExperienceBookingCard } from "./ExperienceBookingCard";
import { BookingCTA } from "@/components/site/BookingCTA";
import { Button } from "@/components/ui/button";
import type { Experience } from "@/content/experiences";
import { STATIC_TO_FIRESTORE_SLUG } from "@/lib/booking/static-slug-map";
import * as bookingCache from "@/lib/booking/booking-data-cache";

interface ExperienceDetailFromApi {
  id: string;
  experience: { title: string; slug: string; maxGuests: number; petsMax: number };
  rates: { id: string; durationHours: number; displayName: string; priceCents: number; active: boolean }[];
  addons: { id: string; name: string; priceCents: number; type: "toggle" | "quantity" | "tip"; active: boolean; maxQty?: number }[];
}

function mapCacheResultToApiData(
  data: import("@/lib/booking/booking-data-cache").ExperienceBySlugResult,
  firestoreSlug: string
): ExperienceDetailFromApi | null {
  if (!data?.id) return null;
  const exp = data.experience;
  return {
    id: data.id,
    experience: {
      title: exp?.title ?? "",
      slug: firestoreSlug,
      maxGuests: exp?.maxGuests ?? 14,
      petsMax: exp?.petsMax ?? 0,
    },
    rates: (data.rates ?? []).map((r) => ({
      id: r.id,
      durationHours: r.durationHours,
      displayName: r.displayName,
      priceCents: r.priceCents,
      active: true,
    })),
    addons: (data.addons ?? []).map((a) => ({
      id: a.id ?? "",
      name: a.name,
      priceCents: a.priceCents,
      type: a.type as "toggle" | "quantity" | "tip",
      active: true,
      maxQty: a.maxQty,
    })),
  };
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
  const [fetchError, setFetchError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    if (!firestoreSlug) return;
    setLoading(true);
    setFetchError(null);
    bookingCache.invalidate("experience-slug|" + firestoreSlug);
    bookingCache
      .fetchExperienceBySlug(firestoreSlug)
      .then((data) => {
        const mapped = mapCacheResultToApiData(data, firestoreSlug);
        if (mapped) {
          setApiData(mapped);
          setFetchError(null);
        } else {
          setApiData(null);
          setFetchError("Failed to load booking data");
        }
      })
      .catch((err: unknown) => {
        const apiBody = (err as { apiBody?: { error?: string; hint?: string } }).apiBody;
        const error = typeof apiBody?.error === "string" ? apiBody.error : "Failed to load booking data";
        const hint = typeof apiBody?.hint === "string" ? apiBody.hint : undefined;
        setFetchError(hint ? `${error}. ${hint}` : error);
        setApiData(null);
      })
      .finally(() => setLoading(false));
  }, [firestoreSlug]);

  useEffect(() => {
    if (!firestoreSlug) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setFetchError(null);
    bookingCache
      .fetchExperienceBySlug(firestoreSlug, controller.signal)
      .then((data) => {
        const mapped = mapCacheResultToApiData(data, firestoreSlug);
        if (mapped) {
          setApiData(mapped);
          setFetchError(null);
        } else {
          setApiData(null);
          setFetchError("Failed to load booking data");
        }
      })
      .catch((err: unknown) => {
        if ((err as { name?: string }).name === "AbortError") return;
        const apiBody = (err as { apiBody?: { error?: string; hint?: string } }).apiBody;
        const error = typeof apiBody?.error === "string" ? apiBody.error : "Failed to load booking data";
        const hint = typeof apiBody?.hint === "string" ? apiBody.hint : undefined;
        setFetchError(hint ? `${error}. ${hint}` : error);
        setApiData(null);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
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
          setupMessage={fetchError ?? "Booking setup is required. This experience may not be configured yet."}
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
  setupMessage,
}: {
  firestoreSlug: string;
  onOpenBookingModal?: () => void;
  onRefetch?: () => void;
  setupMessage: string;
}) {
  return (
    <>
      <p className="mt-4 text-sm text-brand-muted">
        {setupMessage}
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
