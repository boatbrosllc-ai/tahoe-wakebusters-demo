import { headers } from "next/headers";
import { brand } from "@/content/brand";
import type { SeoLandingPageConfig } from "@/lib/experience/seoLanding.data";

const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://nastysportfishing.com").replace(/\/+$/, "");

export async function SeoLandingJsonLd({
  config,
  fromPriceCents,
}: {
  config: SeoLandingPageConfig;
  fromPriceCents?: number | null;
}) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const canonical = `${baseUrl}${config.path}`;
  const scripts: Record<string, unknown>[] = [];

  if (config.schemaVariant === "article") {
    scripts.push({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: config.heroTitle,
      description: config.metaDescription,
      dateModified: new Date().toISOString().slice(0, 10),
      author: { "@type": "Organization", name: brand.companyName },
      publisher: { "@type": "Organization", name: brand.companyName, url: baseUrl },
      mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    });
  } else {
    const service: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Service",
      serviceType: config.serviceSchemaType,
      name: config.serviceSchemaName,
      description: config.metaDescription,
      provider: { "@type": "LocalBusiness", name: brand.companyName, url: baseUrl },
      areaServed: { "@type": "Place", name: "Austin, TX" },
      url: canonical,
    };
    if (fromPriceCents != null && fromPriceCents > 0) {
      service.offers = {
        "@type": "Offer",
        price: (fromPriceCents / 100).toFixed(0),
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        url: `${baseUrl}/booking`,
      };
    }
    scripts.push(service);
  }

  const breadcrumbItems = config.breadcrumbs ?? [
    { name: "Home", href: "/" },
    { name: config.breadcrumbCurrentName, href: config.path },
  ];
  scripts.push({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.href.startsWith("http") ? item.href : `${baseUrl}${item.href}`,
    })),
  });

  if (config.faq.length) {
    scripts.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: config.faq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    });
  }

  return (
    <>
      {scripts.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
    </>
  );
}
