import type { Metadata } from "next";
import Link from "next/link";
import { location } from "@/content/location";
import { LOCATION_FAQ } from "@/content/location-faq";
import { LOCATION_TESTIMONIALS } from "@/content/location-testimonials";
import { brand } from "@/content/brand";
import { MapEmbed } from "@/components/site/MapEmbed";
import { FAQ, type FAQItem } from "@/components/experience/FAQ";
import { LocationPageCTA } from "@/components/site/LocationPageCTA";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://boatbrosatx.com";
const canonical = `${baseUrl}/lake-austin-boat-rental`;

export const metadata: Metadata = {
  title: "Lake Austin Boat Rentals (Captain Included) | Austin TX | Boat Bros",
  description:
    "Lake Austin boat rentals with captain included. Pontoon, wake surf, sunset cruise. 5019 N Capital of Texas Hwy, Austin TX. Book online. 5.0 rating, 273+ reviews.",
  keywords: [
    "Lake Austin boat rentals",
    "Austin boat rentals",
    "pontoon rental Lake Austin",
    "boat rental service Austin",
    "captain included boat rental Austin",
    "Lake Austin pontoon",
  ],
  alternates: { canonical },
  openGraph: {
    title: "Lake Austin Boat Rentals (Captain Included) | Boat Bros",
    description: "Captain-included boat rentals on Lake Austin. Pontoon, watersports, sunset cruise. Austin TX. Book online.",
    url: canonical,
    siteName: brand.companyName,
  },
};

function LocalBusinessJsonLd() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: location.legalName,
    image: `${baseUrl}/logos/BB_Horizontal_Logo_DarkTeal_NoBkg.png`,
    url: location.url,
    telephone: location.phoneTel,
    address: {
      "@type": "PostalAddress",
      streetAddress: location.address.line1,
      addressLocality: location.address.city,
      addressRegion: location.address.state,
      postalCode: location.address.zip,
    },
    geo: location.geo
      ? {
          "@type": "GeoCoordinates",
          latitude: location.geo.latitude,
          longitude: location.geo.longitude,
        }
      : undefined,
    areaServed: location.areaServed.map((name) => ({ "@type": "Place", name })),
    sameAs: location.sameAs,
    priceRange: "$$",
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />;
}

function BreadcrumbJsonLd() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: baseUrl },
      { "@type": "ListItem", position: 2, name: "Lake Austin Boat Rentals", item: canonical },
    ],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />;
}

