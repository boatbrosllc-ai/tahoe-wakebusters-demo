import type { Metadata } from "next";
import { brand } from "@/content/brand";
import { faqs } from "@/content/faqs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { BookingCTA } from "@/components/site/BookingCTA";

export const metadata: Metadata = {
  title: "FAQs | Lake Travis & Lake Austin Boat Rentals",
  description: `Frequently asked questions about boat rentals on Lake Travis and Lake Austin. ${brand.companyName}, Austin TX.`,
};

function faqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.answer,
      },
    })),
  };
}

export default function FAQsPage() {
  const jsonLd = faqJsonLd();

  return (
    <div className="section-padding bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="container-narrow px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-brand-dark mb-2">
          Frequently asked questions
        </h1>
        <p className="text-lg text-brand-muted mb-10">
          Quick answers about what&apos;s included, booking, and what to bring. Austin & Lake Travis.
        </p>
        <Accordion type="single" collapsible className="w-full space-y-0">
          {faqs.map((f) => (
            <AccordionItem key={f.id} value={f.id}>
              <AccordionTrigger className="text-left font-medium text-brand-dark py-5">
                {f.question}
              </AccordionTrigger>
              <AccordionContent className="text-brand-muted pb-5">
                {f.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <div className="mt-12 pt-8 border-t border-brand-dark/10">
          <BookingCTA
            source="faqs_page"
            page="faqs"
            variant="secondary"
            primaryHint="Instant confirmation · Easy reschedule"
          />
        </div>
      </div>
    </div>
  );
}
