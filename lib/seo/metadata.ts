import type { Metadata } from "next";

const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://nastysportfishing.com").replace(/\/+$/, "");

export function siteBaseUrl(): string {
  return baseUrl;
}

export type SeoPageMetaInput = {
  /** Path starting with / (no trailing slash) */
  path: string;
  /** Title segment — layout template appends "| Nasty Sport Fishing" */
  title: string;
  description: string;
  ogImage?: string;
  ogImageAlt?: string;
  /** Use absolute title (no template suffix) when true */
  absoluteTitle?: boolean;
};

export function buildSeoMetadata(input: SeoPageMetaInput): Metadata {
  const canonical = `${baseUrl}${input.path}`;
  const image = input.ogImage ?? "/photos/stock/cabo/el-arco-sunset-jarvis.jpg";
  const alt = input.ogImageAlt ?? "Cabo San Lucas sport fishing — Nasty Sport Fishing";
  const title = input.absoluteTitle
    ? { absolute: input.title }
    : input.title;

  return {
    title,
    description: input.description,
    alternates: { canonical },
    openGraph: {
      title: input.absoluteTitle ? input.title : `${input.title} | Nasty Sport Fishing`,
      description: input.description,
      url: canonical,
      type: "website",
      images: [{ url: image, width: 1200, height: 630, alt }],
    },
    twitter: {
      card: "summary_large_image",
      title: input.absoluteTitle ? input.title : `${input.title} | Nasty Sport Fishing`,
      description: input.description,
      images: [image],
    },
    robots: { index: true, follow: true },
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]): object {
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
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.headline,
    description: input.description,
    mainEntityOfPage: `${baseUrl}${input.path}`,
    image: input.image ? [`${baseUrl}${input.image}`] : undefined,
    author: { "@type": "Organization", name: "Nasty Sport Fishing" },
    publisher: {
      "@type": "Organization",
      name: "Nasty Sport Fishing",
      logo: { "@type": "ImageObject", url: `${baseUrl}/logos/NSF_Logo.png` },
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
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: input.name,
    description: input.description,
    url: `${baseUrl}${input.path}`,
    provider: {
      "@type": "LocalBusiness",
      name: "Nasty Sport Fishing",
      url: baseUrl,
      address: {
        "@type": "PostalAddress",
        addressLocality: "Cabo San Lucas",
        addressRegion: "Baja California Sur",
        addressCountry: "MX",
      },
    },
    areaServed: input.areaServed ?? "Cabo San Lucas",
    offers: {
      "@type": "Offer",
      priceCurrency: input.priceCurrency ?? "USD",
      description: input.priceDescription,
      url: `${baseUrl}${input.path}`,
    },
  };
}
