"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { useBookingModal } from "@/components/site/BookingModalContext";
import { STATIC_TO_FIRESTORE_SLUG } from "@/lib/booking/static-slug-map";
import type { Experience } from "@/content/experiences";

interface StaticExperienceDetailProps {
  experience: Experience;
}

export function StaticExperienceDetail({ experience }: StaticExperienceDetailProps) {
  const { openWithSelection, setOpen: setBookingModalOpen } = useBookingModal();
  const slug = experience.slug;
  /** Firestore slug to resolve experience (map variant → canonical, or use slug itself for canonical e.g. sunset/holiday). */
  const firestoreSlug = (STATIC_TO_FIRESTORE_SLUG[slug] ?? slug) || null;

  const handleBookNow = () => {
    if (firestoreSlug) {
      openWithSelection({ experienceSlug: firestoreSlug });
    } else {
      setBookingModalOpen(true);
    }
  };
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // Photo 1 = hero/experience section; gallery starts with photo 2 (index 1)
  const gallery = (experience.gallery ?? []).slice(1);

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null);
    };
    if (lightboxIndex != null) {
      document.addEventListener("keydown", onEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", onEscape);
      document.body.style.overflow = "";
    };
  }, [lightboxIndex]);

  const faqs = experience.faqs?.length
    ? experience.faqs
    : [{ q: "What's included?", a: experience.pricingNote }];

  const fromPrice = experience.fromPriceCents != null ? (experience.fromPriceCents / 100).toFixed(0) : null;

  return (
    <div className="bg-brand-bg pb-32 lg:pb-0">
      {/* Hero – matches listing page: gradient, accent bar, breadcrumb */}
      <section className="relative w-full min-h-[52vh] sm:min-h-[58vh] lg:min-h-[64vh] overflow-hidden bg-brand-dark">
        <Image
          src={experience.heroImage}
          alt=""
          fill
          className="object-cover object-center scale-105"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-dark from-25% via-brand-dark/70 via-50% to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_110%,rgba(80,189,186,0.15),transparent_55%)]" />
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" aria-hidden />
        <div className="absolute inset-0 flex flex-col justify-end">
          <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 sm:pb-24 lg:pb-28">
            <Link
              href="/experiences"
              className="inline-flex items-center gap-2 text-white/85 text-sm font-medium hover:text-brand-primary transition-colors rounded-full px-3 py-1.5 -ml-3 hover:bg-white/10 mb-5"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              All trips
            </Link>
            <h1 className="text-[clamp(1.75rem,5vw,2.5rem)] sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-extrabold tracking-tight text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.5)] [text-shadow:0_1px_0_rgba(0,0,0,0.2)]">
              {experience.title}
            </h1>
            <div className="mt-1 h-1 w-16 rounded-full bg-brand-primary/90" aria-hidden />
            <p className="mt-5 text-lg sm:text-xl lg:text-2xl text-white/92 max-w-2xl leading-relaxed font-medium">
              {experience.shortDescription}
            </p>
            <p className="mt-4 text-white/80 text-sm sm:text-base font-normal italic max-w-xl">
              We can&apos;t wait to get you on the water.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {fromPrice && (
                <span className="rounded-full bg-white/15 backdrop-blur-sm border border-white/20 px-4 py-1.5 text-xs font-semibold text-white/95">
                  From ${fromPrice}
                </span>
              )}
              <span className="rounded-full bg-white/10 backdrop-blur-sm border border-white/15 px-4 py-1.5 text-xs font-medium text-white/90">
                {experience.duration}
              </span>
              <span className="rounded-full bg-white/10 backdrop-blur-sm border border-white/15 px-4 py-1.5 text-xs font-medium text-white/90">
                {experience.capacity}
              </span>
            </div>
            <div className="mt-8 flex flex-wrap gap-4">
              <Button size="lg" className="rounded-xl h-14 px-10 text-base font-bold shadow-premium ring-2 ring-white/30 ring-offset-2 ring-offset-brand-dark hover:ring-brand-primary" onClick={handleBookNow}>
                Book now
              </Button>
              <Button asChild variant="outline" size="lg" className="rounded-xl h-14 px-10 border-2 border-white/60 text-white hover:bg-white/15 hover:border-white font-medium">
                <Link href="/experiences">All experiences</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Mobile: sticky bar – matches listing (price + CTA) */}
      <div className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-between gap-4 border-t border-brand-dark/10 bg-brand-bg/95 backdrop-blur-xl px-4 py-3 lg:hidden shadow-[0_-4px_24px_-4px_rgba(0,0,0,0.08)]">
        <span className="font-bold text-brand-dark">
          {fromPrice ? `From $${fromPrice}` : "See dates"}
        </span>
        <Button size="lg" className="rounded-xl shrink-0" onClick={handleBookNow}>
          Reserve your spot
        </Button>
      </div>

      {/* Book now section: opens shared navbar booking modal with this experience pre-selected (step 2 = date & time). */}
      <section className="w-full py-12 sm:py-16 bg-brand-bg border-t border-brand-dark/5" id="book-now" aria-labelledby="book-now-heading">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 id="book-now-heading" className="text-2xl sm:text-3xl font-extrabold text-brand-dark tracking-tight">
            Ready to book?
          </h2>
          <p className="mt-2 text-brand-muted text-base max-w-lg mx-auto">
            Pick your date and time in the next step — we&apos;ll hold your slot while you checkout.
          </p>
          <Button size="lg" className="mt-6 rounded-xl h-14 px-12 text-base font-bold shadow-premium" onClick={handleBookNow}>
            Book now
          </Button>
        </div>
      </section>

      {/* Main content – section rhythm matches listing */}
      <section className="w-full py-20 sm:py-24 lg:py-28 bg-brand-bg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl">
            <span className="inline-block text-[11px] font-bold uppercase tracking-[0.28em] text-brand-primary">
              What it&apos;s like
            </span>
            <h2 className="mt-4 text-2xl sm:text-3xl lg:text-4xl font-extrabold text-brand-dark tracking-tight">
              The vibe
            </h2>
            <p className="mt-2 text-brand-muted text-sm sm:text-base max-w-sm">
              Here&apos;s what makes this one special.
            </p>
            <div className="mt-2 h-px w-12 bg-brand-primary/50 mb-8" aria-hidden />
            <div className="rounded-2xl sm:rounded-3xl border border-brand-dark/5 bg-white/80 backdrop-blur-sm p-6 sm:p-8 lg:p-10 shadow-soft ring-1 ring-brand-dark/5">
              <p className="text-brand-dark leading-[1.75] text-[1.0625rem] sm:text-[1.125rem] whitespace-pre-line">
                {experience.description}
              </p>
            </div>

            <div className="mt-14">
              <h3 className="text-xl sm:text-2xl font-extrabold text-brand-dark mb-4 flex items-center gap-3 tracking-tight">
                <CheckCircle2 className="h-6 w-6 text-brand-primary shrink-0" aria-hidden />
                Highlights
              </h3>
              <ul className="flex flex-wrap gap-3 list-none p-0 m-0">
                {experience.highlights.map((h) => (
                  <li key={h}>
                    <span className="inline-flex items-center gap-2 rounded-full bg-brand-primary/10 border border-brand-primary/30 px-4 py-2 text-sm font-medium text-brand-dark">
                      <span className="h-2 w-2 rounded-full bg-brand-primary shrink-0" aria-hidden />
                      {h}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {gallery.length > 0 && (
              <div className="mt-14">
                <span className="inline-block text-[11px] font-bold uppercase tracking-[0.28em] text-brand-secondary">
                  On the water
                </span>
                <h2 className="mt-2 text-2xl sm:text-3xl font-extrabold text-brand-dark mb-2 tracking-tight">See the day</h2>
                <p className="mt-1 text-brand-muted text-sm max-w-lg">
                  Real moments from the lake — tap any photo to expand.
                </p>
                <div className="mt-2 h-px w-12 bg-brand-secondary/50 mb-6" aria-hidden />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6">
                  {gallery.map((src, i) => (
                    <motion.button
                      key={src}
                      type="button"
                      onClick={() => setLightboxIndex(i)}
                      className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-brand-dark/5 shadow-premium text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      aria-label="Expand photo"
                    >
                      <Image src={src} alt="" fill className="object-cover" sizes="(max-width: 640px) 50vw, 33vw" />
                    </motion.button>
                  ))}
                </div>
                <AnimatePresence>
                  {lightboxIndex != null && gallery[lightboxIndex] && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm"
                      onClick={() => setLightboxIndex(null)}
                      role="dialog"
                      aria-modal="true"
                      aria-label="Photo view"
                    >
                      <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="relative w-[90vw] max-w-6xl h-[85vh] max-h-[85vh] rounded-2xl overflow-hidden shadow-2xl ring-2 ring-white/20 flex items-center justify-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Image
                          src={gallery[lightboxIndex]}
                          alt={`Gallery photo ${lightboxIndex + 1}`}
                          fill
                          className="object-contain"
                          sizes="90vw"
                          priority
                        />
                      </motion.div>
                      <button
                        type="button"
                        onClick={() => setLightboxIndex(null)}
                        className="absolute top-4 right-4 p-2.5 rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        aria-label="Close"
                      >
                        <X className="h-6 w-6" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {faqs.length > 0 && (
            <section className="mt-20 lg:mt-24 max-w-4xl" aria-labelledby="faq-heading">
              <span className="inline-block text-[11px] font-bold uppercase tracking-[0.28em] text-brand-primary">
                Common questions
              </span>
              <h2 id="faq-heading" className="mt-4 text-2xl sm:text-3xl font-extrabold text-brand-dark mb-2 tracking-tight">
                FAQ
              </h2>
              <p className="mt-1 text-brand-muted text-sm max-w-lg">
                Quick answers — or just text us.
              </p>
              <div className="mt-2 h-px w-12 bg-brand-primary/50 mb-8" aria-hidden />
              <div className="rounded-2xl sm:rounded-3xl border border-brand-primary/20 overflow-hidden bg-white shadow-soft-lg ring-1 ring-brand-dark/5">
                <Accordion type="single" collapsible className="w-full">
                  {faqs.map((item, i) => (
                    <AccordionItem key={i} value={`faq-${i}`} className="border-brand-dark/8 border-b last:border-b-0">
                      <AccordionTrigger className="text-left font-semibold text-brand-dark py-5 px-6 sm:px-8 hover:no-underline hover:bg-brand-primary/5 data-[state=open]:bg-brand-primary/5">
                        {item.q}
                      </AccordionTrigger>
                      <AccordionContent className="text-brand-muted text-base leading-relaxed px-6 sm:px-8 pb-5">
                        {item.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            </section>
          )}

          <section className="mt-20 lg:mt-24 max-w-4xl rounded-2xl sm:rounded-3xl bg-brand-dark py-12 sm:py-16 px-6 sm:px-10 text-center text-white shadow-premium relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-brand-primary/10 via-transparent to-transparent pointer-events-none" aria-hidden />
            <p className="relative text-base sm:text-lg text-white/90 mb-8 max-w-xl mx-auto">
              Find your day in the booking flow — we&apos;ll hold your slot while you checkout.
            </p>
            <div className="relative flex flex-wrap justify-center gap-4">
              <Button size="lg" className="rounded-xl h-14 px-12 text-base font-bold bg-brand-primary text-brand-dark hover:bg-brand-primary/90 shadow-premium" onClick={handleBookNow}>
                Reserve your spot
              </Button>
              <Button asChild variant="outline" size="lg" className="rounded-xl h-14 px-12 border-2 border-white/50 text-white hover:bg-white/15 font-medium">
                <Link href="/experiences">All experiences</Link>
              </Button>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
