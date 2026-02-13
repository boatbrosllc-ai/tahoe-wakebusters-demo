"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { BookingCTA } from "@/components/site/BookingCTA";
import { HelpCircle, Anchor, FileText, MapPin, CloudRain, Sparkles } from "lucide-react";
import type { FaqItem } from "@/content/faqs";
import { cn } from "@/lib/utils";

const icons: Record<string, React.ComponentType<{ className?: string }>> = {
  "what-included": Sparkles,
  "need-license": Anchor,
  "cancel-reschedule": FileText,
  "where-pickup": MapPin,
  weather: CloudRain,
  bring: HelpCircle,
};

export function FAQsPageClient({ faqs }: { faqs: FaqItem[] }) {
  return (
    <div className="min-h-screen bg-brand-bg/40">
      {/* Hero strip */}
      <section className="relative overflow-hidden bg-brand-dark py-16 sm:py-20 lg:py-24">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/15 via-transparent to-brand-muted/10" aria-hidden />
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-brand-dark to-transparent" aria-hidden />
        <div className="container-narrow relative z-10 px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.2em] text-brand-primary mb-4">
            Lake Austin boat rentals
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white tracking-tight mb-4">
            Frequently asked questions
          </h1>
          <p className="text-lg sm:text-xl text-white/80 max-w-2xl mx-auto">
            Quick answers about what&apos;s included, booking, and what to bring.
          </p>
        </div>
      </section>

      {/* FAQ cards */}
      <section className="relative -mt-8 z-20 px-4 sm:px-6 lg:px-8 pb-20 lg:pb-28">
        <div className="container-narrow mx-auto">
          <Accordion type="single" collapsible className="space-y-4 sm:space-y-5">
            {faqs.map((f) => {
              const Icon = icons[f.id] ?? HelpCircle;
              return (
                <AccordionItem
                  key={f.id}
                  value={f.id}
                  className={cn(
                    "rounded-2xl border-2 border-brand-dark/10 bg-white shadow-soft overflow-hidden",
                    "transition-all duration-200",
                    "hover:shadow-premium hover:border-brand-primary/20",
                    "data-[state=open]:border-brand-primary/30 data-[state=open]:shadow-premium data-[state=open]:ring-2 data-[state=open]:ring-brand-primary/20"
                  )}
                >
                  <AccordionTrigger
                    className={cn(
                      "flex items-center gap-4 py-5 sm:py-6 px-5 sm:px-6 lg:px-8 text-left",
                      "hover:no-underline hover:bg-brand-bg/50",
                      "group [&[data-state=open]]:bg-brand-primary/5 [&[data-state=open]]:border-b [&[data-state=open]]:border-brand-dark/5"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary/15 text-brand-primary",
                        "group-data-[state=open]:bg-brand-primary group-data-[state=open]:text-white transition-colors"
                      )}
                      aria-hidden
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="flex-1 font-semibold text-brand-dark text-base sm:text-lg pr-4">
                      {f.question}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent
                    className={cn(
                      "px-5 sm:px-6 lg:px-8 pb-5 sm:pb-6 pt-0",
                      "text-brand-muted leading-relaxed text-sm sm:text-base"
                    )}
                  >
                    <div className="border-l-2 border-brand-primary/30 pl-6 sm:pl-8 -ml-2">
                      {f.answer}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>

          {/* CTA block */}
          <div className="mt-14 sm:mt-16 rounded-3xl bg-brand-dark p-8 sm:p-10 lg:p-12 text-center shadow-premium overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/20 via-transparent to-brand-muted/10" aria-hidden />
            <div className="relative z-10">
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
                Ready to book?
              </h2>
              <p className="text-white/80 text-sm sm:text-base mb-6 max-w-md mx-auto">
                Pick your experience, date, and time. Instant confirmation · Easy reschedule.
              </p>
              <BookingCTA
                source="faqs_page"
                page="faqs"
                variant="secondary"
                showCall={true}
                onDark
                primaryHint=""
                callHint=""
                className="justify-center"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
