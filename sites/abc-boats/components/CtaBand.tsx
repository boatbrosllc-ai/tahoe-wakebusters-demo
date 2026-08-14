"use client";

import { BookingWidget } from "@/components/site/BookingWidget";
import { useBookingModal } from "@/components/site/BookingModalContext";

export function AbcBoatsCtaBand() {
  const { setOpen: setBookingModalOpen } = useBookingModal();

  return (
    <section className="abc-home-cta-band relative overflow-hidden bg-[#e85d4c] px-6 py-20 text-left sm:px-10">
      <div className="relative z-10 mx-auto max-w-5xl">
        <h2 className="font-display text-4xl leading-none text-white sm:text-6xl">
          pick a morning.
          <br />
          we&apos;ll bring the boat.
        </h2>
        <p className="mt-4 max-w-md text-white/90">
          Availability and payment are the shared Slipstack booking flow. Only this page changed.
        </p>
        <div className="abc-home-cta mt-8">
          <BookingWidget
            source="abc-cta-band"
            page="home"
            onDark
            showCall={false}
            onBookNowClick={() => setBookingModalOpen(true)}
            primaryLabel="See open days"
          />
        </div>
      </div>
    </section>
  );
}
