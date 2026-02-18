import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/content/brand";
import { location } from "@/content/location";
import { PontoonBookingEmbed } from "@/components/experience/PontoonBookingEmbed";
import { FAQ, type FAQItem } from "@/components/experience/FAQ";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://boatbrosatx.com";
const canonical = `${baseUrl}/lake-austin-pontoon-rentals`;

export const metadata: Metadata = {
  title: "Lake Austin Pontoon Rentals | Captain Included | Boat Bros ATX",
  description:
    "Book captained Lake Austin pontoon rentals with Boat Bros ATX. 5-star rated, premium boats, captain included. Reserve your Lake Austin boat rental today.",
  keywords: [
    "Lake Austin pontoon rentals",
    "pontoon boat rental Austin",
    "party boat rental Lake Austin",
    "captained pontoon rental Austin",
    "Lake Austin boat rental",
    "pontoon rentals Austin TX",
  ],
  alternates: { canonical },
  openGraph: {
    title: "Lake Austin Pontoon Rentals | Captain Included | Boat Bros ATX",
    description:
      "Book captained Lake Austin pontoon rentals. 5-star rated, premium boats, captain included. Reserve your Lake Austin boat rental today.",
    url: canonical,
    siteName: brand.companyName,
  },
};

const PONTOON_FAQ: FAQItem[] = [
  {
    question: "Do I need a boating license to rent a pontoon on Lake Austin?",
    answer: "No. Every Boat Bros rental includes a licensed captain. You don't need a boating license—just show up and enjoy the day on Lake Austin.",
  },
  {
    question: "Is a captain included?",
    answer: "Yes. All our Lake Austin pontoon rentals include a licensed captain. No extra fee, no hassle.",
  },
  {
    question: "How many guests fit?",
    answer: "Our pontoons typically fit 10–12 guests depending on the boat. Check the experience page or contact us for your group size.",
  },
  {
    question: "Is alcohol allowed?",
    answer: "Yes. You may bring alcohol for adults of legal drinking age. We ask that everyone drink responsibly and that the captain's instructions are followed for safety.",
  },
  {
    question: "What happens if weather changes?",
    answer: "We monitor weather closely. If conditions are unsafe, we'll work with you to reschedule or refund per our cancellation policy. We'll contact you as soon as we know.",
  },
  {
    question: "Where is pickup located?",
    answer: "We operate on Lake Austin near Austin, TX. Exact meet-up location and parking details are sent with your booking confirmation.",
  },
  {
    question: "How far in advance should I book?",
    answer: "We recommend booking at least a few days ahead for weekends and holidays. You can check real-time availability on our calendar and book same-day when slots are open.",
  },
  {
    question: "Can we swim and play music?",
    answer: "Yes. Swimming off the boat and using our premium Bluetooth sound system are included. We also provide a lily pad for floating and fun on the water.",
  },
];

function LocalBusinessAndServiceJsonLd() {
  const localBusiness = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: brand.companyName,
    image: `${baseUrl}/logos/BB_Horizontal_Logo_DarkTeal_NoBkg.png`,
    url: baseUrl,
    telephone: brand.phoneTel,
    address: {
      "@type": "PostalAddress",
      streetAddress: brand.address.line1,
      addressLocality: brand.address.city,
      addressRegion: brand.address.state,
      postalCode: brand.address.zip,
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: location.rating,
      reviewCount: location.reviewCount,
      bestRating: 5,
      worstRating: 1,
    },
  };
  const service = {
    "@context": "https://schema.org",
    "@type": "Service",
    serviceType: "Pontoon Boat Rental",
    name: "Lake Austin Pontoon Rentals",
    description: "Captained pontoon boat rentals on Lake Austin, Austin TX. Captain included, premium boats, 5-star rated.",
    provider: { "@type": "LocalBusiness", name: brand.companyName },
    areaServed: { "@type": "Place", name: "Austin, TX" },
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusiness) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(service) }} />
    </>
  );
}

function BreadcrumbJsonLd() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: baseUrl },
      { "@type": "ListItem", position: 2, name: "Lake Austin Pontoon Rentals", item: canonical },
    ],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />;
}

