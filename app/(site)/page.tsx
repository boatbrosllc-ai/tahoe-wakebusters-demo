import type { Metadata } from "next";
import { headers } from "next/headers";
import { brand } from "@/content/brand";
import { WakeHomePage } from "@/components/site/home/WakeHomePage";
import { PrefetchCriticalRoutes } from "@/components/site/PrefetchCriticalRoutes";
import { getSiteBaseUrl, siteConfig } from "@/config/site";
import { buildHomepageJsonLd } from "@/lib/seo/homepage-jsonld";

const baseUrl = getSiteBaseUrl();
const canonical = baseUrl;

export const metadata: Metadata = {
  title: { absolute: siteConfig.seo.title },
  description: siteConfig.seo.description,
  keywords: [...siteConfig.seo.keywords, brand.companyName],
  alternates: { canonical },
  openGraph: {
    title: siteConfig.seo.title,
    description: siteConfig.seo.description,
    url: canonical,
    images: [
      {
        url: siteConfig.seo.defaultOgImage,
        width: 1200,
        height: 630,
        alt: siteConfig.seo.defaultOgImageAlt,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.seo.title,
    description: siteConfig.seo.description,
    images: [siteConfig.seo.defaultOgImage],
  },
};

export default async function HomePage() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const jsonLd = JSON.stringify(buildHomepageJsonLd());

  return (
    <>
      <script
        type="application/ld+json"
        nonce={nonce}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <PrefetchCriticalRoutes />
      <WakeHomePage />
    </>
  );
}
