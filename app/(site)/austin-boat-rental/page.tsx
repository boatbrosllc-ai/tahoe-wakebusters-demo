import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import Image from "next/image";
import { brand } from "@/content/brand";
import { location } from "@/content/location";
import {
  AUSTIN_BOAT_RENTAL_FAQ,
  AUSTIN_BOAT_RENTAL_RESOURCE_LINKS,
} from "@/content/austin-boat-rental";
import { getFaqById } from "@/content/faqs";
import { FAQ } from "@/components/experience/FAQ";
import { AustinBoatRentalPageCTA } from "@/components/site/AustinBoatRentalPageCTA";
import { ArrowRight } from "lucide-react";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://boatbrosatx.com";
const canonical = `${baseUrl}/austin-boat-rental`;

export const metadata: Metadata = {
  title: "Austin Boat Rental: The Complete Guide | Boat Bros ATX",
  description:
    "Everything you need to know about Austin boat rentals on Lake Austin. Captained pontoons, party boats, sunset cruises & more. Book direct — Boat Bros ATX.",
  keywords: [
    "austin boat rental",
    "boat rentals austin tx",
    "lake austin boat rental",
    "captained boat rental austin",
    "pontoon rental austin",
    "party boat austin",
    "sunset cruise austin",
  ],
  alternates: { canonical },
  openGraph: {
    title: "Austin Boat Rental: The Complete Guide | Boat Bros ATX",
    description:
      "Captained Lake Austin boat rentals—pontoon, wake surf, sunset cruises. Captain, fuel, cooler included. Book direct.",
    url: canonical,
    siteName: brand.companyName,
    images: [{ url: "/photos/IMG_3160.webp", width: 1200, height: 630, alt: "Austin boat rental on Lake Austin" }],
  },
};

async function PillarPageJsonLd() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
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
    serviceType: "Boat Rental",
    name: "Austin Boat Rental on Lake Austin",
    description:
      "Captained boat rentals on Lake Austin—pontoon party boats, wake surf, and sunset cruises. Captain, fuel, and cooler included. Austin TX.",
    provider: { "@type": "LocalBusiness", name: brand.companyName },
    areaServed: { "@type": "Place", name: "Austin, TX" },
  };
  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: AUSTIN_BOAT_RENTAL_FAQ.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: baseUrl },
      { "@type": "ListItem", position: 2, name: "Austin Boat Rental", item: canonical },
    ],
  };
  return (
    <>
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusiness) }} />
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(service) }} />
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPage) }} />
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
    </>
  );
}

function Section({
  id,
  title,
  children,
  bg = "white",
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  bg?: "white" | "muted";
}) {
  return (
    <section
      id={id}
      className={bg === "muted" ? "section-padding bg-brand-bg" : "section-padding bg-white"}
      aria-labelledby={`${id}-heading`}
    >
      <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8">
        <h2 id={`${id}-heading`} className="text-2xl font-bold text-brand-dark sm:text-3xl">
          {title}
        </h2>
        <div className="mt-4 space-y-4 text-brand-dark/90 leading-relaxed">{children}</div>
      </div>
    </section>
  );
}

function Subheading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xl font-semibold text-brand-dark mt-6">{children}</h3>;
}

function BookCta({ label = "Check availability" }: { label?: string }) {
  return (
    <Link
      href="/booking"
      className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-primary px-6 py-3.5 text-sm font-semibold text-white hover:bg-brand-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
    >
      {label}
      <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
    </Link>
  );
}