export default function LakeAustinPontoonRentalsPage() {
  return (
    <>
      <LocalBusinessAndServiceJsonLd />
      <BreadcrumbJsonLd />

      <main id="main-content" className="min-h-screen bg-white pb-24 lg:pb-0 overflow-x-hidden">
        {/* Hero */}
        <section
          className="relative overflow-hidden bg-brand-dark px-5 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20"
          aria-labelledby="pontoon-hero-heading"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/20 via-transparent to-brand-secondary/10" />
          <div className="container-narrow relative z-10 mx-auto text-center">
            <nav aria-label="Breadcrumb" className="text-left">
              <ol className="flex flex-wrap items-center gap-1 text-sm text-white/80">
                <li>
                  <Link href="/" className="hover:text-white focus-visible:underline rounded">
                    Home
                  </Link>
                </li>
                <li aria-hidden>/</li>
                <li className="text-white" aria-current="page">
                  Lake Austin Pontoon Rentals
                </li>
              </ol>
            </nav>
            <h1 id="pontoon-hero-heading" className="mt-6 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Lake Austin Pontoon Rentals
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-white/90 sm:text-xl">
              Captained pontoon rentals on Lake Austin, Austin TX. 5.0 rating, 273+ Google reviews. Premium boats, licensed captain included—no boating license required. Book your party boat rental today.
            </p>
            <a
              href="#pontoon-booking"
              className="mt-8 inline-block rounded-xl bg-brand-primary px-8 py-4 text-base font-semibold text-brand-dark hover:bg-brand-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
            >
              Check availability & book
            </a>
          </div>
        </section>

        {/* Proof: rating + reviews */}
        <section className="bg-brand-bg/50 py-6 sm:py-8" aria-label="Customer rating">
          <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8 text-center">
            <p className="text-2xl sm:text-3xl font-bold text-brand-dark">
              {location.rating} <span className="text-amber-500" aria-hidden>★★★★★</span>
            </p>
            <p className="mt-1 text-brand-muted">{location.reviewCount}+ Google reviews</p>
          </div>
        </section>

        {/* Intro paragraph */}
        <section className="section-padding bg-white" aria-labelledby="intro-heading">
          <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8">
            <h2 id="intro-heading" className="sr-only">
              About captained pontoon rentals on Lake Austin
            </h2>
            <p className="text-lg text-brand-dark leading-relaxed">
              Our Lake Austin pontoon rentals are fully captained—you never need a boating license. Relax with your group on a premium pontoon while a licensed captain handles the boat. We're based in Austin, TX and run trips on Lake Austin year-round. Book online and get instant confirmation.
            </p>
          </div>
        </section>

        {/* Why Boat Bros Is Different on Lake Austin */}
        <section className="section-padding bg-brand-bg" aria-labelledby="why-different-heading">
          <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8">
            <h2 id="why-different-heading" className="text-2xl font-bold text-brand-dark sm:text-3xl">
              Why Boat Bros Is Different on Lake Austin
            </h2>
            <ul className="mt-6 space-y-3 text-brand-dark">
              <li className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-primary shrink-0 mt-2" aria-hidden />
                Licensed captains included on every trip
              </li>
              <li className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-primary shrink-0 mt-2" aria-hidden />
                Premium, well-maintained boats
              </li>
              <li className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-primary shrink-0 mt-2" aria-hidden />
                273+ 5-star reviews on Google
              </li>
              <li className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-primary shrink-0 mt-2" aria-hidden />
                Transparent pricing—no hidden fees
              </li>
              <li className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-primary shrink-0 mt-2" aria-hidden />
                Local Austin-based company
              </li>
              <li className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-primary shrink-0 mt-2" aria-hidden />
                Trusted by bachelor parties, families, and corporate groups
              </li>
            </ul>
          </div>
        </section>

        {/* What's Included */}
        <section className="section-padding bg-white" aria-labelledby="included-heading">
          <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8">
            <h2 id="included-heading" className="text-2xl font-bold text-brand-dark sm:text-3xl">
              What&apos;s Included in Your Pontoon Rental
            </h2>
            <ul className="mt-6 space-y-3 text-brand-dark">
              <li className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-primary shrink-0 mt-2" aria-hidden />
                Licensed captain
              </li>
              <li className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-primary shrink-0 mt-2" aria-hidden />
                Fuel included
              </li>
              <li className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-primary shrink-0 mt-2" aria-hidden />
                Cooler, ice, and bottled water
              </li>
              <li className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-primary shrink-0 mt-2" aria-hidden />
                Lily pad for swimming and floating
              </li>
              <li className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-primary shrink-0 mt-2" aria-hidden />
                Premium Bluetooth sound system
              </li>
              <li className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-primary shrink-0 mt-2" aria-hidden />
                Life jackets and safety equipment
              </li>
            </ul>
          </div>
        </section>

        {/* Why Lake Austin Is Ideal */}
        <section className="section-padding bg-brand-bg" aria-labelledby="why-lake-austin-heading">
          <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8">
            <h2 id="why-lake-austin-heading" className="text-2xl font-bold text-brand-dark sm:text-3xl">
              Why Lake Austin Is Ideal for Pontoon Rentals
            </h2>
            <p className="mt-4 text-brand-dark leading-relaxed">
              Lake Austin offers calm water, scenic views, and easy access to popular spots like Party Cove. It&apos;s ideal for swimming, floating on the lily pad, and cruising with music—and it&apos;s close to downtown Austin, TX, so you can get on the water without a long drive.
            </p>
          </div>
        </section>

        {/* Pontoon vs Wake Boat */}
        <section className="section-padding bg-white" aria-labelledby="pontoon-vs-wake-heading">
          <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8">
            <h2 id="pontoon-vs-wake-heading" className="text-2xl font-bold text-brand-dark sm:text-3xl">
              Pontoon vs Wake Boat
            </h2>
            <p className="mt-4 text-brand-dark leading-relaxed">
              A pontoon is the best choice for larger groups, relaxation, swimming, and parties. You get plenty of space to spread out, a stable platform for the lily pad, and a chill vibe. For wakeboarding, wakesurfing, or a more sporty day, check out our{" "}
              <Link href="/experiences/watersports" className="text-brand-primary font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded">
                wake boat rentals
              </Link>
              .
            </p>
          </div>
        </section>

        {/* How Booking Works */}
        <section className="section-padding bg-brand-bg" aria-labelledby="how-booking-works-heading">
          <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8">
            <h2 id="how-booking-works-heading" className="text-2xl font-bold text-brand-dark sm:text-3xl">
              How Booking Works
            </h2>
            <ol className="mt-6 space-y-4 list-none">
              <li className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-primary text-sm font-bold text-white" aria-hidden>1</span>
                <div><strong className="text-brand-dark">Choose duration</strong> — 2, 4, 6, or 8 hours.</div>
              </li>
              <li className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-primary text-sm font-bold text-white" aria-hidden>2</span>
                <div><strong className="text-brand-dark">Select date and time</strong> — See real-time availability and pick your slot.</div>
              </li>
              <li className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-primary text-sm font-bold text-white" aria-hidden>3</span>
                <div><strong className="text-brand-dark">Confirm and book</strong> — Pay securely and get instant confirmation.</div>
              </li>
              <li className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-primary text-sm font-bold text-white" aria-hidden>4</span>
                <div><strong className="text-brand-dark">Meet captain and enjoy Lake Austin</strong> — We&apos;ll send meet-up details. Your captain handles the rest.</div>
              </li>
            </ol>
          </div>
        </section>

        {/* FAQ */}
        <section className="bg-white" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="sr-only">
            Frequently asked questions about Lake Austin pontoon rentals
          </h2>
          <FAQ items={PONTOON_FAQ} />
        </section>

        {/* Booking embed — same component as /experiences/lake-austin-pontoon */}
        <section className="bg-brand-dark pt-8 pb-12 sm:pb-16">
          <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8 text-center">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">
              Book your Lake Austin pontoon rental
            </h2>
            <p className="mt-2 text-white/90">
              Choose your date and time below. Captain included.
            </p>
          </div>
          <PontoonBookingEmbed />
        </section>
      </main>
    </>
  );
}
