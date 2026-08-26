"use client";

import { ConnoisseurStackInteractor } from "@/components/ui/connoisseur-stack-interactor";
import { BookingCTA } from "@/components/site/BookingCTA";
import { useBookingModal } from "@/components/site/BookingModalContext";
import { homepageCopy } from "@/content/homepage";

const steps = [
  {
    num: "01",
    name: "Pick your boat",
    clipId: "clip-original",
    image: "/photos/wakebusters/wakesurf.jpg",
    imageX: -80,
    imageY: -145,
    imageWidth: 700,
    imageHeight: 525,
  },
  {
    num: "02",
    name: "Book online instantly",
    clipId: "clip-calendar",
    image: "/photos/wakebusters/book-online.png",
    // Pull in side padding; keep full week + Continue in frame
    imageX: -28,
    imageY: -262,
    imageWidth: 556,
    imageHeight: 799,
  },
  {
    num: "03",
    name: "Show up and have fun",
    clipId: "clip-pixels",
    image: "/photos/wakebusters/lilypad.jpg",
    imageX: -220,
    imageY: -180,
    imageWidth: 940,
    imageHeight: 705,
  },
];

/**
 * How it works — hover a step to morph the photo collage.
 */
export function WakeSteps() {
  const { setOpen } = useBookingModal();

  return (
    <section className="bg-brand-bg px-5 py-20 sm:px-8 sm:py-24 lg:px-14 xl:px-20">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-primary">
            {homepageCopy.howItWorks.eyebrow}
          </p>
          <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-brand-dark sm:text-4xl">
            {homepageCopy.howItWorks.h2}
          </h2>
        </div>

        <ConnoisseurStackInteractor
          items={steps}
          className="min-h-0 bg-transparent p-0 pt-12 md:p-0 md:pt-14"
        />

        <div className="mx-auto mt-14 max-w-md">
          <BookingCTA
            source="how-it-works"
            page="home"
            variant="primary"
            showCall={false}
            onBookNowClick={() => setOpen(true)}
            className="w-full"
            primaryLabel={homepageCopy.howItWorks.cta}
            primaryHint={homepageCopy.howItWorks.hint}
          />
        </div>
      </div>
    </section>
  );
}
