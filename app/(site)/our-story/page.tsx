import type { Metadata } from "next";
import Image from "next/image";
import { brand } from "@/content/brand";
import { BookingCTA } from "@/components/site/BookingCTA";

const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://boatbrosatx.com").replace(/\/+$/, "");
const canonical = `${baseUrl}/our-story`;

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Our Story | Lake Austin Boat Rentals",
  description:
    "Meet Thomas and Nicodemus — the brothers behind Boat Bros. A legacy of lake adventure on Lake Austin.",
  keywords: ["Lake Austin boat rentals", "Boat Bros Austin", "best boat rentals Lake Austin"],
  alternates: { canonical },
  openGraph: {
    title: "Our Story | Lake Austin Boat Rentals | Boat Bros",
    description: "Meet Thomas and Nicodemus — the brothers behind Boat Bros.",
    url: canonical,
  },
};

export default function OurStoryPage() {
  return (
    <div className="min-h-screen w-full bg-brand-bg">
      {/* Hero – full width, centered content */}
      <section className="relative w-full aspect-[3/4] sm:aspect-[21/9] min-h-[360px] sm:min-h-[420px] lg:min-h-[480px] max-h-[80vh] sm:max-h-[60vh] overflow-hidden">
        <Image
          src="/photos/brothers.webp"
          alt="The Boat Bros crew – local Austin team"
          fill
          className="object-cover object-[center_20%]"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-dark via-brand-dark/40 to-brand-dark/20" />
        <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/10 via-transparent to-brand-muted/5" aria-hidden />
        <div className="absolute inset-0 flex flex-col items-center justify-end text-center w-full px-5 py-12 sm:px-8 sm:py-14 lg:px-12 lg:py-20">
          <div className="w-full max-w-4xl mx-auto">
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.2em] text-brand-primary mb-3">
              Lake Austin boat rentals
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-white tracking-tight drop-shadow-lg">
              Our story
            </h1>
            <p className="mt-3 text-lg sm:text-xl lg:text-2xl text-white/90 max-w-2xl mx-auto">
              The crew behind {brand.companyName} – Lake Austin boat rentals, done right.
            </p>
          </div>
        </div>
      </section>

      {/* Story content – centered card */}
      <section className="relative pt-10 sm:pt-12 lg:pt-16 z-20 w-full px-4 sm:px-6 lg:px-8 pb-20 lg:pb-28 flex justify-center bg-brand-bg">
        <div className="w-full max-w-4xl">
          <article className="rounded-2xl sm:rounded-3xl border-2 border-brand-dark/10 bg-white/90 shadow-premium overflow-hidden backdrop-blur-sm">
            <div className="p-6 sm:p-8 lg:p-10 xl:p-12">
              <p className="text-xl sm:text-2xl lg:text-3xl text-brand-dark font-semibold leading-relaxed mb-8 border-l-4 border-brand-primary pl-6 sm:pl-8">
                Thomas and Nicodemus – A Legacy of Lake Adventure
              </p>
              <div className="space-y-6 text-brand-muted leading-relaxed text-base sm:text-lg">
                <p>
                  Welcome to Boat Bros! Meet Thomas and Nicodemus, the brothers behind the creation of the company. Our story is rooted in a childhood filled with thrilling adventures and unforgettable moments on the water.
                </p>
                <p>
                  Growing up in a family of nine children, with seven boys and two girls, our weekends were spent on the water. Our father, a true water enthusiast, introduced us to the wonders of boating.
                </p>
                <p>
                  As we grew older, our passion for boating became an inseparable part of who we are. It was during these formative years that the seed of Boat Bros was planted.
                </p>
                <p>
                  Boat Bros is more than just a boat rental service – it’s an extension of our family and a community of like-minded individuals. We are dedicated to our customers having an unforgettable experience.
                </p>
                <p>
                  We are a family that invites you to be a part of our story. Welcome to Boat Bros!
                </p>
              </div>
            </div>
          </article>

          {/* CTA block – same style as FAQ page */}
          <div className="mt-14 sm:mt-16 rounded-3xl bg-brand-dark p-8 sm:p-10 lg:p-12 text-center shadow-premium overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/20 via-transparent to-brand-muted/10" aria-hidden />
            <div className="relative z-10">
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
                Ready to book?
              </h2>
              <p className="text-white/80 text-sm sm:text-base mb-6 max-w-md mx-auto">
                Pick your experience, date, and time. Instant confirmation · Easy reschedule.
              </p>
              <BookingCTA
                source="our_story_page"
                page="our-story"
                variant="secondary"
                showCall={true}
                onDark
                primaryHint=""
                callHint=""
                className="justify-center"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
