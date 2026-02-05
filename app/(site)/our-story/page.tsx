import type { Metadata } from "next";
import { brand } from "@/content/brand";
import { BookingCTA } from "@/components/site/BookingCTA";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Our Story | Lake Travis & Lake Austin Boat Rentals",
  description: `Meet the crew behind ${brand.companyName}. Local Austin team, premium boats on Lake Travis and Lake Austin.`,
};

export default function OurStoryPage() {
  return (
    <div className="section-padding bg-white">
      <div className="container-narrow px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-brand-dark mb-6">
          Our story
        </h1>
        <div className="prose prose-lg text-brand-muted max-w-none">
          <p className="text-xl text-brand-muted mb-6">
            We&apos;re a local Austin crew who grew up on Lake Travis and wanted to share the best of the lake with visitors and locals alike.
          </p>
          <p className="mb-6">
            Boat Bros started with a simple idea: make it easy to book a great day on the water. No hassle, no hidden fees—just solid boats, clear pricing, and a team that shows up. We offer pontoons for parties, tow boats for wake and surf, and sunset cruises for anyone who wants to unwind with a view.
          </p>
          <p className="mb-6">
            Every rental includes life vests, safety briefing, and support if you need it. We&apos;re licensed and insured, and we work with captains who know the lake. Whether you&apos;re planning a family day, a bachelor party, or a corporate outing, we&apos;re here to make it smooth.
          </p>
          <p className="mb-8">
            Austin and Lake Travis are our backyard. When you book with us, you&apos;re getting a team that cares about your day—and the lake we all love.
          </p>
        </div>
        <div className="flex flex-wrap gap-4">
          <Button asChild size="lg" className="rounded-xl">
            <Link href="/book">Check Availability</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="rounded-xl">
            <Link href="/contact">Contact us</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