export default function AustinBoatRentalPage() {
  return (
    <>
      <PillarPageJsonLd />
      <main id="main-content" className="min-h-screen bg-white pb-24 lg:pb-0 overflow-x-hidden">
        {/* Hero */}
        <section
          className="relative overflow-hidden bg-brand-dark min-h-[50vh] sm:min-h-[55vh] flex flex-col justify-end"
          aria-labelledby="pillar-hero-heading"
        >
          <div className="absolute inset-0">
            <Image
              src="/photos/IMG_3160.webp"
              alt=""
              fill
              className="object-cover object-center opacity-45"
              priority
              sizes="100vw"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-brand-dark/70 via-brand-dark/50 to-brand-dark" />
          </div>
          <div className="relative z-10 container-wide mx-auto px-5 sm:px-6 lg:px-8 pb-12 sm:pb-16 pt-20 sm:pt-24">
            <nav aria-label="Breadcrumb" className="text-sm text-white/80">
              <ol className="flex flex-wrap items-center gap-1">
                <li>
                  <Link href="/" className="hover:text-white focus-visible:underline rounded">
                    Home
                  </Link>
                </li>
                <li aria-hidden>/</li>
                <li className="text-white" aria-current="page">
                  Austin Boat Rental
                </li>
              </ol>
            </nav>
            <h1
              id="pillar-hero-heading"
              className="mt-6 max-w-4xl text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl"
            >
              Austin Boat Rental: The Complete Guide to Getting on Lake Austin
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-white/90 sm:text-xl leading-relaxed">
              Captained pontoons, party boats, wake surf, and sunset cruises—about 10 minutes from downtown.
              Every Austin boat rental includes your captain, fuel, and a cooler.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/booking"
                className="inline-flex items-center justify-center min-h-[48px] rounded-xl bg-brand-primary px-8 py-4 text-base font-bold text-white shadow-[0_8px_28px_rgba(80,189,186,0.4)] hover:bg-brand-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
              >
                Book Now
              </Link>
              <Link
                href="/experiences"
                className="inline-flex items-center justify-center min-h-[48px] rounded-xl border-2 border-white/40 px-6 py-4 text-base font-semibold text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
              >
                See experiences
              </Link>
            </div>
            <p className="mt-4 text-sm text-white/70">
              {location.rating} ★ · {location.reviewCount} Google reviews
            </p>
          </div>
        </section>

        <Section id="what-is" title="What Is an Austin Boat Rental? (Lake Austin vs. Lake Travis)">
          <p>
            An <strong>Austin boat rental</strong> usually means a captained day on <strong>Lake Austin</strong>—a
            constant-level reservoir that runs through the city, not a long haul to Lake Travis. When people search{" "}
            <strong>boat rentals Austin TX</strong>, they often want proximity, calm water, and a captain who knows the
            coves. That is exactly what Boat Bros delivers from Loop 360, about 10 minutes from downtown.
          </p>
          <Subheading>Why Lake Austin Is the Better Choice for Most Groups</Subheading>
          <p>
            Lake Austin stays at a steady water level year-round, so swimming spots and shorelines stay predictable.
            You are on the water quickly—no 35–45 minute drive to Lake Travis. For bachelor and bachelorette parties,
            birthdays, corporate outings, and family days, Lake Austin&apos;s scenery (including Pennybacker Bridge and
            waterfront hills) is hard to beat. Read our{" "}
            <Link href="/blog/lake-austin-vs-lake-travis-boat-rental" className="text-brand-primary font-medium hover:underline">
              Lake Austin vs. Lake Travis comparison
            </Link>{" "}
            for a full breakdown.
          </p>
          <Subheading>How Captained Rentals Work</Subheading>
          <p>
            You meet your captain at the dock, board, and enjoy the day. The captain navigates, anchors in safe swimming
            areas, and handles docking. No boating license required. Learn more in our{" "}
            <Link href="/blog/captained-boat-rental-austin" className="text-brand-primary font-medium hover:underline">
              captained boat rental Austin guide
            </Link>
            .
          </p>
        </Section>

        <Section id="types" title="Types of Austin Boat Rentals We Offer" bg="muted">
          <p>
            Boat Bros specializes in captained experiences on Lake Austin. Choose the vibe that fits your group.
          </p>
          <Subheading>Pontoon Party Rentals (up to 14 guests)</Subheading>
          <p>
            Our <Link href="/experiences/lake-austin-pontoon" className="text-brand-primary font-medium hover:underline">Lake Austin pontoon rentals</Link> are
            the go-to for parties, reunions, and group celebrations. Premium sound, lily pad, cooler, and fuel included.
            See the{" "}
            <Link href="/blog/lake-austin-pontoon-rental-guide" className="text-brand-primary font-medium hover:underline">
              pontoon rental guide
            </Link>{" "}
            for pricing and what to expect.
          </p>
          <Subheading>Wake Surf & Watersports Boats</Subheading>
          <p>
            <Link href="/experiences/watersports" className="text-brand-primary font-medium hover:underline">Wake surf and watersports</Link> rentals
            include captain, gear, and tubes. Ideal for active groups who want wakeboarding or surfing behind the boat.
          </p>
          <Subheading>Sunset Cruises on Lake Austin</Subheading>
          <p>
            <Link href="/experiences/sunset" className="text-brand-primary font-medium hover:underline">Sunset cruises</Link> run about an hour with
            ticketed seating—perfect for couples, anniversaries, or a low-key evening on the water. From $35 per ticket.
          </p>
          <Subheading>Private Charter vs. Ticketed Cruise</Subheading>
          <p>
            Private charters (pontoon or wake) are yours for the block you book—3 to 8 hours typical. Ticketed sunset and
            holiday tours are shared experiences with set departure times. Compare options in our{" "}
            <Link href="/blog/austin-party-boat-rental-options" className="text-brand-primary font-medium hover:underline">
              Austin party boat rental guide
            </Link>
            .
          </p>
        </Section>

        <Section id="pricing" title="Austin Boat Rental Pricing">
          <p>
            Transparent pricing wins trust—and helps you plan. Here is what to expect when you book an Austin boat rental
            with Boat Bros.
          </p>
          <div className="mt-4 overflow-x-auto rounded-xl border border-brand-dark/10">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="bg-brand-bg border-b border-brand-dark/10">
                  <th className="px-4 py-3 font-semibold text-brand-dark">Experience</th>
                  <th className="px-4 py-3 font-semibold text-brand-dark">Starting price</th>
                  <th className="px-4 py-3 font-semibold text-brand-dark">Duration</th>
                  <th className="px-4 py-3 font-semibold text-brand-dark">Includes</th>
                </tr>
              </thead>
              <tbody className="text-brand-dark/90">
                <tr className="border-b border-brand-dark/5">
                  <td className="px-4 py-3">Pontoon charter</td>
                  <td className="px-4 py-3">From $450</td>
                  <td className="px-4 py-3">3–8 hrs</td>
                  <td className="px-4 py-3">Captain, fuel, cooler</td>
                </tr>
                <tr className="border-b border-brand-dark/5">
                  <td className="px-4 py-3">Wake surf / watersports</td>
                  <td className="px-4 py-3">From $600</td>
                  <td className="px-4 py-3">3–8 hrs</td>
                  <td className="px-4 py-3">Captain, gear, tubes</td>
                </tr>
                <tr className="border-b border-brand-dark/5">
                  <td className="px-4 py-3">Sunset cruise</td>
                  <td className="px-4 py-3">From $35/ticket</td>
                  <td className="px-4 py-3">1 hr</td>
                  <td className="px-4 py-3">Captain, scenic route</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Holiday tour</td>
                  <td className="px-4 py-3">$45/ticket</td>
                  <td className="px-4 py-3">1.5 hrs</td>
                  <td className="px-4 py-3">Captain, hot cocoa</td>
                </tr>
              </tbody>
            </table>
          </div>
          <Subheading>What&apos;s Included (Captain, Fuel, Cooler, Lily Pad)</Subheading>
          <p>
            Every private charter includes a licensed captain, fuel, an empty cooler, and (on pontoons) a floating lily
            pad. {getFaqById("ice")!.answer} Wake boats include boards and towables. No hidden gas fees. Details in our{" "}
            <Link href="/blog/austin-boat-rental-cost-pricing-guide" className="text-brand-primary font-medium hover:underline">
              Austin boat rental pricing guide
            </Link>
            .
          </p>
          <Subheading>How Long Should You Rent?</Subheading>
          <p>
            Minimums are typically 3 hours depending on boat and day. Parties and bachelor/bachelorette groups often book
            4–6 hours. Sunset cruises are fixed at about one hour. Book early for summer weekends.
          </p>
          <Subheading>Deposit & Cancellation Policy</Subheading>
          <p>
            Free cancellation until 30 days before your trip. 50% refund between 15–30 days. Non-refundable within 14
            days. See <Link href="/faqs" className="text-brand-primary font-medium hover:underline">FAQs</Link> for full policy.
          </p>
          <BookCta label="Check availability →" />
        </Section>

        <Section id="who-books" title="Who Books Austin Boat Rentals?" bg="muted">
          <Subheading>Bachelor & Bachelorette Parties</Subheading>
          <p>
            Lake Austin is Austin&apos;s favorite send-off lake day.{" "}
            <Link href="/lake-austin-bachelor-party-boat-rentals" className="text-brand-primary font-medium hover:underline">
              Bachelor party boat rentals
            </Link>{" "}
            and{" "}
            <Link href="/lake-austin-bachelorette-party-boat-rentals" className="text-brand-primary font-medium hover:underline">
              bachelorette party rentals
            </Link>{" "}
            include captain, sound system, and room for the whole crew.{" "}
            <Link href="/blog/austin-bachelor-party-boat-rental-guide" className="text-brand-primary font-medium hover:underline">
              Bachelor guide
            </Link>{" "}
            ·{" "}
            <Link href="/blog/austin-bachelorette-party-boat-rental-guide" className="text-brand-primary font-medium hover:underline">
              Bachelorette guide
            </Link>
            . <BookCta label="Book a party boat" />
          </p>
          <Subheading>Birthday Parties on the Lake</Subheading>
          <p>
            Celebrate on a pontoon with decorations (within reason), music, and swimming.{" "}
            <Link href="/blog/lake-austin-birthday-party-boat-rental" className="text-brand-primary font-medium hover:underline">
              Birthday party boat rental ideas
            </Link>
            . <BookCta label="Plan a birthday on the lake" />
          </p>
          <Subheading>Corporate Outings & Team Events</Subheading>
          <p>
            Team-building without the conference room—multiple boats available for larger companies.{" "}
            <Link href="/blog/corporate-boat-rental-austin-lake-austin" className="text-brand-primary font-medium hover:underline">
              Corporate boat rental guide
            </Link>{" "}
            · <Link href="/contact" className="text-brand-primary font-medium hover:underline">Contact us</Link> for large groups.{" "}
            <BookCta label="Book a corporate outing" />
          </p>
          <Subheading>Family Lake Days</Subheading>
          <p>
            Life jackets provided; kid-friendly coves and calm water. Pets allowed on private charters with a fee.{" "}
            <Link href="/blog/family-boat-rental-lake-austin" className="text-brand-primary font-medium hover:underline">
              Family boat rental guide
            </Link>
            . <BookCta label="Book a family day" />
          </p>
          <Subheading>Couples & Date Nights (Sunset Cruise)</Subheading>
          <p>
            Ticketed <Link href="/experiences/sunset" className="text-brand-primary font-medium hover:underline">sunset cruises</Link> are
            romantic and easy—no planning a full charter.{" "}
            <Link href="/blog/lake-austin-sunset-cruise-guide" className="text-brand-primary font-medium hover:underline">
              Sunset cruise guide
            </Link>
            . <BookCta label="Book sunset tickets" />
          </p>
        </Section>

        <Section id="location" title="Where We Launch — Lake Austin Location & Parking">
          <Subheading>Loop 360 Boat Ramp (5019 N Capital of Texas Hwy)</Subheading>
          <p>
            We operate from Loop 360 Boat Ramp at {location.addressFormatted}. That puts you on Lake Austin within minutes
            of Westlake, downtown, and the Domain. Full directions on our{" "}
            <Link href="/location" className="text-brand-primary font-medium hover:underline">location page</Link>.
          </p>
          <Subheading>Parking & Walk-In Fee</Subheading>
          <p>
            Parking depends on ramp availability; we include parking notes in your confirmation. Some guests use ride-share
            to avoid ramp fees—plan ahead for busy summer weekends.
          </p>
          <Subheading>How to Find Us</Subheading>
          <p>
            Your booking confirmation lists exact meet-up time and captain contact. Arrive at the time we confirm—the
            captain meets you at the dock.
          </p>
        </Section>

        <Section id="what-to-bring" title="What to Bring on Your Austin Boat Rental" bg="muted">
          <p>
            Sunscreen (reef-safe), water, soft-sided cooler with drinks and snacks (no glass, no styrofoam), towels, and
            waterproof phone cases. Life jackets are provided. Full checklist:{" "}
            <Link href="/blog/what-to-bring-lake-austin-boat-rental" className="text-brand-primary font-medium hover:underline">
              what to bring on a Lake Austin boat rental
            </Link>{" "}
            and{" "}
            <Link href="/blog/what-to-wear-lake-austin-boat-rental" className="text-brand-primary font-medium hover:underline">
              what to wear
            </Link>
            .
          </p>
        </Section>

        <Section id="rules" title="Austin Boat Rental Rules & Safety">
          <Subheading>No Glass, No Drones</Subheading>
          <p>
            Glass and styrofoam are not allowed on Lake Austin. Drones require permission and must follow local rules—ask
            when you book.
          </p>
          <Subheading>Life Jackets & Kids</Subheading>
          <p>{getFaqById("kid-life-vests")!.answer}</p>
          <Subheading>Weather Policy</Subheading>
          <p>
            We reschedule when possible. Captains cancel when unsafe (typically below 55°F or winds over 20 mph). Light
            rain often still makes a great day—Texas weather changes fast.
          </p>
        </Section>

        <Section id="how-to-book" title="How to Book an Austin Boat Rental with Boat Bros" bg="muted">
          <ol className="list-decimal list-inside space-y-2 marker:font-semibold">
            <li>Choose your experience on <Link href="/experiences" className="text-brand-primary font-medium hover:underline">Experiences</Link>.</li>
            <li>Pick date, time, and duration on <Link href="/booking" className="text-brand-primary font-medium hover:underline">Booking</Link>.</li>
            <li>Confirm group size and any add-ons (pet fee, extra cooler, etc.).</li>
            <li>Receive meet-up details and captain contact before your trip.</li>
          </ol>
          <p className="mt-4">
            Book 2–4 weeks ahead for summer weekends; holidays and bachelor/bachelorette season fill fast. Questions?{" "}
            <Link href="/faqs" className="text-brand-primary font-medium hover:underline">FAQs</Link> or{" "}
            <Link href="/contact" className="text-brand-primary font-medium hover:underline">contact us</Link>.
          </p>
          <BookCta label="Book your Austin boat rental" />
        </Section>

        <FAQ items={AUSTIN_BOAT_RENTAL_FAQ} />

        <section className="section-padding bg-brand-bg" aria-labelledby="resources-heading">
          <div className="container-wide mx-auto px-5 sm:px-6 lg:px-8 max-w-5xl">
            <h2 id="resources-heading" className="text-2xl font-bold text-brand-dark sm:text-3xl text-center">
              More Lake Austin Resources
            </h2>
            <p className="mt-3 text-center text-brand-muted max-w-2xl mx-auto">
              Deep dives on pricing, parties, captains, restaurants, and planning—plus our core pages.
            </p>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {AUSTIN_BOAT_RENTAL_RESOURCE_LINKS.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="block h-full rounded-2xl border border-brand-dark/10 bg-white p-5 shadow-soft hover:border-brand-primary/40 hover:shadow-md transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                  >
                    <span className="font-semibold text-brand-dark">{item.title}</span>
                    <span className="mt-1 block text-sm text-brand-muted">{item.description}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-10 flex flex-wrap justify-center gap-4 text-sm">
              <Link href="/experiences" className="text-brand-primary font-medium hover:underline">
                Experiences
              </Link>
              <Link href="/location" className="text-brand-primary font-medium hover:underline">
                Location
              </Link>
              <Link href="/faqs" className="text-brand-primary font-medium hover:underline">
                FAQs
              </Link>
              <Link href="/booking" className="text-brand-primary font-medium hover:underline">
                Booking
              </Link>
              <Link href="/blog/best-coves-spots-lake-austin-pontoon-swimming" className="text-brand-primary font-medium hover:underline">
                Best coves on Lake Austin
              </Link>
            </div>
          </div>
        </section>

        <section className="section-padding bg-brand-dark" aria-labelledby="final-cta-heading">
          <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8 text-center">
            <h2 id="final-cta-heading" className="text-2xl font-bold text-white sm:text-3xl">
              Ready for your Austin boat rental?
            </h2>
            <p className="mt-3 text-white/90 max-w-lg mx-auto">
              Captained Lake Austin pontoons, wake boats, and sunset cruises—book online in minutes.
            </p>
            <Link
              href="/booking"
              className="mt-8 inline-flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-brand-primary px-8 py-4 text-base font-bold text-white hover:bg-brand-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
            >
              Book Now
              <ArrowRight className="h-5 w-5 shrink-0" aria-hidden />
            </Link>
          </div>
        </section>

        <AustinBoatRentalPageCTA />
      </main>
    </>
  );
}
