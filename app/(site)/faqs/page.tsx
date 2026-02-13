import type { Metadata } from "next";
import { brand } from "@/content/brand";
import { faqs } from "@/content/faqs";
import { FAQsPageClient } from "./FAQsPageClient";

export const metadata: Metadata = {
  title: "FAQs | Lake Austin Boat Rentals",
  description: `Frequently asked questions about Lake Austin boat rentals. ${brand.companyName}, Austin TX.`,
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
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <FAQsPageClient faqs={faqs} />
    </>
  );
}
