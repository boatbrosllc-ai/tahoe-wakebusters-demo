"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { ExperienceCalendarSection } from "./ExperienceCalendarSection";
import { STATIC_TO_FIRESTORE_SLUG } from "@/lib/booking/static-slug-map";
import type { Experience } from "@/content/experiences";

interface StaticExperienceDetailProps {
  experience: Experience;
}

export function StaticExperienceDetail({ experience }: StaticExperienceDetailProps) {
  const slug = experience.slug;
  const bookHref = `/experiences/${slug}/book`;
  const firestoreSlug = STATIC_TO_FIRESTORE_SLUG[slug] ?? null;
  const faqs = experience.faqs?.length
    ? experience.faqs
    : [{ q: "What's included?", a: experience.pricingNote }];

  return (
    <div className="bg-brand-bg/50 pb-36 lg:pb-0">
      {/* Hero – full-bleed, tall, dramatic overlay */}
      <section className="relative w-full min-h-[320px] sm:min-h-[380px] lg:min-h-[440px] max-h-[70vh] overflow-hidden bg-brand-dark">
        <Image
          src={experience.heroImage}
          alt=""
          fill
          className="object-cover object-center scale-105"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-dark via-brand-dark/70 via-40% to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(80,189,186,0.15),transparent)]" />
        <div className="absolute inset-0 flex flex-col justify-end">
          <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-10 sm:pb-14 lg:pb-20 pt-32">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-extrabold tracking-tight text-white drop-shadow-2xl [text-shadow:0_2px_20px_rgba(0,0,0,0.4)]">
              {experience.title}
            </h1>
            <p className="mt-4 text-lg sm:text-xl lg:text-2xl text-white/90 max-w-2xl leading-relaxed">
              {experience.shortDescription}
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Button asChild size="lg" className="rounded-xl h-14 px-10 text-base font-bold shadow-premium ring-2 ring-white/30 ring-offset-2 ring-offset-brand-dark hover:ring-brand-primary">
                <Link href={bookHref}>Book now</Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="rounded-xl h-14 px-10 border-2 border-white/60 text-white hover:bg-white/15 hover:border-white font-medium">
                <Link href="/experiences">All experiences</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Mobile: sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-between gap-4 border-t border-brand-dark/10 bg-white/95 backdrop-blur-lg px-4 py-3 shadow-premium lg:hidden">
        <span className="text-sm text-brand-muted">Pick a date and time on the next page</span>
        <Button asChild size="lg" className="rounded-xl shrink-0">
          <Link href={bookHref}>Book now</Link>
        </Button>
      </div>

      {firestoreSlug && (
        <ExperienceCalendarSection
          firestoreSlug={firestoreSlug}
          bookHref={bookHref}
          directCheckout
          onSelectSlot={() => {}}
        />
      )}

      {/* Main content */}
      <section className="section-padding pt-12 sm:pt-16 lg:pt-24">
        <div className="container-narrow mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
          <Link
            href="/experiences"
            className="inline-flex items-center gap-2 text-brand-primary font-semibold text-sm sm:text-base mb-8 sm:mb-10 hover:text-brand-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded-lg transition-colors"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            Back to experiences
          </Link>
          <div className="space-y-10 lg:space-y-14">
            <div className="rounded-3xl bg-white p-8 sm:p-10 shadow-premium border border-brand-dark/5 border-t-4 border-t-brand-primary">
              <p className="text-lg sm:text-xl lg:text-2xl text-brand-dark leading-relaxed">
                {experience.description}
              </p>
            </div>

            <div className="rounded-3xl bg-white p-8 sm:p-10 shadow-premium border border-brand-dark/5 border-t-4 border-t-brand-primary">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-brand-dark mb-6 flex items-center gap-3 tracking-tight">
                <CheckCircle2 className="h-7 w-7 text-brand-primary shrink-0" aria-hidden />
                Highlights
              </h2>
              <ul className="grid sm:grid-cols-2 gap-4 sm:gap-5">
                {experience.highlights.map((h) => (
                  <li key={h} className="flex items-center gap-3 text-brand-dark text-base sm:text-lg">
                    <span className="h-3 w-3 rounded-full bg-brand-primary shrink-0" aria-hidden />
                    {h}
                  </li>
                ))}
              </ul>
            </div>

            {experience.gallery.length > 0 && (
              <div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-brand-dark mb-6 tracking-tight">Gallery</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6">
                  {experience.gallery.map((src) => (
                    <div key={src} className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-brand-dark/5 shadow-premium transition-transform duration-300 hover:scale-[1.02]">
                      <Image src={src} alt="" fill className="object-cover" sizes="(max-width: 640px) 50vw, 33vw" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {faqs.length > 0 && (
            <section className="mt-14 lg:mt-16" aria-labelledby="faq-heading">
              <div className="rounded-3xl bg-white border border-brand-dark/5 shadow-premium p-8 sm:p-10 lg:p-12">
                <h2 id="faq-heading" className="text-2xl sm:text-3xl font-extrabold text-brand-dark mb-6 tracking-tight">
                  FAQs
                </h2>
                <Accordion type="single" collapsible className="w-full">
                  {faqs.map((item, i) => (
                    <AccordionItem key={i} value={`faq-${i}`} className="border-brand-dark/10">
                      <AccordionTrigger className="text-left font-semibold text-base sm:text-lg py-6 hover:no-underline">
                        {item.q}
                      </AccordionTrigger>
                      <AccordionContent className="text-base text-brand-muted leading-relaxed">
                        {item.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            </section>
          )}

          <div className="mt-14 lg:mt-16 rounded-3xl bg-brand-dark p-8 sm:p-12 text-center text-white shadow-premium">
            <p className="text-base sm:text-lg text-white/90 mb-8 max-w-xl mx-auto">Ready to book? Pick a date and time on the next page — your slot is held for 10 minutes at checkout.</p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button asChild size="lg" className="rounded-xl h-14 px-12 text-base font-bold bg-brand-primary text-brand-dark hover:bg-brand-primary/90 shadow-premium">
                <Link href={bookHref}>Book now</Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="rounded-xl h-14 px-12 border-2 border-white/50 text-white hover:bg-white/15 font-medium">
                <Link href="/experiences">All experiences</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
