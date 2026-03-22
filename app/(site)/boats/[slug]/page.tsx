import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import Image from "next/image";
import { ChevronRight, ChevronLeft, Calendar } from "lucide-react";
import { getBoatBySlug } from "@/lib/booking/get-boats-public";
import { getDisplayDescription } from "@/lib/booking/boat-display";
import { getDisplayImageUrl } from "@/lib/utils";
import { brand } from "@/content/brand";
import { FAQ, type FAQItem } from "@/components/experience/FAQ";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://boatbrosatx.com";

/** Base FAQs reused on every boat pillar for snippet potential. */
const BOAT_PILLAR_FAQ_BASE: FAQItem[] = [
  {
    question: "Is a captain included with this boat?",
    answer: "Yes. Every Boat Bros Lake Austin rental includes a licensed captain. You don't need a boating license—just show up and enjoy.",
  },
  {
    question: "How many guests can this boat fit?",
    answer: "Our Boats typically fit up to 14 guests. Check the experience page when you book for your chosen trip.",
  },
  {
    question: "Is alcohol allowed?",
    answer: "Yes. You may bring alcohol for adults of legal drinking age. We ask that everyone drink responsibly and follow the captain's instructions for safety.",
  },
  {
    question: "What if the weather changes?",
    answer: "We monitor weather closely. If conditions are unsafe, we'll work with you to reschedule or refund per our cancellation policy.",
  },
];

/** Extra FAQ items by boat type for SEO (long-tail keywords). */
function getSeoFaqForBoat(boatType: string | undefined): FAQItem[] {
  const t = boatType?.trim().toLowerCase() ?? "";
  if (t === "pontoon" || t === "tritoon") {
    return [
      {
        question: "Do I need a boating license for a Lake Austin pontoon rental?",
        answer: "No. Every Boat Bros Lake Austin pontoon rental and pontoon boat rental Austin trip includes a licensed captain. You don't need a boating license—the captain handles navigation and docking. Just show up and enjoy your pontoon rental Lake Austin experience.",
      },
      {
        question: "How much does a pontoon boat rental cost on Lake Austin?",
        answer: "Pontoon boat rental Lake Austin pricing depends on trip length and experience (e.g. half-day charter, sunset cruise). Our Lake Austin pontoon rentals include the captain and fuel. Check availability and see prices when you select your date and duration on the experience page.",
      },
      {
        question: "Where can I rent a pontoon boat in Austin?",
        answer: "Boat Bros offers pontoon boat rental Austin and Lake Austin pontoon rentals with captain included. We operate on Lake Austin—easy access from Austin, TX. Book online for pontoon rentals Lake Austin, tritoon charters, and sunset cruises.",
      },
    ];
  }
  if (t === "wake") {
    return [
      {
        question: "Do I need experience to book a Lake Austin wake boat rental?",
        answer: "No. Our Lake Austin wake boat rental trips include an experienced driver and captain. Whether you're new to wakeboarding or wakesurfing or you've done it before, we'll get you on the water. Wake surf Lake Austin and wakeboard sessions are open to all skill levels.",
      },
      {
        question: "What's included in a Lake Austin wake boat rental?",
        answer: "Our Lake Austin wake boat rentals include the boat, a licensed captain, life jackets, and typically wakeboards, surf board, and tubes. Fuel is included. Book a wake boat rental Austin style with Boat Bros for a full-service experience.",
      },
    ];
  }
  return [];
}

function boatTypeLabel(boatType: string | undefined): string {
  if (!boatType || !boatType.trim()) return "Boat";
  const t = boatType.trim().toLowerCase();
  if (t === "pontoon") return "Pontoon";
  if (t === "wake") return "Wake";
  if (t === "tritoon") return "Tritoon";
  return boatType.trim().charAt(0).toUpperCase() + boatType.trim().slice(1);
}

function boatTypeKeywords(boatType: string | undefined): string[] {
  const t = boatType?.trim().toLowerCase() ?? "";
  if (t === "pontoon" || t === "tritoon") {
    return [
      "Lake Austin pontoon rentals",
      "pontoon rental Lake Austin",
      "pontoon boat rental Lake Austin",
      "pontoon boat rental austin",
      "pontoon boat austin",
      "pontoon rental austin",
      "pontoon rental austin tx",
      "party barge rental austin",
      "austin texas pontoon rental",
      "lake austin pontoon",
      "Lake Austin boat rental",
    ];
  }
  if (t === "wake") {
    return [
      "Lake Austin wake boat rental",
      "wake surf Lake Austin",
      "Lake Austin wakeboard rental",
      "wake boat rental Austin",
      "Lake Austin tubing boat rental",
    ];
  }
  return ["Lake Austin boat rentals", "boat rental Lake Austin"];
}

