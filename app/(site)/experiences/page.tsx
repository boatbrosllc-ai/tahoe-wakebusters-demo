import { brand } from "@/content/brand";
import type { Metadata } from "next";
import Image from "next/image";
import { BundleChooser } from "@/components/site/BundleChooser";
import { SeoHubLinks } from "@/components/site/SeoHubLinks";
import { getActiveExperiencesForPublic } from "@/lib/booking/get-experiences-public";
import { getSiteBaseUrl, siteConfig } from "@/config/site";

const baseUrl = getSiteBaseUrl();
const canonical = `${baseUrl}/experiences`;

/** Dynamic so CSP nonces from middleware match inline scripts (GA / Next). */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trips",
  description: `Choose ${siteConfig.catalog.halfDay.title}, ${siteConfig.catalog.fullDay.title}, or ${siteConfig.catalog.allIn.title}. Same private boat. Captain & crew included. Book online.`,
  keywords: [
    ...siteConfig.seo.keywords,
    siteConfig.catalog.halfDay.title,
    siteConfig.catalog.fullDay.title,
  ],
  alternates: { canonical },
  openGraph: {
    title: `Trips | ${brand.companyName}`,
    description: `Private captained trips — ${siteConfig.catalog.halfDay.title}, ${siteConfig.catalog.fullDay.title}, or all-in. Book online.`,
    url: canonical,
  },
};

export default async function ExperiencesPage() {
  let initialListings: Awaited<ReturnType<typeof getActiveExperiencesForPublic>> = [];
  try {
    initialListings = await getActiveExperiencesForPublic();
  } catch {
    // BundleChooser falls back to static package imagery
  }

  return (
    <>
      <section className="relative h-[42vh] min-h-[280px] max-h-[420px] overflow-hidden bg-brand-dark">
        <Image
          src={siteConfig.media.hero}
          alt=""
          fill
          className="object-cover object-[center_40%]"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 from-25% via-black/35 to-black/20" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 sm:px-6 lg:px-8">
          <div className="w-full max-w-4xl mx-auto text-center">
            <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold text-white tracking-tight leading-tight">
              Private trips
            </h1>
            <p className="mt-3 sm:mt-4 text-lg text-white/90 max-w-xl mx-auto">
              Same private boat. Pick {siteConfig.catalog.halfDay.title}, {siteConfig.catalog.fullDay.title}, or {siteConfig.catalog.allIn.title} — then book your day.
            </p>
          </div>
        </div>
      </section>

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

      <SeoHubLinks variant="experiences" />
    </>
  );
}
