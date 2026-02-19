"use client";

import { useState } from "react";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { HelpCircle } from "lucide-react";
import { FAQ_ITEMS } from "@/lib/experience/lakeAustinPontoon.data";
import { cn } from "@/lib/utils";

export interface FAQItem {
  question: string;
  answer: string;
}

export function FAQ({ items: itemsProp }: { items?: FAQItem[] } = {}) {
  const reduceMotion = useReducedMotion();
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const items = itemsProp?.length ? itemsProp : FAQ_ITEMS;

  return (
    <section className="bg-brand-dark py-16 sm:py-20 lg:py-24" aria-labelledby="faq-heading">
      <div className="max-w-4xl mx-auto px-5 sm:px-6 lg:px-8">
        <motion.header
          className="text-center mb-12 sm:mb-14"
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          whileInView={reduceMotion ? {} : { opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-brand-primary mb-4">
            <HelpCircle className="h-3.5 w-3.5" aria-hidden />
            Common questions
          </span>
          <h2
            id="faq-heading"
            className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight"
          >
            FAQ
          </h2>
          <p className="mt-3 text-white/70 text-sm sm:text-base max-w-lg mx-auto">
            Quick answers — or just text us.
          </p>
          <div className="mt-5 h-px w-16 mx-auto bg-brand-primary/50" aria-hidden />
        </motion.header>

        <motion.div
          className="rounded-2xl sm:rounded-3xl border border-white/15 bg-white/[0.07] overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.25)]"
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          whileInView={reduceMotion ? {} : { opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          {items.map((item, i) => {
            const isOpen = openIndex === i;
            const isLast = i === items.length - 1;
            const ariaExpanded = isOpen ? "true" : "false";
            return (
              <div
                key={item.question}
                className={cn(
                  "border-b border-white/10 transition-colors",
                  isOpen && "bg-brand-primary/5",
                  isLast && "border-b-0"
                )}
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className={cn(
                    "w-full flex items-center justify-between gap-4 py-5 sm:py-6 px-6 sm:px-8 text-left transition-colors",
                    "text-white font-semibold text-base sm:text-lg",
                    "hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-inset"
                  )}
                  aria-expanded={ariaExpanded}
                  aria-controls={`faq-answer-${i}`}
                  id={`faq-question-${i}`}
                >
                  <span className="pr-2">{item.question}</span>
                  <ChevronDown
                    className={cn(
                      "h-5 w-5 shrink-0 text-brand-primary/90 transition-transform duration-200",
                      isOpen && "rotate-180"
                    )}
                    aria-hidden
                  />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={`faq-answer-${i}`}
                      role="region"
                      aria-labelledby={`faq-question-${i}`}
                      initial={reduceMotion ? { height: "auto" } : { height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <p className="pb-5 sm:pb-6 px-6 sm:px-8 pt-0 text-white/85 text-sm sm:text-base leading-relaxed">
                        {item.answer}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
