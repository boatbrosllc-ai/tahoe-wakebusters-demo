import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import { getBoatBySlug } from "@/lib/booking/get-boats-public";
import { getDisplayDescription } from "@/lib/booking/boat-display";
import { getDisplayImageUrl } from "@/lib/utils";
import { normalizeBoatPhotoForRender } from "@/lib/boats/validation";
import { brand } from "@/content/brand";
import { FAQ, type FAQItem } from "@/components/experience/FAQ";
import { BoatBookNowButton } from "@/components/site/BoatBookNowButton";
import { getSiteBaseUrl } from "@/config/site";

const baseUrl = getSiteBaseUrl();

const BOAT_PILLAR_FAQ_BASE: FAQItem[] = [
  {
    question: "Is a captain included with this boat?",
    answer:
      `Yes. Every ${brand.companyName} charter includes a licensed captain and crew. You show up ready to go — we handle the boat and the plan.`,
  },
  {
    question: "How many guests can this boat fit?",
    answer:
      "This boat charters up to 6 guests. Check the Half Day or Full Day experience page when you book for trip details and what’s included.",
  },
  {
    question: "What should we bring?",
    answer:
      "Sunscreen, sunglasses, a hat, and soft-soled shoes. We provide premium tackle, bait, licenses for listed anglers, water, soft drinks, snacks, and light breakfast on charter packages.",
  },
  {
    question: "What if the weather changes?",
    answer:
      "We monitor conditions closely. If it’s unsafe to fish, we’ll work with you to reschedule or refund per our cancellation policy.",
  },
];

function getSeoFaqForBoat(): FAQItem[] {
  return [
    {
      question: "Do I need a fishing license?",
      answer:
        `Licenses, if required for this location, are confirmed when you book with ${brand.companyName}. We’ll confirm guest count when you reserve.`,
    },
    {
      question: "Where do we meet for departure?",
      answer:
        "We operate from the local marina / dock. After booking, we’ll send the exact slip and meet-up instructions.",
    },
    {
      question: "Is this boat good for a full day on the water?",
      answer:
        "Yes. Half Day and Full Day trips include a licensed captain and mate. Confirm inclusions on the trip page when you book.",
    },
  ];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const requestedSlug = slug.trim().toLowerCase();
  const boat = await getBoatBySlug(requestedSlug);
  if (!boat) return { title: "Boat" };

  if (requestedSlug !== boat.slug) {
    return {};
  }

  const title = `${boat.name} | ${brand.companyName}`;
  const description = `Book the ${boat.name}. Captain and crew included. Reserve Half Day or Full Day online.`;
  const canonical = `${baseUrl}/boats/${boat.slug}`;
  const keywords = [
    "charter boat",
    `${brand.companyName} boat`,
    boat.name,
  ];

  return {
    title,
    description,
    keywords,
    alternates: { canonical },
    openGraph: {
      title: `${boat.name} | Boat Rentals | ${brand.companyName}`,
      description,
      url: canonical,
      siteName: brand.companyName,
      ...(boat.photos[0] && { images: [{ url: getDisplayImageUrl(normalizeBoatPhotoForRender(boat.photos[0])) }] }),
    },
  };
}

function BreadcrumbJsonLd({ boatName, slug, nonce }: { boatName: string; slug: string; nonce?: string }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: baseUrl },
      { "@type": "ListItem", position: 2, name: "Our Fleet", item: `${baseUrl}/boats` },
      { "@type": "ListItem", position: 3, name: boatName, item: `${baseUrl}/boats/${encodeURIComponent(slug)}` },
    ],
  };
  return (
    <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
  );
}

function ServiceJsonLd({
  boatName,
  description,
  imageUrl,
  nonce,
}: {
  boatName: string;
  description: string;
  imageUrl: string | undefined;
  nonce?: string;
}) {
  const service = {
    "@context": "https://schema.org",
    "@type": "Service",
    serviceType: "Boat Charter",
    name: boatName,
    description,
    image: imageUrl ? getDisplayImageUrl(imageUrl) : undefined,
    provider: { "@type": "LocalBusiness", name: brand.companyName },
    areaServed: { "@type": "Place", name: brand.address.city || "Local waterways" },
  };
  return (
    <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(service) }} />
  );
}

