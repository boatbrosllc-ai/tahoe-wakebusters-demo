"use client";

import { motion } from "framer-motion";
import { Compass, Shield, Users } from "lucide-react";
import { brand } from "@/content/brand";
import { BookingCTA } from "@/components/site/BookingCTA";
import { useBookingModal } from "@/components/site/BookingModalContext";

const points = [
  {
    icon: Users,
    title: "You're a guest, not a driver.",
    body: "Everyone in your group gets the same day. Nobody's stuck working.",
  },
  {
    icon: Compass,
    title: "Local knowledge you can't book online.",
    body: "Emerald Bay, Camp Richardson, Sand Harbor — plus the coves that never make the map.",
  },
  {
    icon: Shield,
    title: "Safety handled.",
    body: "Full briefing before departure, certified captain aboard, required gear stocked and checked.",
  },
];

export function WakeCaptain() {
  const { setOpen } = useBookingModal();

  return (
    <section
      id="captain"
      className="bg-brand-dark px-5 py-20 sm:px-8 sm:py-24 lg:px-14 xl:px-20"
      aria-label="Captained Lake Tahoe boat rentals"
    >
      <div className="mx-auto max-w-6xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-primary">
          Included with every charter
        </p>
        <h2 className="mt-2 max-w-3xl font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
          Every Lake Tahoe Boat Rental Comes With a Captain
        </h2>
        <div className="mt-6 max-w-3xl space-y-4 text-base leading-relaxed text-white/70 sm:text-lg">
          <p>
            Lake Tahoe is 22 miles long, 1,600 feet deep, and the wind can turn on you in ten
            minutes. Afternoon chop off the west shore catches first-timers every summer.
          </p>
          <p>
            That&apos;s why every {brand.companyName} charter runs with a USCG-certified captain —
            not as a rule we impose, but as the reason your day actually works. No boater education
            card to chase down. No white-knuckling a 26-foot boat through Tahoe Keys channel. No
            one in your group stuck behind the wheel while everyone else swims.
          </p>
          <p>
            Our captains are Tahoe locals. They know which cove is empty on a Saturday, where the
            wake is cleanest at 9 a.m., and exactly how long you&apos;ve got before the wind comes
            up.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {points.map((point, i) => (
            <motion.article
              key={point.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.45, delay: i * 0.06 }}
              className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-6"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-primary/20 text-brand-primary">
                <point.icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-4 font-display text-lg font-extrabold text-white">{point.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/65">{point.body}</p>
            </motion.article>
          ))}
        </div>

        <p className="mt-8 max-w-3xl text-sm leading-relaxed text-white/55 sm:text-base">
          Captain fees are quoted and paid separately from the boat rate. We&apos;ll walk you
          through the total before you book — no surprises at the dock.
        </p>

        <div className="mt-8 max-w-md">
          <BookingCTA
            source="captain"
            page="home"
            variant="primary"
            onDark
            callPinkOnDark
            showCall={false}
            onBookNowClick={() => setOpen(true)}
            className="w-full"
            primaryLabel="Book a Captained Charter"
            primaryHint=""
          />
        </div>
      </div>
    </section>
  );
}
