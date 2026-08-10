"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { fishProcessingFaqs } from "@/content/seo/fish-processing";

/**
 * FAQ accordion with answers present in the DOM for SEO.
 * A server-rendered `<dl>` twin is also emitted from the page for crawlers.
 */
export function FishProcessingFAQ() {
  return (
    <section
      id="faq"
      className="scroll-mt-24 section-padding bg-[#0a1422]"
      aria-labelledby="fish-processing-faq-heading"
    >
      <div className="container-wide mx-auto px-5 sm:px-6 lg:px-8 max-w-3xl">
        <h2
          id="fish-processing-faq-heading"
          className="font-display font-extrabold text-white text-3xl sm:text-4xl tracking-tight mb-8"
        >
          Cabo fish processing FAQ
        </h2>

        <Accordion
          type="single"
          collapsible
          className="rounded-xl border border-white/10 bg-[#0c1829] divide-y divide-white/10 overflow-hidden"
        >
          {fishProcessingFaqs.map((faq, i) => (
            <AccordionItem key={faq.question} value={`faq-${i}`} className="border-0 px-4 sm:px-6">
              <AccordionTrigger className="text-left font-semibold text-white text-base sm:text-[17px] hover:no-underline py-5 min-h-[52px]">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-white/65 text-base leading-relaxed pb-5">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
