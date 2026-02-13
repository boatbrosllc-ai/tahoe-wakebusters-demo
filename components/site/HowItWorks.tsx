"use client";

import { motion } from "framer-motion";
import { Calendar, CheckCircle, Anchor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBookingModal } from "@/components/site/BookingModalContext";

const steps = [
  {
    icon: Calendar,
    title: "Choose experience & date",
    description: "Pick pontoon, wake, sunset, or another package and your preferred date.",
  },
  {
    icon: CheckCircle,
    title: "Book now",
    description: "See open slots and book in a few clicks. Instant confirmation.",
  },
  {
    icon: Anchor,
    title: "Show up & enjoy",
    description: "We'll send details and meet you at the dock. Life vests and safety briefing included.",
  },
];

export function HowItWorks() {
  const { setOpen: setBookingModalOpen } = useBookingModal();
  return (
    <section className="section-padding bg-brand-bg" aria-labelledby="how-it-works-heading">
      <div className="container-wide">
        <h2 id="how-it-works-heading" className="text-2xl sm:text-3xl lg:text-4xl font-bold text-brand-dark text-center mb-4 sm:mb-4">
          How it works
        </h2>
        <p className="text-base sm:text-lg text-brand-muted text-center max-w-2xl mx-auto mb-10 sm:mb-12">
          Three simple steps from choosing your trip to being on the water.
        </p>
        <div className="grid sm:grid-cols-3 gap-8 sm:gap-8 max-w-4xl mx-auto gap-y-10 sm:gap-y-0">
          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: i * 0.1 }}
              className="text-center"
            >
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-primary text-white mb-4 shadow-soft" aria-hidden>
                <step.icon className="h-7 w-7" />
              </div>
              <h3 className="text-lg font-semibold text-brand-dark mb-2">{step.title}</h3>
              <p className="text-sm text-brand-muted">{step.description}</p>
            </motion.div>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Button size="lg" className="rounded-xl" onClick={() => setBookingModalOpen(true)}>
            Book now
          </Button>
        </div>
      </div>
    </section>
  );
}
