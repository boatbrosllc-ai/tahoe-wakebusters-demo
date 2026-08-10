"use client";

import Link from "next/link";
import { BookingCTA } from "@/components/site/BookingCTA";
import { Button } from "@/components/ui/button";
import { useBookingModal } from "@/components/site/BookingModalContext";
import type { Experience } from "@/content/experiences";
import { STATIC_TO_FIRESTORE_SLUG } from "@/lib/booking/static-slug-map";

interface StaticExperienceBookingSectionProps {
  experience: Experience;
  /** When set, the fallback can show a "Book now" button that opens the booking modal. */
  onOpenBookingModal?: () => void;
}

export function StaticExperienceBookingSection({ experience, onOpenBookingModal }: StaticExperienceBookingSectionProps) {
  const slug = experience.slug;
  const firestoreSlug = (STATIC_TO_FIRESTORE_SLUG[slug] ?? slug) || null;
  const { openWithSelection } = useBookingModal();

  const openModalForExperience = () => {
    if (firestoreSlug) {
      openWithSelection({ experienceSlug: firestoreSlug });
    } else {
      onOpenBookingModal?.();
    }
  };

  if (firestoreSlug) {
    return (
      <div className="rounded-2xl border border-brand-dark/10 bg-white shadow-soft-lg p-6 sm:p-7 lg:sticky lg:top-24">
        <h3 className="text-lg font-semibold text-brand-dark mb-1">Book this experience</h3>
        <p className="text-sm text-brand-muted mb-4">
          Pick a date and complete checkout in our booking flow — same calendar as the rest of the site, optimized for mobile.
        </p>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">From</p>
        <p className="text-base font-medium text-brand-dark mt-1">{experience.pricingNote}</p>
        <p className="text-sm text-brand-muted mt-2">
          {experience.duration} · {experience.capacity}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full rounded-xl shadow-[0_2px_12px_rgba(20,182,220,0.3)] hover:shadow-[0_2px_16px_rgba(20,182,220,0.4)] font-semibold touch-manipulation"
            onClick={openModalForExperience}
          >
            Book now
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full rounded-xl">
            <Link href={`/experiences/${firestoreSlug}`}>View full details</Link>
          </Button>
        </div>
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

  return (
    <div className="rounded-2xl border border-brand-dark/8 bg-white shadow-soft-lg p-6 sm:p-7 lg:sticky lg:top-24">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">From</p>
      <p className="text-base font-medium text-brand-dark mt-1">{experience.pricingNote}</p>
      <p className="text-sm text-brand-muted mt-2">
        {experience.duration} · {experience.capacity}
      </p>
      <p className="mt-4 text-sm text-brand-muted">
        Booking setup is required. This experience may not be configured yet.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {onOpenBookingModal && (
          <Button
            variant="secondary"
            size="lg"
            className="w-full rounded-xl shadow-[0_2px_12px_rgba(20,182,220,0.3)] hover:shadow-[0_2px_16px_rgba(20,182,220,0.4)] font-semibold touch-manipulation"
            onClick={onOpenBookingModal}
          >
            Book now
          </Button>
        )}
      </div>
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
