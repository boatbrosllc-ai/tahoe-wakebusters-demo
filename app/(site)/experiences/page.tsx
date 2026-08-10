import type { Metadata } from "next";
import Image from "next/image";
import { BundleChooser } from "@/components/site/BundleChooser";
import { SeoHubLinks } from "@/components/site/SeoHubLinks";
import { getActiveExperiencesForPublic } from "@/lib/booking/get-experiences-public";

const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://nastysportfishing.com").replace(/\/+$/, "");
const canonical = `${baseUrl}/experiences`;

/** Dynamic so CSP nonces from middleware match inline scripts (GA / Next). */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cabo Fishing Charters | Nasty, Nastier & Nastiest",
  description:
    "Choose Nasty (Half Day), Nastier (Full Day), or Nastiest (Full Day all-in). Same private Cabo boat. Captain & crew included. Book online.",
  keywords: [
    "Cabo fishing charters",
    "Cabo San Lucas sport fishing",
    "Nasty Half Day",
    "Nasty Full Day",
    "Nastier",
    "Nastiest",
    "half-day fishing Cabo",
    "full-day fishing Cabo",
  ],
  alternates: { canonical },
  openGraph: {
    title: "Cabo Fishing Charters | Nasty Sport Fishing",
    description:
      "Nasty, Nastier, or Nastiest — private Cabo charters on the same boat. Captain & crew included. Book online.",
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
          src="/photos/stock/cabo/el-arco-day-salvador.jpg"
          alt=""
          fill
          className="object-cover object-[center_40%]"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 from-25% via-black/35 to-black/20" />
        <div className="absolute inset-0 flex flex-col justify-end pb-10 sm:pb-14">
          <div className="container-wide px-4 sm:px-6 lg:px-8 text-center sm:text-left">
            <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold text-white tracking-tight leading-tight">
              Cabo charters
            </h1>
            <p className="mt-3 sm:mt-4 text-lg text-white/90 max-w-xl mx-auto sm:mx-0">
              Same private boat. Pick Nasty, Nastier, or Nastiest — then book your day offshore.
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
