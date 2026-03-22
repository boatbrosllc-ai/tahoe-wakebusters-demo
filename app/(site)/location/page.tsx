import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { location } from "@/content/location";
import { LOCATION_FAQ } from "@/content/location-faq";
import { LOCATION_TESTIMONIALS } from "@/content/location-testimonials";
import { brand } from "@/content/brand";
import { MapEmbed } from "@/components/site/MapEmbed";
import { FAQ, type FAQItem } from "@/components/experience/FAQ";
import { LocationPageCTA } from "@/components/site/LocationPageCTA";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://boatbrosatx.com";
const canonical = `${baseUrl}/location`;

export const metadata: Metadata = {
  title: "Our Location | Boat Bros ATX – Austin TX",
  description:
    "Boat Bros location and contact. 5019 N Capital of Texas Hwy, Austin TX. Directions, parking, hours, and how to reach us. Call or book online.",
  keywords: [
    "Boat Bros location",
    "Boat Bros Austin address",
    "where is Boat Bros",
    "Boat Bros ATX contact",
  ],
  alternates: { canonical },
  openGraph: {
    title: "Our Location | Boat Bros ATX",
    description: "Find Boat Bros – address, directions, parking, and contact. Austin TX.",
    url: canonical,
    siteName: brand.companyName,
  },
};

async function BreadcrumbJsonLd() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: baseUrl },
      { "@type": "ListItem", position: 2, name: "Location", item: canonical },
    ],
  };
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export default async function LocationPage() {
  return (
    <>
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
                  Location
                </li>
              </ol>
            </nav>
            <h1 id="location-hero-heading" className="mt-6 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Our Location
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-white/90 sm:text-xl">
              Find us at {location.addressFormatted}. Get directions, see hours, or{" "}
              <Link href="/experiences" className="text-white font-medium underline decoration-white/50 hover:decoration-white">
                book online
              </Link>
              .
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

        {/* Marina / meeting location + map + contact */}
        <section className="section-padding bg-white" aria-labelledby="marina-heading">
          <div className="container-wide mx-auto max-w-5xl px-5 sm:px-6 lg:px-8">
            <h2 id="marina-heading" className="text-2xl font-bold text-brand-dark sm:text-3xl">
              Marina & meeting location
            </h2>
            <p className="mt-3 text-brand-dark/90 leading-relaxed">
              We operate from the Austin area near Lake Austin. Your booking confirmation will include the specific marina or dock for your trip. Guests meet the captain at the dock—we&apos;ll send exact meet-up details and a contact for the day of your trip after you book.
            </p>
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
                      href="/experiences"
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

        {/* Parking instructions */}
        <section className="section-padding bg-brand-bg" aria-labelledby="parking-heading">
          <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8">
            <h2 id="parking-heading" className="text-2xl font-bold text-brand-dark sm:text-3xl">
              Parking instructions
            </h2>
            <p className="mt-4 text-brand-dark/90 leading-relaxed">
              Parking availability depends on the specific marina or dock for your reservation. We include parking instructions and any fees in your booking confirmation so you can plan ahead. Meet-up location may vary by experience and date—we&apos;ll confirm details after you book. If you have accessibility or parking questions before booking, contact us and we&apos;ll help.
            </p>
          </div>
        </section>

        {/* Arrival timing */}
        <section className="section-padding bg-white" aria-labelledby="arrival-heading">
          <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8">
            <h2 id="arrival-heading" className="text-2xl font-bold text-brand-dark sm:text-3xl">
              Arrival timing
            </h2>
            <p className="mt-4 text-brand-dark/90 leading-relaxed">
              Plan to arrive at the time we confirm in your booking. Your captain will meet you at the dock. We&apos;ll send exact meet-up time and location with your confirmation.
            </p>
          </div>
        </section>

        {/* Service areas */}
        <section className="section-padding bg-brand-bg" aria-labelledby="service-area-heading">
          <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8">
            <h2 id="service-area-heading" className="text-2xl font-bold text-brand-dark sm:text-3xl">
              Service areas
            </h2>
            <p className="mt-2 text-brand-muted">
              Austin, TX and surrounding areas—we operate on and around Lake Austin.
            </p>
            <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 text-brand-dark">
              {location.areaServed.map((area) => (
                <li key={area} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-primary shrink-0" aria-hidden />
                  {area}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-brand-dark/90">
              See our <Link href="/experiences" className="text-brand-primary font-medium hover:underline">experiences</Link> and <Link href="/experiences" className="text-brand-primary font-medium hover:underline">book online</Link>.
            </p>
          </div>
        </section>

        {/* Logistical FAQs (from location-faq) */}
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
              Ready to book?
            </h2>
            <p className="mt-3 text-white/90">
              Check availability online or call us.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3 sm:gap-4">
              <a
                href={`tel:${location.phoneTel}`}
                className="inline-flex items-center justify-center min-h-[48px] w-full sm:w-auto rounded-xl bg-brand-primary px-6 py-4 text-base font-semibold text-white hover:bg-brand-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
              >
                Call {location.phone}
              </a>
              <Link
                href="/experiences"
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
