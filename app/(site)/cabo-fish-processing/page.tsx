import type { Metadata } from "next";
import { brand } from "@/content/brand";
import { PageBreadcrumbs } from "@/components/experience/PageBreadcrumbs";
import { FishProcessingPageClient } from "@/components/fish-processing/FishProcessingPageClient";
import {
  fishProcessingConfig,
  fishProcessingFaqs,
} from "@/content/seo/fish-processing";
import {
  breadcrumbJsonLd,
  buildSeoMetadata,
  faqPageJsonLd,
  serviceJsonLd,
} from "@/lib/seo/metadata";

const path = "/cabo-fish-processing";

const title = `Cabo Fish Processing | Vacuum Seal & Freeze Your Catch | ${brand.companyName}`;
const description =
  `Professional Cabo fish processing from ${brand.companyName}. Filleting, portioning, vacuum sealing, freezing, travel-ready packaging and qualifying fish shipping from Cabo San Lucas.`;

export const metadata: Metadata = buildSeoMetadata({
  path,
  title,
  description,
  absoluteTitle: true,
  ogImage: fishProcessingConfig.heroImage,
  ogImageAlt: fishProcessingConfig.heroImageAlt,
});

export default function CaboFishProcessingPage() {
  const crumbs = [
    { name: "Home", href: "/" },
    { name: "Guides", href: "/cabo-san-lucas-fishing-charters" },
    { name: "Fish Processing", href: path },
  ];

  const faqSchema = faqPageJsonLd(fishProcessingFaqs);
  const schemas = [
    breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Guides", path: "/cabo-san-lucas-fishing-charters" },
      { name: "Cabo Fish Processing", path },
    ]),
    serviceJsonLd({
      name: "Cabo Fish Processing",
      description,
      path,
      priceDescription: `$${fishProcessingConfig.pricePerProcessedLbLow}–$${fishProcessingConfig.pricePerProcessedLbHigh} per finished processed pound ($${fishProcessingConfig.minimumCharge} minimum). Resort delivery, travel packaging, and shipping priced separately when available.`,
    }),
    ...(faqSchema ? [faqSchema] : []),
  ];

  return (
    <article className="bg-[#070f1a] min-h-screen text-white">
      {schemas.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}

      <div className="bg-brand-dark">
        <PageBreadcrumbs items={crumbs} />
      </div>

      <FishProcessingPageClient />

      {/* Server-rendered FAQ twin for SEO (visible to crawlers / noscript). */}
      <noscript>
        <section className="px-5 py-10 max-w-3xl mx-auto">
          <h2>Cabo fish processing FAQ</h2>
          <dl>
            {fishProcessingFaqs.map((faq) => (
              <div key={faq.question} className="mb-4">
                <dt>
                  <strong>{faq.question}</strong>
                </dt>
                <dd>{faq.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      </noscript>
    </article>
  );
}
