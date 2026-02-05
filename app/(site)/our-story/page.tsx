import type { Metadata } from "next";
import Image from "next/image";
import { brand } from "@/content/brand";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Our Story | Lake Travis & Lake Austin Boat Rentals",
  description: `Meet the crew behind ${brand.companyName}. Local Austin team, premium boats on Lake Travis and Lake Austin.`,
};

export default function OurStoryPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero – brothers photo (portrait-friendly on mobile, wide banner on desktop) */}
      <section className="relative aspect-[3/4] sm:aspect-[21/9] min-h-[320px] sm:min-h-[320px] lg:min-h-[380px] max-h-[70vh] sm:max-h-none overflow-hidden">
        <Image
          src="/photos/brothers.webp"
          alt="The Boat Bros crew – local Austin team"
          fill
          className="object-cover object-[center_20%]"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-dark/80 via-brand-dark/20 to-transparent" />
        <div className="absolute inset-0 flex flex-col justify-end px-5 py-10 sm:px-8 sm:py-12 lg:px-12 lg:py-16">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight drop-shadow-lg">
            Our story
          </h1>
          <p className="mt-2 text-lg sm:text-xl text-white/95 max-w-xl">
            The crew behind {brand.companyName} – Lake Travis & Lake Austin, done right.
          </p>
        </div>
      </section>

      {/* Story content */}
      <section className="section-padding bg-brand-bg/50">
        <div className="container-narrow mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-none">
            <p className="text-xl sm:text-2xl text-brand-dark font-medium leading-relaxed mb-8">
              We&apos;re a local Austin crew who grew up on Lake Travis and wanted to share the best of the lake with visitors and locals alike.
            </p>
            <p className="text-brand-muted leading-relaxed mb-6">
              Boat Bros started with a simple idea: make it easy to book a great day on the water. No hassle, no hidden fees—just solid boats, clear pricing, and a team that shows up. We offer pontoons for parties, tow boats for wake and surf, and sunset cruises for anyone who wants to unwind with a view.
            </p>
            <p className="text-brand-muted leading-relaxed mb-6">
              Every rental includes life vests, safety briefing, and support if you need it. We&apos;re licensed and insured, and we work with captains who know the lake. Whether you&apos;re planning a family day, a bachelor party, or a corporate outing, we&apos;re here to make it smooth.
            </p>
            <p className="text-brand-muted leading-relaxed mb-10">
              Austin and Lake Travis are our backyard. When you book with us, you&apos;re getting a team that cares about your day—and the lake we all love.
            </p>
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 pt-4">
            <Button asChild size="lg" className="rounded-xl shadow-soft">
              <Link href="/book">Check Availability</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-xl border-brand-primary text-brand-dark hover:bg-brand-primary/10">
              <Link href="/contact">Contact us</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
