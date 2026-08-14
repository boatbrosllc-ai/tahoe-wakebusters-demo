import type { Metadata } from "next";
import { headers } from "next/headers";
import { brand } from "@/content/brand";
import { faqs } from "@/content/faqs";
import { FAQsPageClient } from "./FAQsPageClient";
import { getSiteBaseUrl } from "@/config/site";

const baseUrl = getSiteBaseUrl();
const canonical = `${baseUrl}/faqs`;

export const metadata: Metadata = {
  title: "FAQs",
  description: `FAQs about private boat rentals: what's included, weather, tipping, meet-up. ${brand.companyName}.`,
  keywords: ["boat rental FAQ", "charter cancellation", brand.companyName],
  alternates: { canonical },
  openGraph: {
    title: `FAQs | ${brand.companyName}`,
    description: "Frequently asked questions about booking, captain, and pricing.",
    url: canonical,
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
