import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { location, reviewCountLabel } from "@/content/location";
import { LOCATION_FAQ } from "@/content/location-faq";
import { LOCATION_TESTIMONIALS } from "@/content/location-testimonials";
import { brand } from "@/content/brand";
import { MapEmbed } from "@/components/site/MapEmbed";
import { FAQ, type FAQItem } from "@/components/experience/FAQ";
import { LocationPageCTA } from "@/components/site/LocationPageCTA";
import { getMarinaMeetNote, getPublicPhone } from "@/lib/seo/public-contact";
import { OUR_BOAT_PATH } from "@/content/launch-boat";
import { getSiteBaseUrl } from "@/config/site";

const baseUrl = getSiteBaseUrl();
const canonical = `${baseUrl}/location`;

export const metadata: Metadata = {
  title: `Marina Location | ${brand.companyName}`,
  description: `Meet ${brand.companyName}. Dock meet-up details arrive after booking. Email or book online.`,
  keywords: [
    `${brand.companyName} location`,
    `${brand.companyName} contact`,
    "boat rental marina",
  ],
  alternates: { canonical },
  openGraph: {
    title: `Our Location | ${brand.companyName}`,
    description: `Find ${brand.companyName} — dock meet-up details after you book.`,
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
  const phone = getPublicPhone();
  const marinaNote = location.marinaMeetNote || getMarinaMeetNote();
  const hasMap = Boolean(location.mapEmbedSrc?.trim());
  const hasDirections = Boolean(location.googleMapsPlaceUrl?.trim());
  const hasReviews = location.reviewCount > 0;
  const hasTestimonials = LOCATION_TESTIMONIALS.length > 0;

  return (
    <>
      <BreadcrumbJsonLd />

      <main id="main-content" className="min-h-screen bg-white pb-24 lg:pb-0 overflow-x-hidden">
        <section
          className="relative overflow-hidden bg-brand-dark px-5 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20"
          aria-labelledby="location-hero-heading"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/20 via-transparent to-brand-secondary/10" />
          <div className="container-narrow relative z-10 mx-auto flex flex-col items-center text-center">
            <nav aria-label="Breadcrumb" className="w-full flex justify-center">
              <ol className="flex flex-wrap items-center justify-center gap-1 text-sm text-white/80">
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
              Based in {location.addressFormatted}. {marinaNote}{" "}
              <Link href="/experiences" className="text-white font-medium underline decoration-white/50 hover:decoration-white">
                Book online
              </Link>
              .
            </p>
          </div>
        </section>

        {hasReviews ? (
          <section className="bg-brand-bg/50 py-8 sm:py-10" aria-label="Customer rating">
            <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8 text-center">
              <p className="text-2xl sm:text-3xl font-bold text-brand-dark">
                {location.rating} <span className="text-amber-500" aria-hidden>★★★★★</span>
              </p>
              <p className="mt-1 text-brand-muted">{reviewCountLabel()}</p>
            </div>
          </section>
        ) : (
          <section className="bg-brand-bg/50 py-8 sm:py-10" aria-label="Private boat rentals">
            <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8 text-center">
              <p className="text-lg sm:text-xl font-semibold text-brand-dark">
                Private boat rentals
              </p>
              <p className="mt-1 text-brand-muted">{reviewCountLabel()}</p>
            </div>
          </section>
        )}

        <section className="section-padding bg-white" aria-labelledby="marina-heading">
          <div className="container-wide mx-auto max-w-5xl px-5 sm:px-6 lg:px-8">
            <h2 id="marina-heading" className="text-2xl font-bold text-brand-dark sm:text-3xl">
              Marina & meeting location
            </h2>
            <p className="mt-3 text-brand-dark/90 leading-relaxed">
              We operate from the local marina / dock area. Your booking confirmation includes the exact slip or meet-up point. Guests meet the captain there—we send meet-up details after you book.
            </p>
            <div className={`mt-6 grid gap-6 sm:gap-8 ${hasMap ? "lg:grid-cols-[1fr_1fr] lg:gap-12" : ""}`}>
              <div className="min-w-0">
                <div className="rounded-2xl border border-brand-dark/10 bg-brand-bg/50 p-5 sm:p-8">
                  <p className="font-semibold text-brand-dark">{location.name}</p>
                  <p className="mt-2 text-brand-dark break-words">{location.addressFormatted}</p>
                  <p className="mt-2 text-sm text-brand-muted">{marinaNote}</p>
                  {phone ? (
                    <p className="mt-2">
                      <a
                        href={`tel:${phone.tel}`}
                        className="inline-flex items-center min-h-[44px] font-medium text-brand-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 rounded"
                        aria-label={`Call ${phone.display}`}
                      >
                        {phone.display}
                      </a>
                    </p>
                  ) : (
                    <p className="mt-2">
                      <a
                        href={`mailto:${brand.email}`}
                        className="inline-flex items-center min-h-[44px] font-medium text-brand-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 rounded"
                      >
                        {brand.email}
                      </a>
                    </p>
                  )}
                  <p className="mt-2 text-sm text-brand-muted">{location.hoursNote}</p>
                  <div className="mt-6 flex flex-col sm:flex-row flex-wrap gap-3">
                    {hasDirections ? (
                      <a
                        href={location.googleMapsPlaceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center min-h-[48px] rounded-xl bg-brand-primary px-5 py-3 text-sm font-semibold text-white hover:bg-brand-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
                      >
                        Get Directions
                      </a>
                    ) : null}
                    {phone ? (
                      <a
                        href={`tel:${phone.tel}`}
                        className="inline-flex items-center justify-center min-h-[48px] rounded-xl border-2 border-brand-dark/20 px-5 py-3 text-sm font-semibold text-brand-dark hover:border-brand-primary hover:text-brand-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
                      >
                        Call
                      </a>
                    ) : (
                      <Link
                        href="/contact"
                        className="inline-flex items-center justify-center min-h-[48px] rounded-xl border-2 border-brand-dark/20 px-5 py-3 text-sm font-semibold text-brand-dark hover:border-brand-primary hover:text-brand-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
                      >
                        Contact
                      </Link>
                    )}
                    <Link
                      href="/experiences"
                      className="inline-flex items-center justify-center min-h-[48px] rounded-xl bg-brand-secondary px-5 py-3 text-sm font-semibold text-white hover:bg-brand-secondary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary focus-visible:ring-offset-2"
                    >
                      Book Now
                    </Link>
                  </div>
                </div>
              </div>
              {hasMap ? (
                <div className="min-w-0 min-h-[240px] sm:min-h-0">
                  <MapEmbed
                    src={location.mapEmbedSrc}
                    title={`${brand.companyName} location on Google Maps`}
                    viewOnMapsUrl={location.googleMapsPlaceUrl || undefined}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="section-padding bg-brand-bg" aria-labelledby="parking-heading">
          <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8">
            <h2 id="parking-heading" className="text-2xl font-bold text-brand-dark sm:text-3xl">
              Parking instructions
            </h2>
            <p className="mt-4 text-brand-dark/90 leading-relaxed">
              Parking depends on the specific marina slip for your reservation. We include parking notes and any fees in your booking confirmation. If you have accessibility or parking questions before booking, contact us and we&apos;ll help.
            </p>
          </div>
        </section>

        <section className="section-padding bg-white" aria-labelledby="arrival-heading">
          <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8">
            <h2 id="arrival-heading" className="text-2xl font-bold text-brand-dark sm:text-3xl">
              Arrival timing
            </h2>
            <p className="mt-4 text-brand-dark/90 leading-relaxed">
              Plan to arrive at the time confirmed in your booking. Your captain meets you at the dock. Exact meet-up time and location come with your confirmation.
            </p>
          </div>
        </section>

        <section className="section-padding bg-brand-bg" aria-labelledby="service-area-heading">
          <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8">
            <h2 id="service-area-heading" className="text-2xl font-bold text-brand-dark sm:text-3xl">
              Service areas
            </h2>
            <p className="mt-2 text-brand-muted">
              We run the local waterways listed below. The captain sets the plan for the day based on conditions.
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
              See our{" "}
              <Link href="/experiences" className="text-brand-primary font-medium hover:underline">
                charters
              </Link>
              ,{" "}
              <Link href={OUR_BOAT_PATH} className="text-brand-primary font-medium hover:underline">
                boat details
              </Link>
              , and <Link href="/booking" className="text-brand-primary font-medium hover:underline">book online</Link>.
            </p>
          </div>
        </section>

        <FAQ items={LOCATION_FAQ as FAQItem[]} />

        {hasTestimonials ? (
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
        ) : null}

        <section className="section-padding bg-brand-dark" aria-labelledby="final-cta-heading">
          <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8 text-center">
            <h2 id="final-cta-heading" className="text-2xl font-bold text-white sm:text-3xl">
              Ready to book?
            </h2>
            <p className="mt-3 text-white/90">
              Check availability online{phone ? " or call us" : " or send a message"}.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3 sm:gap-4">
              {phone ? (
                <a
                  href={`tel:${phone.tel}`}
                  className="inline-flex items-center justify-center min-h-[48px] w-full sm:w-auto rounded-xl bg-brand-primary px-6 py-4 text-base font-semibold text-white hover:bg-brand-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
                >
                  Call {phone.display}
                </a>
              ) : (
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center min-h-[48px] w-full sm:w-auto rounded-xl bg-brand-primary px-6 py-4 text-base font-semibold text-white hover:bg-brand-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
                >
                  Contact us
                </Link>
              )}
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
