import type { Metadata } from "next";
import { getSiteBaseUrl, siteConfig } from "@/config/site";
import { brand } from "@/content/brand";

export function siteBaseUrl(): string {
  return getSiteBaseUrl();
}

export type SeoPageMetaInput = {
  /** Path starting with / (no trailing slash) */
  path: string;
  /** Title segment — layout template appends company name */
  title: string;
  description: string;
  ogImage?: string;
  ogImageAlt?: string;
  /** Use absolute title (no template suffix) when true */
  absoluteTitle?: boolean;
};

export function buildSeoMetadata(input: SeoPageMetaInput): Metadata {
  const baseUrl = getSiteBaseUrl();
  const canonical = `${baseUrl}${input.path}`;
  const image = input.ogImage ?? siteConfig.seo.defaultOgImage;
  const alt = input.ogImageAlt ?? siteConfig.seo.defaultOgImageAlt;
  const title = input.absoluteTitle
    ? { absolute: input.title }
    : input.title;
  const titled = input.absoluteTitle ? input.title : `${input.title} | ${brand.companyName}`;

  return {
    title,
    description: input.description,
    alternates: { canonical },
    openGraph: {
      title: titled,
      description: input.description,
      url: canonical,
      type: "website",
      images: [{ url: image, width: 1200, height: 630, alt }],
    },
    twitter: {
      card: "summary_large_image",
      title: titled,
      description: input.description,
      images: [image],
    },
    robots: { index: true, follow: true },
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]): object {
  const baseUrl = getSiteBaseUrl();
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.path.startsWith("http") ? item.path : `${baseUrl}${item.path}`,
    })),
  };
}

export function faqPageJsonLd(faqs: { question: string; answer: string }[]): object | null {
  if (!faqs.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}

export function articleJsonLd(input: {
  headline: string;
  description: string;
  path: string;
  image?: string;
  dateModified?: string;
}): object {
  const baseUrl = getSiteBaseUrl();
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.headline,
    description: input.description,
    mainEntityOfPage: `${baseUrl}${input.path}`,
    image: input.image ? [`${baseUrl}${input.image}`] : undefined,
    author: { "@type": "Organization", name: brand.companyName },
    publisher: {
      "@type": "Organization",
      name: brand.companyName,
      logo: { "@type": "ImageObject", url: `${baseUrl}${brand.logoPath}` },
    },
    dateModified: input.dateModified,
  };
}

export function serviceJsonLd(input: {
  name: string;
  description: string;
  path: string;
  areaServed?: string;
  priceCurrency?: string;
  /** Free-form offer description (e.g. "$2.00 per finished processed pound"). */
  priceDescription?: string;
}): object {
  const baseUrl = getSiteBaseUrl();
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: input.name,
    description: input.description,
    url: `${baseUrl}${input.path}`,
    provider: {
      "@type": "LocalBusiness",
      name: brand.companyName,
      url: baseUrl,
      address: {
        "@type": "PostalAddress",
        addressLocality: brand.address.city,
        addressRegion: brand.address.state,
        addressCountry: brand.country,
      },
    },
    areaServed: input.areaServed ?? brand.address.city,
    offers: {
      "@type": "Offer",
      priceCurrency: input.priceCurrency ?? brand.currency,
      description: input.priceDescription,
      url: `${baseUrl}${input.path}`,
    },
  };
}
