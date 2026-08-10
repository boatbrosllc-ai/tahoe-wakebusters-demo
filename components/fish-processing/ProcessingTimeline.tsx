"use client";

import { motion } from "framer-motion";
import { fishProcessingConfig } from "@/content/seo/fish-processing";

export function ProcessingTimeline() {
  const steps = fishProcessingConfig.processSteps;

  return (
    <section
      className="section-padding bg-[#0a1422]"
      aria-labelledby="processing-timeline-heading"
    >
      <div className="container-wide mx-auto px-5 sm:px-6 lg:px-8">
        <h2
          id="processing-timeline-heading"
          className="font-display font-extrabold text-white text-3xl sm:text-4xl lg:text-5xl tracking-tight max-w-4xl mb-10 sm:mb-14"
        >
          YOU FISH. WE HANDLE EVERYTHING AFTER THAT.
        </h2>

        {/* Mobile: vertical stack */}
        <ol className="lg:hidden space-y-0 relative border-l border-brand-primary/40 ml-3 pl-6">
          {steps.map((step, i) => (
            <motion.li
              key={step.title}
              initial={{ opacity: 0, x: -8 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.35, delay: i * 0.05 }}
              className="relative pb-8 last:pb-0"
            >
              <span
                className="absolute -left-[1.9rem] top-1 h-3.5 w-3.5 rounded-full bg-brand-primary ring-4 ring-[#0a1422]"
                aria-hidden
              />
              <p className="text-brand-primary text-xs font-bold tracking-[0.16em] mb-1">
                0{i + 1}
              </p>
              <h3 className="font-display font-bold text-white text-lg tracking-wide">{step.title}</h3>
              <p className="mt-1 text-white/60 text-sm leading-relaxed">{step.description}</p>
            </motion.li>
          ))}
        </ol>

        {/* Desktop: horizontal */}
        <ol className="hidden lg:grid grid-cols-6 gap-3 relative">
          <div
            className="absolute top-5 left-0 right-0 h-px bg-gradient-to-r from-brand-primary/20 via-brand-primary/60 to-brand-primary/20"
            aria-hidden
          />
          {steps.map((step, i) => (
            <motion.li
              key={step.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className="relative pt-0"
            >
              <span
                className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-brand-dark border-2 border-brand-primary text-brand-primary text-xs font-bold mb-4"
                aria-hidden
              >
                {i + 1}
              </span>
              <h3 className="font-display font-bold text-white text-sm tracking-wide mb-2">
                {step.title}
              </h3>
              <p className="text-white/55 text-sm leading-relaxed">{step.description}</p>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