/** SEO-rich paragraphs by boat type for organic search (pontoon/tritoon vs wake). */
function getSeoParagraphsForBoat(boatType: string | undefined, boatName: string): string[] {
  const t = boatType?.trim().toLowerCase() ?? "";
  if (t === "pontoon" || t === "tritoon") {
    return [
      `A pontoon boat rental on Lake Austin is one of the best ways to spend a day on the water in Austin, TX. ${boatName} gives you space for up to 14 guests, with a captain included so no one needs a boating license. Whether you're looking for a pontoon rental Lake Austin for a bachelorette party, family day, or a chill cruise, our tritoon and pontoon boats deliver comfort, Bluetooth audio, cooler space, and a lily pad for swimming.`,
      `Rent a pontoon boat on Lake Austin with Boat Bros and you get a captained experience from dock to cove. Pontoon boat rental Austin and Lake Austin pontoon options are popular for good reason: stable ride, room to move, and easy access from central Austin. We include fuel and a licensed captain with every Lake Austin boat rental so the price you see is what you pay. Book ${boatName} for a Lake Austin pontoon charter, sunset cruise, or holiday tour.`,
      `Looking for pontoon boat rentals in Austin TX or a party barge rental Austin style? ${boatName} is part of our Lake Austin fleet—captain included, no license required. Perfect for groups who want a pontoon boat Austin Texas day on the water without the hassle. Check availability and reserve your Lake Austin pontoon rental online.`,
    ];
  }
  if (t === "wake") {
    return [
      `Lake Austin wake boat rental is ideal for wakeboarding, wakesurfing, and tubing. ${boatName} is a purpose-built wake boat with a licensed captain—no boating license needed. Book a wake boat rental Austin experience for thrill-seekers and families who want action on the water.`,
      `Our Lake Austin wake boat rentals include expert drivers who know the best water for your chosen activity. Wake surf Lake Austin and wakeboard sessions are popular; we provide the boat, the captain, and the gear. Reserve ${boatName} for your next Lake Austin wakeboard or tubing rental.`,
    ];
  }
  return [
    `Lake Austin boat rentals with Boat Bros include a licensed captain and a range of boats for every kind of trip. ${boatName} is available for captained charters—no boating license required. Book your Lake Austin boat rental online and we'll take care of the rest.`,
  ];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const boat = await getBoatBySlug(slug);
  if (!boat) return { title: "Boat" };

  const typeLabel = boatTypeLabel(boat.boatType);
  const title = `${boat.name} | Lake Austin ${typeLabel} Rental | Boat Bros`;
  const t = boat.boatType?.trim().toLowerCase() ?? "";
  const description =
    t === "wake"
      ? `Book ${boat.name} for your Lake Austin trip. Captain-included wake boat rental—no license required. Wake surf & wakeboard Lake Austin. Reserve your Lake Austin boat rental today.`
      : t === "pontoon" || t === "tritoon"
        ? `Book ${boat.name} for your Lake Austin trip. Captain-included ${typeLabel.toLowerCase()} rental—no license required. Pontoon rental Lake Austin & Austin TX. Reserve your Lake Austin boat rental today.`
        : `Book ${boat.name} for your Lake Austin trip. Captain-included ${typeLabel.toLowerCase()} rental—no license required. Reserve your Lake Austin boat rental today.`;
  const canonical = `${baseUrl}/boats/${boat.slug}`;
  const keywords = [...boatTypeKeywords(boat.boatType), `${boat.name} Lake Austin rental`];

  return {
    title,
    description,
    keywords,
    alternates: { canonical },
    openGraph: {
      title: `${boat.name} | Lake Austin ${typeLabel} Rental | Boat Bros`,
      description,
      url: canonical,
      siteName: brand.companyName,
      ...(boat.photos[0] && { images: [{ url: getDisplayImageUrl(boat.photos[0]) }] }),
    },
  };
}

