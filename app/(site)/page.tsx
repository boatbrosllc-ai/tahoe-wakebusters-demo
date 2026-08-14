import { brand } from "@/content/brand";
import type { Metadata } from "next";
import { getSitePages } from "@/lib/site/pages";
import { getSiteBaseUrl, siteConfig } from "@/config/site";

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
  const { HomePage: SiteHome } = getSitePages();
  return <SiteHome />;
}
