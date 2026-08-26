"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import { getFaqById } from "@/content/faqs";
import { homepageCopy } from "@/content/homepage";
import { useBookingModal } from "@/components/site/BookingModalContext";
import { analytics } from "@/lib/analytics";
import { getPublicPhone } from "@/lib/seo/public-contact";
import { cn } from "@/lib/utils";

/**
 * FAQ Tabs — adapted from 21st.dev vaib215/faq-tabs.
 * Dark navy section, pill category filters, plus-icon accordion.
 */

const CATEGORIES = {
  booking: "Booking",
  captains: "Captains",
  included: "What's included",
  lake: "On the lake",
} as const;

type CategoryKey = keyof typeof CATEGORIES;

const FAQ_BY_CATEGORY: Record<CategoryKey, string[]> = {
  booking: ["how-to-book", "bad-weather", "delivery"],
  captains: ["drive-boat", "capacity", "occasions"],
  included: ["gas-included", "whats-included"],
  lake: ["departures", "north-shore"],
};

function faqsFor(category: CategoryKey) {
  return FAQ_BY_CATEGORY[category]
    .map((id) => getFaqById(id))
    .filter((f): f is NonNullable<typeof f> => Boolean(f));
}

export function WakeFaq() {
  const categoryKeys = Object.keys(CATEGORIES) as CategoryKey[];
  const [selected, setSelected] = useState<CategoryKey>(categoryKeys[0]);
  const { setOpen } = useBookingModal();
  const phone = getPublicPhone();

  return (
    <section
      id="faq"
      className="relative overflow-hidden bg-[#0a1628] px-5 py-20 text-white sm:px-8 sm:py-24 lg:px-14 xl:px-20"
      aria-label={homepageCopy.faq.h2}
    >
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[640px] -translate-x-1/2 rounded-full bg-brand-primary/20 blur-3xl"
        aria-hidden
      />

      <div className="relative z-10 mx-auto max-w-3xl text-center">
        <p className="mb-4 bg-gradient-to-r from-brand-primary to-[#7ee8ff] bg-clip-text text-[11px] font-semibold uppercase tracking-[0.24em] text-transparent">
          Let&apos;s answer this
        </p>
        <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
          {homepageCopy.faq.h2}
        </h2>
      </div>

      <div className="relative z-10 mt-10 flex flex-wrap items-center justify-center gap-3">
        {categoryKeys.map((key) => {
          const active = selected === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(key)}
              className={cn(
                "relative overflow-hidden whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition-colors duration-300",
                active
                  ? "border-white text-[#0a1628]"
                  : "border-white/25 bg-transparent text-white/70 hover:border-white/50 hover:text-white"
              )}
            >
              <span className="relative z-10">{CATEGORIES[key]}</span>
              <AnimatePresence>
                {active ? (
                  <motion.span
                    initial={{ y: "100%" }}
                    animate={{ y: "0%" }}
                    exit={{ y: "100%" }}
                    transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
                    className="absolute inset-0 z-0 bg-white"
                  />
                ) : null}
              </AnimatePresence>
            </button>
          );
        })}
      </div>

      <div className="relative z-10 mx-auto mt-10 max-w-3xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={selected}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.35 }}
            className="space-y-3"
          >
            {faqsFor(selected).map((faq) => (
              <FaqCard key={faq.id} question={faq.question} answer={faq.answer} />
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="relative z-10 mx-auto mt-14 max-w-lg text-center">
        <p className="font-display text-xl font-extrabold">Still have questions?</p>
        <p className="mt-1 text-sm text-white/65">Call us or book online — we&apos;ll sort it.</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              analytics.bookCtaClick("faq", "home");
              setOpen(true);
            }}
            className="inline-flex h-12 items-center justify-center rounded-xl bg-brand-secondary px-6 text-sm font-bold text-white transition hover:brightness-110"
          >
            Check Availability &amp; Book
          </button>
          {phone ? (
            <a
              href={`tel:${phone.tel}`}
              onClick={() => analytics.callClick("faq", "home")}
              className="inline-flex h-12 items-center justify-center rounded-xl border-2 border-white px-5 text-sm font-semibold text-white transition hover:bg-white hover:text-[#0a1628]"
            >
              Call {phone.display}
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function FaqCard({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <motion.div
      animate={open ? "open" : "closed"}
      className={cn(
        "rounded-2xl border transition-colors",
        open ? "border-white/20 bg-white/10" : "border-white/10 bg-white/5"
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 p-4 text-left sm:p-5"
        aria-expanded={open}
      >
        <span
          className={cn(
            "text-base font-semibold transition-colors sm:text-lg",
            open ? "text-white" : "text-white/80"
          )}
        >
          {question}
        </span>
        <motion.span
          variants={{ open: { rotate: "45deg" }, closed: { rotate: "0deg" } }}
          transition={{ duration: 0.2 }}
          className="shrink-0"
        >
          <Plus className={cn("h-5 w-5", open ? "text-brand-primary" : "text-white/50")} />
        </motion.span>
      </button>
      <motion.div
        initial={false}
        animate={{ height: open ? "auto" : 0, marginBottom: open ? 16 : 0 }}
        transition={{ duration: 0.28, ease: "easeInOut" }}
        className="overflow-hidden px-4 sm:px-5"
      >
        <p className="pb-1 text-sm leading-relaxed text-white/70 sm:text-base">{answer}</p>
      </motion.div>
    </motion.div>
  );
}
