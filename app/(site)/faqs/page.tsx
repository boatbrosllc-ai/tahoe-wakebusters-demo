import type { Metadata } from "next";
import { headers } from "next/headers";
import { brand } from "@/content/brand";
import { faqs } from "@/content/faqs";
import { FAQsPageClient } from "./FAQsPageClient";

const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://nastysportfishing.com").replace(/\/+$/, "");
const canonical = `${baseUrl}/faqs`;

export const metadata: Metadata = {
  title: "FAQs | Cabo Sport Fishing Charters",
  description:
    "FAQs about Cabo San Lucas fishing charters: what's included, weather, tipping, marina meet-up, licenses. Nasty Sport Fishing.",
  keywords: [
    "Cabo fishing charter FAQ",
    "Cabo San Lucas sport fishing",
    "fishing charter cancellation",
    "marina Cabo San Lucas",
  ],
  alternates: { canonical },
  openGraph: {
    title: "FAQs | Cabo Sport Fishing | Nasty Sport Fishing",
    description: "Frequently asked questions about Cabo fishing charters. Captain, pricing, booking.",
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
