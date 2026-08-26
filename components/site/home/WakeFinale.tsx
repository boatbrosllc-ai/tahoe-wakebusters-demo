"use client";

import { homepageCopy } from "@/content/homepage";
import { useBookingModal } from "@/components/site/BookingModalContext";
import { analytics } from "@/lib/analytics";
import { getPublicPhone } from "@/lib/seo/public-contact";
import { CtaCard } from "@/components/ui/cta-card";

const copy = homepageCopy.finale;

/**
 * Closing CTA — 21st.dev lavikatiyar/cta-card (photo + copy overlap),
 * replacing the previous gallery CTA.
 */
export function WakeFinale() {
  const { setOpen } = useBookingModal();
  const phone = getPublicPhone();

  return (
    <section
      className="relative overflow-hidden bg-white px-5 py-20 sm:px-8 sm:py-24 lg:px-14 xl:px-20"
      aria-label={copy.h2}
    >
      <div className="relative mx-auto max-w-6xl">
        <CtaCard
          eyebrow={copy.eyebrow}
          title={copy.h2}
          description={copy.body}
          primaryLabel={copy.primaryCta}
          onPrimaryClick={() => {
            analytics.bookCtaClick("finale", "home");
            setOpen(true);
          }}
          secondaryLabel={phone ? `Call ${phone.display}` : undefined}
          secondaryHref={phone ? `tel:${phone.tel}` : undefined}
          onSecondaryClick={phone ? () => analytics.callClick("finale", "home") : undefined}
          hint="Secure your date online · Text or call for same-day questions"
          imageSrc="/photos/wakebusters/cta-bachelorette.jpg"
          imageAlt={copy.imageAlt}
        />
      </div>
    </section>
  );
}