function BreadcrumbJsonLd({ boatName, slug, nonce }: { boatName: string; slug: string; nonce?: string }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: baseUrl },
      { "@type": "ListItem", position: 2, name: "Our Boats", item: `${baseUrl}/boats` },
      { "@type": "ListItem", position: 3, name: boatName, item: `${baseUrl}/boats/${encodeURIComponent(slug)}` },
    ],
  };
  return (
    <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
  );
}

function ServiceJsonLd({
  boatName,
  boatType,
  description,
  imageUrl,
  nonce,
}: {
  boatName: string;
  boatType: string | undefined;
  description: string;
  imageUrl: string | undefined;
  nonce?: string;
}) {
  const typeLabel = boatTypeLabel(boatType);
  const service = {
    "@context": "https://schema.org",
    "@type": "Service",
    serviceType: `${typeLabel} Boat Rental`,
    name: boatName,
    description,
    image: imageUrl ? getDisplayImageUrl(imageUrl) : undefined,
    provider: { "@type": "LocalBusiness", name: brand.companyName },
    areaServed: { "@type": "Place", name: "Austin, TX" },
  };
  return (
    <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(service) }} />
  );
}

export default async function BoatPillarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const boat = await getBoatBySlug(slug);
  if (!boat) notFound();

  const nonce = (await headers()).get("x-nonce") ?? undefined;

  const typeLabel = boatTypeLabel(boat.boatType);

  const bodyDescription = getDisplayDescription(boat);

  const serviceDescription =
    boat.experiences.length > 0
      ? `${getDisplayDescription(boat).split(/\n\n+/)[0].trim()} Available for ${boat.experiences.map((e) => e.title).join(", ")}. Captain included.`
      : getDisplayDescription(boat).split(/\n\n+/)[0].trim();

  return (
    <>
      <BreadcrumbJsonLd boatName={boat.name} slug={boat.slug} nonce={nonce} />
      <ServiceJsonLd
        boatName={boat.name}
        boatType={boat.boatType}
        description={serviceDescription}
        imageUrl={boat.photos[0]}
        nonce={nonce}
      />

      <main id="main-content" className="min-h-screen bg-white pb-24 lg:pb-0 overflow-x-hidden">
        {/* Hero */}
        <section
          className="relative overflow-hidden bg-brand-dark px-5 sm:px-6 lg:px-8 py-10 sm:py-14 lg:py-16"
          aria-labelledby="boat-hero-heading"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/15 via-transparent to-brand-secondary/5" />
          <div className="container-narrow relative z-10 mx-auto">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-white/70">
              <Link href="/" className="hover:text-white transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary">
                Home
              </Link>
              <ChevronRight className="h-4 w-4 shrink-0 text-white/50" aria-hidden />
              <Link href="/boats" className="hover:text-white transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary">
                Our Boats
              </Link>
              <ChevronRight className="h-4 w-4 shrink-0 text-white/50" aria-hidden />
              <span className="text-white truncate max-w-[180px] sm:max-w-none" aria-current="page">
                {boat.name}
              </span>
            </nav>
            <div className="mt-6 sm:mt-8 text-center">
              <h1 id="boat-hero-heading" className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">
                {boat.name}
              </h1>
              <p className="mt-2 text-white/85 text-base sm:text-lg max-w-xl mx-auto">
                {boat.heroSubtitle?.trim() || `Lake Austin ${typeLabel.toLowerCase()} rental · Captain included · No license required`}
              </p>
              {boat.experiences.length > 0 && (
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                  {boat.experiences.map((exp) => (
                    <div key={exp.id} className="flex flex-wrap items-center justify-center gap-2">
                      <Link
                        href={`/booking?experience=${encodeURIComponent(exp.slug)}`}
                        className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-5 py-2.5 text-sm font-semibold text-brand-dark hover:bg-brand-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
                      >
                        <Calendar className="h-4 w-4" aria-hidden />
                        Book now
                      </Link>
                      <Link
                        href={`/experiences/${exp.slug}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/30 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
                      >
                        Details
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Gallery */}
        {boat.photos.length > 0 && (
          <section className="section-padding bg-white" aria-label="Gallery">
            <div className="container-wide px-4 sm:px-6 lg:px-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary mb-4">Gallery</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {boat.photos.slice(0, 6).map((url, i) => (
                  <div key={i} className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-brand-bg shadow-sm ring-1 ring-black/5">
                    <Image
                      src={getDisplayImageUrl(url)}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Description */}
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

        {/* SEO content – Lake Austin rental keywords by boat type */}
        {(() => {
          const seoParagraphs = getSeoParagraphsForBoat(boat.boatType, boat.name);
          if (seoParagraphs.length === 0) return null;
          return (
            <section className="section-padding bg-white" aria-labelledby="lake-austin-rental-heading">
              <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8">
                <h2 id="lake-austin-rental-heading" className="font-display text-xl font-bold text-brand-dark sm:text-2xl">
                  Lake Austin {typeLabel} rental – what you get
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
          );
        })()}

        {/* Available for */}
        {boat.experiences.length > 0 && (
          <section className="section-padding bg-white" aria-labelledby="available-for-heading">
            <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary mb-2">Book this boat for</p>
              <h2 id="available-for-heading" className="font-display text-xl font-bold text-brand-dark sm:text-2xl">
                Available experiences
              </h2>
              <p className="mt-2 text-brand-muted text-sm sm:text-base">
                All include a licensed captain. Choose an experience to see times and pricing.
              </p>
              <ul className="mt-5 space-y-2">
                {boat.experiences.map((exp) => (
                  <li key={exp.id}>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border border-brand-dark/10 bg-brand-bg/50 px-4 py-3.5">
                      <Link
                        href={`/experiences/${exp.slug}`}
                        className="group flex items-center justify-between gap-3 flex-1 min-w-0 text-brand-dark hover:text-brand-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded-lg"
                      >
                        <span className="font-medium">{exp.title}</span>
                        <ChevronRight className="h-5 w-5 shrink-0 text-brand-muted group-hover:text-brand-primary group-hover:translate-x-0.5 transition-all" aria-hidden />
                      </Link>
                      <Link
                        href={`/booking?experience=${encodeURIComponent(exp.slug)}`}
                        className="inline-flex items-center justify-center shrink-0 rounded-full min-h-[40px] px-4 text-sm font-semibold bg-brand-primary text-brand-dark hover:bg-brand-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                      >
                        Book now
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-4">
                <Link href="/experiences" className="inline-flex items-center gap-1 text-sm font-medium text-brand-primary hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary">
                  View all experiences <ChevronRight className="h-4 w-4" aria-hidden />
                </Link>
              </p>
            </div>
          </section>
        )}

        {/* FAQ */}
        <section aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="sr-only">
            Frequently asked questions about {boat.name} and Lake Austin boat rentals
          </h2>
          <FAQ items={[...BOAT_PILLAR_FAQ_BASE, ...getSeoFaqForBoat(boat.boatType)]} />
        </section>

        {/* CTA */}
        <section className="bg-brand-dark py-10 sm:py-14">
          <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8 text-center">
            <h2 className="font-display text-xl font-bold text-white sm:text-2xl">
              Ready to book?
            </h2>
            <p className="mt-1.5 text-white/80 text-sm sm:text-base">
              Captain included · Choose your experience and check availability
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {boat.experiences.length > 0 ? (
                boat.experiences.map((exp) => (
                  <div key={exp.id} className="flex flex-wrap items-center justify-center gap-2">
                    <Link
                      href={`/booking?experience=${encodeURIComponent(exp.slug)}`}
                      className="inline-flex items-center gap-2 rounded-full bg-brand-primary px-6 py-3 text-sm font-semibold text-brand-dark hover:bg-brand-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
                    >
                      <Calendar className="h-4 w-4" aria-hidden />
                      Book now
                    </Link>
                    <Link
                      href={`/experiences/${exp.slug}`}
                      className="inline-flex items-center gap-2 rounded-full border border-white/30 px-5 py-3 text-sm font-medium text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
                    >
                      {exp.title}
                    </Link>
                  </div>
                ))
              ) : (
                <Link
                  href="/experiences"
                  className="inline-flex items-center gap-2 rounded-full bg-brand-primary px-6 py-3 text-sm font-semibold text-brand-dark hover:bg-brand-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
                >
                  View experiences & book
                </Link>
              )}
              <Link
                href="/boats"
                className="inline-flex items-center gap-2 rounded-full border border-white/30 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                All boats
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