export default async function BoatPillarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const requestedSlug = slug.trim().toLowerCase();
  const boat = await getBoatBySlug(requestedSlug);
  if (!boat) notFound();

  if (requestedSlug !== boat.slug) {
    permanentRedirect(`/boats/${encodeURIComponent(boat.slug)}`);
  }

  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const bodyDescription = getDisplayDescription(boat);
  const serviceDescription =
    boat.experiences.length > 0
      ? `${getDisplayDescription(boat).split(/\n\n+/)[0].trim()} Available for ${boat.experiences.map((e) => e.title).join(", ")}. Captain and crew included.`
      : getDisplayDescription(boat).split(/\n\n+/)[0].trim();

  const seoParagraphs = [
    `A day on the water starts with the right boat. The ${boat.name} is ${brand.companyName}’s flagship private charter boat.`,
    `Every charter on ${boat.name} includes a licensed captain and mate. Show up at the dock ready to go. Half Day and Full Day packages cover the provisions listed on each experience.`,
    `Looking for a private boat rental? Book ${boat.name} online, pick your date, and we’ll confirm dock and meet-up details before departure.`,
  ];

  return (
    <>
      <BreadcrumbJsonLd boatName={boat.name} slug={boat.slug} nonce={nonce} />
      <ServiceJsonLd
        boatName={boat.name}
        description={serviceDescription}
        imageUrl={normalizeBoatPhotoForRender(boat.photos[0])}
        nonce={nonce}
      />

      <main id="main-content" className="min-h-screen bg-white pb-24 lg:pb-0 overflow-x-hidden">
        <section
          className="relative overflow-hidden bg-brand-dark px-5 sm:px-6 lg:px-8 py-10 sm:py-14 lg:py-16"
          aria-labelledby="boat-hero-heading"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/15 via-transparent to-brand-secondary/5" />
          <div className="container-narrow relative z-10 mx-auto flex flex-col items-center text-center">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center justify-center gap-1.5 text-sm text-white/70">
              <Link href="/" className="hover:text-white transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary">
                Home
              </Link>
              <ChevronRight className="h-4 w-4 shrink-0 text-white/50" aria-hidden />
              <span className="text-white truncate max-w-[180px] sm:max-w-none" aria-current="page">
                {boat.name}
              </span>
            </nav>
            <div className="mt-6 sm:mt-8 text-center w-full">
              <h1 id="boat-hero-heading" className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">
                {boat.name}
              </h1>
              <p className="mt-2 text-white/85 text-base sm:text-lg max-w-xl mx-auto">
                {boat.heroSubtitle?.trim() || "Private charter · Captain & crew included"}
              </p>
              {boat.experiences.length > 0 && (
                <div className="mt-6 flex justify-center">
                  <BoatBookNowButton className="rounded-full bg-brand-primary px-6 py-2.5 text-sm font-semibold text-brand-dark hover:bg-brand-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark" />
                </div>
              )}
            </div>
          </div>
        </section>

        {boat.photos.length > 0 && (
          <section className="section-padding bg-white" aria-label="Gallery">
            <div className="container-wide px-4 sm:px-6 lg:px-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary mb-4">Gallery</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {boat.photos.slice(0, 6).map((url, i) => (
                  <div key={i} className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-brand-bg shadow-sm ring-1 ring-black/5">
                    <Image
                      src={getDisplayImageUrl(normalizeBoatPhotoForRender(url))}
                      alt={i === 0 ? `${boat.name} sport fishing yacht` : `${boat.name} photo ${i + 1}`}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      priority={i === 0}
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="section-padding bg-brand-bg" aria-labelledby="about-boat-heading">
          <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary mb-2">About this boat</p>
            <h2 id="about-boat-heading" className="font-display text-xl font-bold text-brand-dark sm:text-2xl">
              {boat.name}
            </h2>
            <div className="mt-4 max-w-2xl text-brand-dark/90 space-y-4">
              {bodyDescription.split(/\n\n+/).map((p, i) => (
                <p key={i} className="text-base sm:text-lg leading-relaxed">
                  {p}
                </p>
              ))}
            </div>
          </div>
        </section>

        <section className="section-padding bg-white" aria-labelledby="charter-heading">
          <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8">
            <h2 id="charter-heading" className="font-display text-xl font-bold text-brand-dark sm:text-2xl">
              Private charter — what you get
            </h2>
            <div className="mt-4 max-w-2xl text-brand-dark/90 space-y-4">
              {seoParagraphs.map((p, i) => (
                <p key={i} className="text-base sm:text-lg leading-relaxed">
                  {p}
                </p>
              ))}
            </div>
          </div>
        </section>

        {boat.experiences.length > 0 && (
          <section className="section-padding bg-white" aria-labelledby="available-for-heading">
            <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary mb-2">Book this boat for</p>
              <h2 id="available-for-heading" className="font-display text-xl font-bold text-brand-dark sm:text-2xl">
                Available charters
              </h2>
              <p className="mt-2 text-brand-muted text-sm sm:text-base">
                All include a licensed captain and mate. Tap a trip for full details and pricing.
              </p>
              <ul className="mt-5 space-y-2">
                {boat.experiences.map((exp) => (
                  <li key={exp.id}>
                    <Link
                      href={`/experiences/${exp.slug}`}
                      className="group flex items-center justify-between gap-3 rounded-xl border border-brand-dark/10 bg-brand-bg/50 px-4 py-3.5 text-brand-dark hover:text-brand-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                    >
                      <span className="font-medium">{exp.title}</span>
                      <ChevronRight className="h-5 w-5 shrink-0 text-brand-muted group-hover:text-brand-primary group-hover:translate-x-0.5 transition-all" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-4">
                <Link href="/experiences" className="inline-flex items-center gap-1 text-sm font-medium text-brand-primary hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary">
                  View all charters <ChevronRight className="h-4 w-4" aria-hidden />
                </Link>
              </p>
            </div>
          </section>
        )}

        <section aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="sr-only">
            Frequently asked questions about {boat.name} and private charters
          </h2>
          <FAQ items={[...BOAT_PILLAR_FAQ_BASE, ...getSeoFaqForBoat()]} />
        </section>

        <section className="bg-brand-dark py-10 sm:py-14">
          <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8 text-center">
            <h2 className="font-display text-xl font-bold text-white sm:text-2xl">Ready to book?</h2>
            <p className="mt-1.5 text-white/80 text-sm sm:text-base">
              Captain & crew included · Choose Half Day or Full Day and check availability
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/experiences"
                className="inline-flex items-center gap-2 rounded-full border border-white/30 px-6 py-3 text-sm font-medium text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
              >
                All charters
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
