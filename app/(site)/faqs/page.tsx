import type { Metadata } from "next";
import { headers } from "next/headers";
import { brand } from "@/content/brand";
import { faqs } from "@/content/faqs";
import { FAQsPageClient } from "./FAQsPageClient";

export const metadata: Metadata = {
  title: "FAQs | Lake Austin Boat Rentals",
  description:
    "FAQs about Lake Austin boat rentals: pontoon rental, wake boat, sunset cruise. Captain included, pricing, cancellation. Boat Bros ATX, Austin TX.",
  keywords: [
    "Lake Austin boat rental",
    "boat rental Lake Austin with captain",
    "Lake Austin pontoon rental",
    "Lake Austin boat rental prices",
  ],
  openGraph: {
    title: "FAQs | Lake Austin Boat Rentals | Boat Bros",
    description: "Frequently asked questions about Lake Austin boat rentals. Captain, pricing, booking.",
  },
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

export default async function FAQsPage() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const jsonLd = faqJsonLd();

  return (
    <>
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <FAQsPageClient faqs={faqs} />
    </>
  );
}
