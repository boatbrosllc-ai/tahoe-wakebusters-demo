"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Calendar, MousePointerClick, Anchor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBookingModal } from "@/components/site/BookingModalContext";

const steps = [
  {
    icon: Calendar,
    title: "Choose experience & date",
    description: "Pick pontoon, wake, sunset, or another package and your preferred date.",
    iconHover: { scale: [1, 1.35, 1], y: [0, -6, 0], transition: { duration: 0.45 } },
  },
  {
    icon: MousePointerClick,
    title: "Book now",
    description: "See real-time availability and book in a few clicks.",
    highlight: "Instant confirmation.",
    iconHover: { y: [0, 8, 0], scale: [1, 1.2, 1], transition: { duration: 0.4 } },
  },
  {
    icon: Anchor,
    title: "Show up & enjoy",
    description: "We'll send details and meet you at the dock.",
    highlight: "Life vests and safety briefing included.",
    iconHover: { rotate: [0, -18, 18, 0], scale: [1, 1.15, 1], transition: { duration: 0.5 } },
  },
];

export function HowItWorks() {
  const { setOpen: setBookingModalOpen } = useBookingModal();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  return (
    <section className="section-padding bg-brand-bg" aria-labelledby="how-it-works-heading">
      <div className="container-wide px-4 sm:px-6 lg:px-8">
        <h2 id="how-it-works-heading" className="text-2xl sm:text-3xl lg:text-4xl font-bold text-brand-dark text-center mb-3 sm:mb-4">
          How it works
        </h2>
        <p className="text-base sm:text-lg text-brand-muted text-center max-w-2xl mx-auto mb-8 sm:mb-12">
          Three simple steps from choosing your trip to being on the water.
        </p>

        <ol className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-6 max-w-5xl mx-auto list-none">
          {steps.map((step, i) => (
            <li key={step.title} className="relative flex flex-col items-center text-center h-full">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-24px" }}
                transition={{ duration: 0.35, delay: i * 0.1 }}
                whileHover={{ y: -4, scale: 1.02, transition: { duration: 0.25 } }}
                onHoverStart={() => setHoveredIndex(i)}
                onHoverEnd={() => setHoveredIndex(null)}
                className="relative w-full h-full max-w-sm rounded-2xl ring-4 ring-brand-primary bg-white p-6 shadow-soft hover:shadow-xl hover:ring-offset-2 transition-all duration-300 cursor-default flex flex-col"
              >
                {/* Step number */}
                <motion.span
                  className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-brand-primary text-white text-sm font-bold mb-4"
                  aria-hidden
                  whileHover={{ scale: 1.08 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                >
                  {i + 1}
                </motion.span>
                {/* Icon – animates on card hover */}
                <motion.div
                  className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand-primary/10 text-brand-primary mb-3"
                  aria-hidden
                  animate={hoveredIndex === i ? step.iconHover : { scale: 1, rotate: 0, y: 0 }}
                  transition={hoveredIndex === i ? (step.iconHover.transition ?? { duration: 0.3 }) : { duration: 0.25 }}
                >
                  <step.icon className="h-6 w-6" />
                </motion.div>
                <h3 className="text-lg font-semibold text-brand-dark mb-2">{step.title}</h3>
                <p className="text-sm text-brand-muted mb-1 flex-1">{step.description}</p>
                {step.highlight ? (
                  <p className="text-sm font-medium text-brand-primary">{step.highlight}</p>
                ) : (
                  <p className="text-sm font-medium text-transparent select-none" aria-hidden="true">
                    {"\u00A0"}
                  </p>
                )}
              </motion.div>
            </li>
          ))}
        </ol>

        <div className="mt-10 sm:mt-12 text-center">
          <motion.div
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
            className="inline-block"
          >
            <Button
              size="lg"
              className="rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-white font-semibold px-8 shadow-soft"
              onClick={() => setBookingModalOpen(true)}
            >
              Book now
            </Button>
          </motion.div>
          <p className="mt-3 text-sm text-brand-muted">No hidden fees. Free cancellation up to 30 days before. 50% refund 15–30 days · No refund within 14 days.</p>
        </div>
      </div>
    </section>
  );
}
