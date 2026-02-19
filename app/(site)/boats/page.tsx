import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getListingBoatsForPublic } from "@/lib/booking/get-boats-public";
import { getDisplayDescription } from "@/lib/booking/boat-display";
import { getDisplayImageUrl } from "@/lib/utils";
import { brand } from "@/content/brand";
import { ChevronRight } from "lucide-react";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://boatbrosatx.com";
const canonical = `${baseUrl}/boats`;

export const metadata: Metadata = {
  title: "Our Boats | Lake Austin Boat Rentals | Boat Bros",
  description:
    "Meet our Lake Austin boat rentals fleet. Every trip is captain-included—pontoon, wake, and triton boats for your day on the water. Boat Bros ATX.",
  keywords: [
    "Lake Austin boat rentals",
    "boat rental Lake Austin",
    "our boats",
    "Lake Austin fleet",
    "captained boat rental Lake Austin",
  ],
  alternates: { canonical },
  openGraph: {
    title: "Our Boats | Lake Austin Boat Rentals | Boat Bros",
    description:
      "Meet our Lake Austin boat rentals fleet. Captain-included pontoon, wake, and triton boats. Book your day on the water.",
    url: canonical,
    siteName: brand.companyName,
  },
};

function shortDescription(description: string | undefined): string {
  if (!description || !description.trim()) return "Part of the Boat Bros Lake Austin fleet. Captain included.";
  const first = description.trim().split(/\n\n+/)[0];
  return first.length > 160 ? first.slice(0, 157) + "..." : first;
}

export default async function BoatsHubPage() {
  const boats = await getListingBoatsForPublic();

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="relative bg-brand-dark px-5 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20" aria-labelledby="boats-hero-heading">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/20 via-transparent to-brand-secondary/10" />
        <div className="container-narrow relative z-10 mx-auto text-center">
          <h1 id="boats-hero-heading" className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Our Boats
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-white/90 sm:text-xl">
            Our Lake Austin boat rentals fleet—every trip is captain-included. Choose a boat below to see details and book your day on the water.
          </p>
        </div>
      </section>

      {/* Boat cards */}
      <section className="section-padding bg-white" aria-labelledby="boats-grid-heading">
        <div className="container-wide px-4 sm:px-6 lg:px-8">
          <h2 id="boats-grid-heading" className="sr-only">
            Our Lake Austin rental boats
          </h2>
          {boats.length === 0 ? (
            <p className="text-center text-brand-muted">No boats are listed at the moment. Check back soon or contact us.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 lg:gap-6">
              {boats.map((boat) => {
                const imageUrl = boat.photos[0] ? getDisplayImageUrl(boat.photos[0]) : "/photos/IMG_3160.webp";
                const desc = shortDescription(getDisplayDescription(boat));
                return (
                  <Link
                    key={boat.id}
                    href={`/boats/${boat.slug}`}
                    className="group block relative rounded-xl bg-brand-dark ring-2 ring-brand-primary/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 transition-all duration-300 hover:shadow-lg hover:shadow-brand-primary/20 hover:-translate-y-0.5 hover:ring-brand-primary"
                    aria-label={`${boat.name} — view boat details`}
                  >
                    <div className="relative overflow-hidden rounded-xl aspect-[16/10] min-h-[160px] sm:min-h-[180px]">
                      <Image
                        src={imageUrl}
                        alt=""
                        fill
                        className="object-cover object-center transition-transform duration-500 group-hover:scale-[1.03]"
                        sizes="(max-width: 640px) 100vw, 50vw"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 from-20% via-black/40 to-transparent" />
                      <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-5">
                        <h3 className="font-display text-base sm:text-lg font-bold text-white tracking-tight leading-snug">
                          {boat.name}
                        </h3>
                        <p className="mt-1.5 text-white/90 text-xs sm:text-sm line-clamp-2 leading-snug">
                          {desc}
                        </p>
                        <span className="mt-2 sm:mt-2.5 inline-flex items-center gap-1.5 text-white font-medium text-xs sm:text-sm group-hover:gap-2 transition-[gap] duration-200">
                          View boat <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 group-hover:translate-x-0.5 transition-transform duration-200" aria-hidden />
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-20 lg:py-24 bg-gradient-to-b from-brand-bg to-white" aria-label="Book or contact">
        <div className="container-narrow mx-auto px-5 sm:px-6 lg:px-8 text-center">
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-brand-dark tracking-tight">See you on the water</h2>
          <p className="mt-4 text-brand-muted text-base max-w-md mx-auto">
            All our Lake Austin boat rentals include a licensed captain. Book online or reach out—we&apos;re here to help.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/experiences"
              className="inline-flex items-center justify-center rounded-full h-12 px-8 bg-brand-primary text-brand-dark hover:bg-brand-primary/95 font-semibold shadow-lg shadow-brand-primary/25 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
            >
              View experiences & book
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center rounded-full h-12 px-8 border-2 border-brand-dark/20 text-brand-dark hover:bg-brand-dark/5 hover:border-brand-dark/30 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
            >
              Contact us
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