export default function LakeAustinBoatRentalPage() {
  return (
    <>
      <LocalBusinessJsonLd />
      <BreadcrumbJsonLd />

      <main id="main-content" className="min-h-screen bg-white pb-24 lg:pb-0 overflow-x-hidden">
        {/* Hero */}
        <section
          className="relative overflow-hidden bg-brand-dark px-5 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20"
          aria-labelledby="location-hero-heading"
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
                  Lake Austin Boat Rentals
                </li>
              </ol>
            </nav>
            <h1 id="location-hero-heading" className="mt-6 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Lake Austin Boat Rentals (Captain Included)
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-white/90 sm:text-xl">
              Book a pontoon, wake surf, or sunset cruise on Lake Austin. All trips include a licensed captain—you show up and enjoy. Serving Austin, TX and the Lake Austin area.
            </p>
          </div>
        </section>

        {/* Proof: rating + count */}
        <section className="bg-brand-bg/50 py-8 sm:py-10" aria-label="Customer rating">
          <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8 text-center">
            <p className="text-2xl sm:text-3xl font-bold text-brand-dark">
              {location.rating} <span className="text-amber-500" aria-hidden>★★★★★</span>
            </p>
            <p className="mt-1 text-brand-muted">{location.reviewCount} Google reviews</p>
            <a
              href={location.googleMapsPlaceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block rounded-xl bg-white border-2 border-brand-primary px-6 py-3 text-sm font-semibold text-brand-primary hover:bg-brand-primary hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
            >
              Read all reviews on Google
            </a>
          </div>
        </section>

        {/* NAP + Map */}
        <section className="section-padding bg-white" aria-labelledby="location-contact-heading">
          <div className="container-wide mx-auto max-w-5xl px-5 sm:px-6 lg:px-8">
            <h2 id="location-contact-heading" className="text-2xl font-bold text-brand-dark sm:text-3xl">
              Location & contact
            </h2>
            <div className="mt-6 grid gap-6 sm:gap-8 lg:grid-cols-[1fr_1fr] lg:gap-12">
              <div className="min-w-0">
                <div className="rounded-2xl border border-brand-dark/10 bg-brand-bg/50 p-5 sm:p-8">
                  <p className="font-semibold text-brand-dark">{location.name}</p>
                  <p className="mt-2 text-brand-dark break-words">{location.addressFormatted}</p>
                  <p className="mt-2">
                    <a
                      href={`tel:${location.phoneTel}`}
                      className="inline-flex items-center min-h-[44px] font-medium text-brand-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 rounded"
                      aria-label={`Call ${location.phone}`}
                    >
                      {location.phone}
                    </a>
                  </p>
                  <p className="mt-2 text-sm text-brand-muted">{location.hoursNote}</p>
                  <div className="mt-6 flex flex-col sm:flex-row flex-wrap gap-3">
                    <a
                      href={location.googleMapsPlaceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center min-h-[48px] rounded-xl bg-brand-primary px-5 py-3 text-sm font-semibold text-white hover:bg-brand-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
                    >
                      Get Directions
                    </a>
                    <a
                      href={`tel:${location.phoneTel}`}
                      className="inline-flex items-center justify-center min-h-[48px] rounded-xl border-2 border-brand-dark/20 px-5 py-3 text-sm font-semibold text-brand-dark hover:border-brand-primary hover:text-brand-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
                    >
                      Call
                    </a>
                    <Link
                      href="/booking"
                      className="inline-flex items-center justify-center min-h-[48px] rounded-xl bg-brand-secondary px-5 py-3 text-sm font-semibold text-white hover:bg-brand-secondary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary focus-visible:ring-offset-2"
                    >
                      Book Now
                    </Link>
                  </div>
                </div>
              </div>
              <div className="min-w-0 min-h-[240px] sm:min-h-0">
                <MapEmbed
                  src={location.mapEmbedSrc}
                  title="Boat Bros location on Google Maps"
                  viewOnMapsUrl={location.googleMapsPlaceUrl}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Why Boat Bros */}
        <section className="section-padding bg-brand-bg" aria-labelledby="why-boat-bros-heading">
          <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8">
            <h2 id="why-boat-bros-heading" className="text-2xl font-bold text-brand-dark sm:text-3xl">
              Why Boat Bros
            </h2>
            <p className="mt-4 text-brand-dark/90 leading-relaxed">
              We run captain-included boat rentals on Lake Austin so you get a safe, fun day on the water without the hassle. Choose a pontoon for groups, a wake boat for watersports, or a sunset cruise—all with a licensed captain, life vests, and same-day availability when the calendar is open.
            </p>
          </div>
        </section>

        {/* Service area */}
        <section className="section-padding bg-white" aria-labelledby="service-area-heading">
          <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8">
            <h2 id="service-area-heading" className="text-2xl font-bold text-brand-dark sm:text-3xl">
              We serve the Austin area
            </h2>
            <p className="mt-2 text-brand-muted">
              Lake Austin boat rentals for Austin, TX and nearby neighborhoods.
            </p>
            <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 text-brand-dark">
              {location.areaServed.map((area) => (
                <li key={area} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-primary shrink-0" aria-hidden />
                  {area}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section className="section-padding bg-brand-bg" aria-labelledby="how-it-works-heading">
          <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8">
            <h2 id="how-it-works-heading" className="text-2xl font-bold text-brand-dark sm:text-3xl">
              How it works
            </h2>
            <ol className="mt-6 space-y-4 list-none">
              <li className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-primary text-sm font-bold text-white" aria-hidden>1</span>
                <div>
                  <strong className="text-brand-dark">Choose your experience</strong> — Pontoon, watersports, sunset cruise, or seasonal options.
                </div>
              </li>
              <li className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-primary text-sm font-bold text-white" aria-hidden>2</span>
                <div>
                  <strong className="text-brand-dark">Book online</strong> — Pick your date, see real-time availability, and confirm instantly.
                </div>
              </li>
              <li className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-primary text-sm font-bold text-white" aria-hidden>3</span>
                <div>
                  <strong className="text-brand-dark">Show up & enjoy</strong> — We&apos;ll send meet-up and parking details. Your captain handles the rest.
                </div>
              </li>
            </ol>
          </div>
        </section>

        {/* Parking / meet-up */}
        <section className="section-padding bg-white" aria-labelledby="parking-heading">
          <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8">
            <h2 id="parking-heading" className="text-2xl font-bold text-brand-dark sm:text-3xl">
              Parking & meet-up
            </h2>
            <p className="mt-4 text-brand-dark/90 leading-relaxed">
              Exact meet-up location and parking instructions are sent with your booking confirmation. We operate from the Austin area near Lake Austin; your confirmation will include the specific marina or dock, a contact for the day of your trip, and any parking fees or tips. If you have accessibility or parking questions before booking, contact us and we&apos;ll help.
            </p>
            <p className="mt-3 text-sm text-brand-muted">
              Meet-up location may vary by experience and date. We&apos;ll confirm details after you book.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <FAQ items={LOCATION_FAQ as FAQItem[]} />

        {/* Customer testimonials */}
        <section className="section-padding bg-brand-bg" aria-labelledby="testimonials-heading">
          <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8">
            <h2 id="testimonials-heading" className="text-2xl font-bold text-brand-dark sm:text-3xl">
              Customer testimonials
            </h2>
            <p className="mt-2 text-brand-muted">
              What guests say about their experience.
            </p>
            <ul className="mt-8 space-y-6">
              {LOCATION_TESTIMONIALS.map((t, i) => (
                <li key={i} className="rounded-2xl border border-brand-dark/10 bg-white p-6 shadow-soft">
                  <blockquote className="text-brand-dark/90 italic">&ldquo;{t.quote}&rdquo;</blockquote>
                  <cite className="mt-2 block text-sm not-italic text-brand-muted">{t.attribution}</cite>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Final CTA */}
        <section className="section-padding bg-brand-dark" aria-labelledby="final-cta-heading">
          <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8 text-center">
            <h2 id="final-cta-heading" className="text-2xl font-bold text-white sm:text-3xl">
              Ready to get on the water?
            </h2>
            <p className="mt-3 text-white/90">
              Book your Lake Austin boat rental or give us a call.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3 sm:gap-4">
              <a
                href={`tel:${location.phoneTel}`}
                className="inline-flex items-center justify-center min-h-[48px] w-full sm:w-auto rounded-xl bg-brand-primary px-6 py-4 text-base font-semibold text-white hover:bg-brand-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
              >
                Call {location.phone}
              </a>
              <Link
                href="/booking"
                className="inline-flex items-center justify-center min-h-[48px] w-full sm:w-auto rounded-xl bg-white px-6 py-4 text-base font-semibold text-brand-dark hover:bg-white/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
              >
                Book Now
              </Link>
            </div>
          </div>
        </section>

        <LocationPageCTA />
      </main>
    </>
  );
}
