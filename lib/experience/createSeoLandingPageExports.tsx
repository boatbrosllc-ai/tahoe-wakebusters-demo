import type { Metadata } from "next";
import { brand } from "@/content/brand";
import { SeoLandingPage } from "@/components/experience/SeoLandingPage";
import { getSeoLandingPage, type SeoLandingPageId } from "@/lib/experience/seoLanding.data";
import { getSeoLandingMedia } from "@/lib/experience/seoLandingMedia";

const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://boatbrosatx.com").replace(/\/+$/, "");

export function createSeoLandingMetadata(pageId: SeoLandingPageId): Metadata {
  const config = getSeoLandingPage(pageId);
  const media = getSeoLandingMedia(pageId);
  const canonical = `${baseUrl}${config.path}`;
  const ogImage = media.ogImage.startsWith("http") ? media.ogImage : `${baseUrl}${media.ogImage}`;

  return {
    title: config.metaTitle,
    description: config.metaDescription,
    keywords: config.keywords,
    alternates: { canonical },
    robots: "index, follow",
    openGraph: {
      title: config.metaTitle,
      description: config.metaDescription,
      url: canonical,
      siteName: brand.companyName,
      images: [{ url: ogImage, width: 1200, height: 630, alt: media.heroAlt }],
    },
    twitter: {
      card: "summary_large_image",
      images: [ogImage],
    },
  };
}

export function createSeoLandingPageComponent(pageId: SeoLandingPageId) {
  return function SeoLandingRoutePage() {
    return <SeoLandingPage pageId={pageId} />;
  };
}
