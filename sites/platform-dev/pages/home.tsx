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

/**
 * Default Slipstack homepage. Unique customer homepages live in sibling
 * `sites/<id>/pages/` folders — do not fork booking logic here.
 */
export async function PlatformDevHomePage() {
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
