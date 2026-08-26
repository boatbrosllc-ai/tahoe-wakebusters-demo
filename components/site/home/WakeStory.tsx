"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { brand } from "@/content/brand";
import { homepageCopy } from "@/content/homepage";
import { AnimatedTooltip } from "@/components/ui/animated-tooltip";

const founders = [
  {
    id: 1,
    name: "Jarod Minghini",
    designation: "Founder · Captain",
    image: "/photos/wakebusters/founder-wakesurf.jpg",
  },
  {
    id: 2,
    name: "Bobby Minghini",
    designation: "Founder · Captain",
    image: "/photos/wakebusters/founder-portrait.jpg",
  },
];

/**
 * Founders story — Jarod & Bobby, with hover portraits.
 */
export function WakeStory() {
  return (
    <section
      id="about"
      className="bg-white px-5 py-20 sm:px-8 sm:py-24 lg:px-14 xl:px-20"
      aria-label="Our story"
    >
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2 lg:items-center lg:gap-14">
        <div className="flex flex-col items-center pt-20 lg:items-start">
          <AnimatedTooltip
            items={founders}
            className="justify-center lg:justify-start"
            avatarClassName="h-44 w-44 border-4 sm:h-56 sm:w-56 lg:h-72 lg:w-72"
            itemClassName="-mr-12 sm:-mr-16 lg:-mr-20"
          />
          <p className="mt-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-brand-muted lg:text-left">
            Jarod &amp; Bobby · Founders
          </p>
        </div>

        <div className="max-w-xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-primary">
            {homepageCopy.story.eyebrow}
          </p>
          <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-brand-dark sm:text-4xl">
            {homepageCopy.story.h2}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-brand-muted sm:text-lg">
            We&apos;re Jarod and Bobby Minghini — Tahoe locals who grew up skiing this mountain in
            winter and living on this lake every summer. {brand.companyName} exists for one reason:
            give every guest the best possible day on the water.
          </p>

          <h3 className="mt-6 font-display text-lg font-extrabold text-brand-dark">
            {homepageCopy.story.notAnApp}
          </h3>
          <p className="mt-2 text-base leading-relaxed text-brand-muted sm:text-lg">
            Finest boats, everything included, honest prices, and cove knowledge no booking widget
            can fake. From Emerald Bay to Camp Richardson, we know where the day wants to go.
          </p>

          <h3 className="mt-6 font-display text-lg font-extrabold text-brand-dark">
            {homepageCopy.story.occasions}
          </h3>
          <p className="mt-2 text-base leading-relaxed text-brand-muted sm:text-lg">
            Birthdays, weddings, corporate outings, 4th of July chaos — groups of 2 to 40+, with
            single boats or the full fleet running together.
          </p>

          <Link
            href="/our-story"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-brand-dark px-6 py-3.5 text-sm font-bold text-white transition hover:bg-brand-dark/90"
          >
            More about us <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
