import { getSiteBaseUrl, siteConfig } from "@/config/site";
import { experiences } from "@/content/experiences";
import { getHomepageFaqs } from "@/content/faqs";
import { testimonials } from "@/content/testimonials";
import { faqPageJsonLd } from "@/lib/seo/metadata";

/**
 * Homepage JSON-LD: FAQPage + Product (per boat) + reviews for AggregateRating.
 * LocalBusiness is already injected on `/` via CommercialPageSchema.
 */
export function buildHomepageJsonLd(): object {
  const baseUrl = getSiteBaseUrl().replace(/\/+$/, "");
  const faqRaw = faqPageJsonLd(
    getHomepageFaqs().map((f) => ({ question: f.question, answer: f.answer })),
  );
  const faq = faqRaw
    ? Object.fromEntries(Object.entries(faqRaw as Record<string, unknown>).filter(([k]) => k !== "@context"))
    : null;

  const products = experiences.map((boat) => {
    const url = `${baseUrl}/experiences/${boat.slug}`;
    const image = boat.heroImage.startsWith("http")
      ? boat.heroImage
      : `${baseUrl}${boat.heroImage}`;
    const offer =
      boat.fromPriceCents != null && Number.isFinite(boat.fromPriceCents)
        ? {
            "@type": "Offer",
            priceCurrency: siteConfig.business.currency,
            price: (boat.fromPriceCents / 100).toFixed(2),
            url,
            availability: "https://schema.org/InStock",
          }
        : undefined;
    return {
      "@type": "Product",
      name: boat.title,
      description: boat.description,
      image,
      url,
      brand: { "@type": "Brand", name: siteConfig.company.name },
      ...(offer ? { offers: offer } : {}),
    };
  });

  const reviews = testimonials.map((t) => ({
    "@type": "Review",
    reviewBody: t.quote,
    author: { "@type": "Person", name: t.author },
    reviewRating: {
      "@type": "Rating",
      ratingValue: t.rating ?? 5,
      bestRating: 5,
      worstRating: 1,
    },
  }));

  return {
    "@context": "https://schema.org",
    "@graph": [faq, ...products, ...reviews].filter(Boolean),
  };
}
