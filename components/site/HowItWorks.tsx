"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useBookingModal } from "@/components/site/BookingModalContext";
import { siteConfig } from "@/config/site";

const steps = [
  {
    n: "01",
    label: "Pick",
    title: "Choose your trip & date",
    description: `${siteConfig.catalog.halfDay.title} or ${siteConfig.catalog.fullDay.title}. Pick the day you want on the water.`,
  },
  {
    n: "02",
    label: "Lock",
    title: "Book online",
    description: "Live availability. A few clicks. Instant confirmation on your private charter.",
  },
  {
    n: "03",
    label: "Go",
    title: "Meet us at the dock",
    description: "Check-in details in your inbox. Captain and crew ready.",
  },
];

export function HowItWorks() {
  const { setOpen: setBookingModalOpen } = useBookingModal();

  return (
    <section
      className="relative overflow-hidden section-padding bg-brand-bg"
      aria-labelledby="how-it-works-heading"
    >
      {/* Atmosphere — no photos, just brand light */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,_rgba(242,122,10,0.12),_transparent_55%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-20 bottom-0 h-64 w-64 rounded-full bg-brand-primary/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-16 top-1/3 h-52 w-52 rounded-full bg-brand-primary/15 blur-3xl"
        aria-hidden
      />

      <div className="relative container-wide px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto mb-12 sm:mb-16 lg:mb-20">
          <motion.div
            className="flex flex-col items-center text-center"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.45 }}
          >
            <div className="inline-flex items-center gap-3 mb-4">
              <span className="h-px w-8 bg-brand-secondary" aria-hidden />
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-secondary">
                Three easy steps
              </p>
            </div>
            <h2
              id="how-it-works-heading"
              className="font-display text-4xl sm:text-5xl lg:text-[3.5rem] xl:text-6xl font-bold text-brand-dark tracking-tight leading-[1.05]"
            >
              How it works
            </h2>
          </motion.div>
        </div>

        {/* Journey rail */}
        <div className="relative max-w-6xl mx-auto">
          {/* Desktop progress line */}
          <div
            className="pointer-events-none absolute left-[16%] right-[16%] top-[1.35rem] hidden sm:block h-[2px] overflow-hidden"
            aria-hidden
          >
            <motion.div
              className="h-full origin-left bg-gradient-to-r from-brand-secondary via-brand-primary to-brand-secondary"
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
            />
          </div>

          <ol className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-6 lg:gap-10 list-none">
            {steps.map((step, i) => (
              <motion.li
                key={step.n}
                className="relative group"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-30px" }}
                transition={{ duration: 0.5, delay: 0.12 + i * 0.1, ease: [0.22, 1, 0.36, 1] }}
              >
                {/* Mobile connector */}
                {i < steps.length - 1 ? (
                  <div
                    className="absolute left-[1.15rem] top-12 bottom-[-2rem] w-px bg-gradient-to-b from-brand-secondary/70 to-brand-primary/40 sm:hidden"
                    aria-hidden
                  />
                ) : null}

                <div className="flex sm:flex-col gap-5 sm:gap-0 sm:items-center sm:text-center">
                  <div className="relative z-[1] flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-full bg-brand-dark text-[13px] font-bold tracking-[0.12em] text-white shadow-[0_10px_28px_rgba(4,36,74,0.28)] ring-[6px] ring-brand-bg transition-transform duration-300 group-hover:scale-110 group-hover:bg-brand-secondary">
                    {step.n}
                  </div>

                  <div className="min-w-0 sm:mt-8">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-primary mb-2 sm:mb-3">
                      {step.label}
                    </p>
                    <h3 className="font-display text-xl sm:text-2xl font-bold text-brand-dark tracking-tight leading-snug">
                      {step.title}
                    </h3>
                    <p className="mt-3 text-[15px] sm:text-base text-brand-muted leading-relaxed sm:max-w-[17.5rem] sm:mx-auto">
                      {step.description}
                    </p>
                    <div
                      className="mt-5 hidden sm:block mx-auto h-1 w-10 rounded-full bg-brand-secondary/80 transition-all duration-300 group-hover:w-16 group-hover:bg-brand-secondary"
                      aria-hidden
                    />
                  </div>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>

        <motion.div
          className="mt-14 sm:mt-16 flex flex-col items-center gap-4 text-center"
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4, delay: 0.35 }}
        >
          <Button
            size="lg"
            className="rounded-xl bg-brand-secondary hover:bg-brand-secondary/90 text-white font-bold px-9 shadow-[0_12px_32px_rgba(242,122,10,0.32)] transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
            onClick={() => setBookingModalOpen(true)}
          >
            Book a trip
          </Button>
          <p className="text-sm text-brand-muted">
            Private boat · Captain &amp; crew included · Free cancellation up to 30 days before
          </p>
        </motion.div>
      </div>
    </section>
  );
}
