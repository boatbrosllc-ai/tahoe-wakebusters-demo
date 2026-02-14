import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { brand } from "@/content/brand";
import { BookingCTA } from "@/components/site/BookingCTA";

export const metadata: Metadata = {
  title: "Our Story | Lake Austin Boat Rentals",
  description: `Meet the crew behind ${brand.companyName}. Local Austin team, premium Lake Austin boat rentals.`,
};

export default function OurStoryPage() {
  return (
    <div className="min-h-screen w-full bg-brand-bg">
      {/* Hero – full width, centered content */}
      <section className="relative w-full aspect-[3/4] sm:aspect-[21/9] min-h-[320px] sm:min-h-[360px] lg:min-h-[420px] max-h-[75vh] sm:max-h-[55vh] overflow-hidden">
        <Image
          src="/photos/brothers.webp"
          alt="The Boat Bros crew – local Austin team"
          fill
          className="object-cover object-[center_30%]"
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
      <section className="relative -mt-12 sm:-mt-16 z-20 w-full px-4 sm:px-6 lg:px-8 pb-20 lg:pb-28 flex justify-center bg-brand-bg">
        <div className="w-full max-w-4xl">
          <article className="rounded-2xl sm:rounded-3xl border-2 border-brand-dark/10 bg-white/90 shadow-premium overflow-hidden backdrop-blur-sm">
            <div className="p-6 sm:p-8 lg:p-10 xl:p-12">
              <p className="text-xl sm:text-2xl lg:text-3xl text-brand-dark font-semibold leading-relaxed mb-8 border-l-4 border-brand-primary pl-6 sm:pl-8">
                We&apos;re a local Austin crew who love Lake Austin and wanted to share the best of the lake with visitors and locals alike.
              </p>
              <div className="space-y-6 text-brand-muted leading-relaxed text-base sm:text-lg">
                <p>
                  Boat Bros started with a simple idea: make it easy to book a great day on the water. No hassle, no hidden fees—just solid boats, clear pricing, and a team that shows up. We offer pontoons for parties, tow boats for wake and surf, and sunset cruises for anyone who wants to unwind with a view.
                </p>
                <p>
                  Every rental includes life vests, safety briefing, and support if you need it. We&apos;re licensed and insured, and we work with captains who know the lake. Whether you&apos;re planning a family day, a bachelor party, or a corporate outing, we&apos;re here to make it smooth.
                </p>
                <p>
                  Lake Austin is our backyard. When you book with us, you&apos;re getting a team that cares about your day—and the lake we all love.
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
              <p className="mt-4 text-sm text-white/70">
                <Link
                  href="/contact"
                  className="text-brand-primary font-medium hover:text-white transition-colors underline underline-offset-2"
                >
                  Contact us
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
