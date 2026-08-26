"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { brand } from "@/content/brand";
import { siteConfig } from "@/config/site";

const WELCOME_PHOTO = siteConfig.media.welcome;

/**
 * Welcome + hospitality in one split — who we are and how we host.
 */
export function HomeWelcome() {
  return (
    <section
      className="section-padding bg-white"
      aria-labelledby="home-welcome-heading"
    >
      <div className="container-wide px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10 xl:gap-14 items-center max-w-6xl mx-auto">
          <motion.div
            className="max-w-xl mx-auto lg:mx-0 text-center lg:text-left order-2 lg:order-1"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.4 }}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-secondary mb-3">
              Family owned · Lake Tahoe locals
            </p>
            <h2
              id="home-welcome-heading"
              className="font-display text-3xl sm:text-4xl font-bold text-brand-dark tracking-tight"
            >
              We&apos;re {brand.companyName}.
            </h2>
            <p className="mt-4 text-base sm:text-lg text-brand-muted leading-relaxed">
              Brothers Jarod and Bobby Minghini grew up on this lake. For 10+ years we&apos;ve been
              sharing South Lake Tahoe with gas included, toys on every boat, and local knowledge you
              can&apos;t get from an app — departing from Tahoe Keys Marina.
            </p>
            <p className="mt-4 text-base sm:text-lg text-brand-muted leading-relaxed">
              Party barges, wakesurf charters, and luxury tritoons for groups of 2 to 40+. Birthdays,
              bachelorettes, weddings, corporate days — we&apos;ve done it all.
            </p>
            <p className="mt-4 text-base sm:text-lg text-brand-muted leading-relaxed">
              Show up 20 minutes early, get a quick safety briefing, and the lake is yours.
            </p>
            <div className="mt-7 sm:mt-8 flex flex-col sm:flex-row flex-wrap items-center lg:items-stretch justify-center lg:justify-start gap-3">
              <Link
                href="/our-story"
                className="inline-flex items-center justify-center rounded-xl bg-brand-primary px-6 py-3.5 text-sm font-bold text-brand-dark transition-transform duration-200 hover:scale-[1.02] hover:brightness-105 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
              >
                Read our story
              </Link>
              <Link
                href="/experiences"
                className="inline-flex items-center justify-center rounded-xl border-2 border-brand-dark/15 px-6 py-3.5 text-sm font-semibold text-brand-dark transition-colors hover:bg-brand-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
              >
                See the fleet
              </Link>
            </div>
          </motion.div>

          <motion.div
            className="relative aspect-[4/5] sm:aspect-[5/6] lg:aspect-[4/5] max-h-[560px] w-full overflow-hidden rounded-2xl bg-brand-dark ring-1 ring-brand-dark/10 shadow-soft-lg mx-auto lg:mx-0 order-1 lg:order-2"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.45, delay: 0.05 }}
          >
            <Image
              src={WELCOME_PHOTO}
              alt={`${brand.companyName} — welcome aboard`}
              fill
              className="object-cover object-[center_30%]"
              sizes="(max-width: 1024px) 92vw, 44vw"
            />
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-brand-dark/20 via-transparent to-transparent"
              aria-hidden
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
