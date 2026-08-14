import { brand } from "@/content/brand";
import type { Metadata } from "next";
import { Hero } from "@/components/site/Hero";
import { HomeWelcome } from "@/components/site/HomeWelcome";
import { BundleChooser } from "@/components/site/BundleChooser";
import { InquiryPackagesTeaser } from "@/components/site/InquiryPackagesTeaser";
import { HomeOurBoats } from "@/components/site/HomeOurBoats";
import { HowItWorks } from "@/components/site/HowItWorks";
import { PaymentOptions } from "@/components/site/PaymentOptions";
import { Testimonials } from "@/components/site/Testimonials";
import { GalleryPreview } from "@/components/site/GalleryPreview";
import { LeadCapture } from "@/components/site/LeadCapture";
import { HomeLocation } from "@/components/site/HomeLocation";
import { PrefetchCriticalRoutes } from "@/components/site/PrefetchCriticalRoutes";
import { SeoHubLinks } from "@/components/site/SeoHubLinks";
import { getActiveExperiencesForPublic } from "@/lib/booking/get-experiences-public";
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
  let initialListings: Awaited<ReturnType<typeof getActiveExperiencesForPublic>> = [];
  try {
    initialListings = await getActiveExperiencesForPublic();
  } catch {
    // BundleChooser falls back to static experience content when empty
  }

  return (
    <>
      <PrefetchCriticalRoutes />
      <Hero />
      <HomeWelcome />
      <BundleChooser
        initialListings={initialListings.map((item) => ({
          slug: item.slug,
          title: item.title,
          subtitle: item.subtitle,
          heroMedia: item.heroMedia,
          gallery: item.gallery,
          fromPriceCents: item.fromPriceCents,
          pricingType: item.pricingType,
        }))}
      />
      <HomeOurBoats />
      <InquiryPackagesTeaser />
      <HowItWorks />
      <PaymentOptions />
      <Testimonials />
      <GalleryPreview />
      <HomeLocation />
      <SeoHubLinks variant="home" />
      <LeadCapture />
    </>
  );
}
