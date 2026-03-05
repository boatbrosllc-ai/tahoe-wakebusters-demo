"use client";

import { useCallback } from "react";
import { ExperienceCalendarSection } from "@/components/experience/ExperienceCalendarSection";
import { useBookingModal } from "@/components/site/BookingModalContext";

const BOOKING_SECTION_ID = "pontoon-booking";

/**
 * Embeds the same pontoon booking calendar used on /experiences/lake-austin-pontoon.
 * Used on event landing pages (e.g. bachelorette/bachelor) below the content sections.
 */
export function PontoonBookingEmbed() {
  const { openWithSelection } = useBookingModal();
  const handleOpenInModal = useCallback(
    (selection: { experienceId?: string; experienceSlug?: string; date: string; slotId: string; boatId?: string }) => {
      openWithSelection(selection);
    },
    [openWithSelection]
  );

  return (
    <section
      id={BOOKING_SECTION_ID}
      className="relative z-10 max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 py-8 sm:py-10"
      aria-labelledby="booking-heading"
    >
      <h2 id="booking-heading" className="sr-only">
        Book your Lake Austin pontoon rental
      </h2>
      <div className="flex justify-center">
        <div className="w-full max-w-md sm:max-w-lg lg:max-w-xl">
          <ExperienceCalendarSection
            firestoreSlug="pontoon"
            experienceSlug="pontoon"
            onOpenInModal={handleOpenInModal}
            variant="dark-card"
          />
        </div>
      </div>
    </section>
  );
}
