"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";

const SECTION_PHOTO = "/photos/nsf/yellowfin-ocean-duo.png";

/**
 * What guests can expect — we handle the details; customer experience is the priority.
 */
export function HomeOurBoats() {
  return (
    <section className="section-padding bg-white" aria-labelledby="what-to-expect-heading">
      <div className="container-wide px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10 xl:gap-14 items-center max-w-6xl mx-auto">
          <motion.div
            className="relative aspect-[4/5] sm:aspect-[5/6] lg:aspect-[4/5] max-h-[560px] w-full overflow-hidden rounded-2xl bg-brand-dark ring-1 ring-brand-dark/10 shadow-soft-lg mx-auto lg:mx-0"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.45 }}
          >
            <Image
              src={SECTION_PHOTO}
              alt="Guest and crew with a yellowfin tuna offshore after a Cabo charter"
              fill
              className="object-cover object-[center_22%]"
              sizes="(max-width: 1024px) 92vw, 44vw"
            />
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-brand-dark/25 via-transparent to-transparent"
              aria-hidden
            />
          </motion.div>

          <motion.div
            className="max-w-xl mx-auto lg:mx-0 text-center lg:text-left lg:py-2"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.45, delay: 0.06 }}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-secondary mb-3 sm:mb-4">
              What to expect
            </p>
            <h2
              id="what-to-expect-heading"
              className="font-display text-3xl sm:text-4xl font-bold text-brand-dark tracking-tight leading-tight"
            >
              We take care of everything.
            </h2>
            <p className="mt-4 sm:mt-5 text-base sm:text-lg text-brand-muted leading-relaxed">
              Customer experience is our top priority. You show up ready to fish. We handle the rest:
              the plan for the day, lines, bait, tackle, safety, and the coaching on deck so nothing
              feels confusing or rushed.
            </p>
            <p className="mt-4 text-base sm:text-lg text-brand-muted leading-relaxed">
              Before you leave the dock, you&apos;ll know where we&apos;re headed and why. On the water,
              the captain and crew run the show. After the trip, we help with photos, fish care, and
              next steps so the day ends as clean as it started.
            </p>
            <p className="mt-4 text-base sm:text-lg text-brand-muted leading-relaxed">
              Questions before you book? We answer. Changes after you book? We work with you. Our
              standard is simple: every guest feels looked after from the first message to the last
              line in.
            </p>
            <div className="mt-7 sm:mt-8 flex flex-col sm:flex-row flex-wrap items-center lg:items-stretch justify-center lg:justify-start gap-3">
              <Link
                href="/experiences"
                className="inline-flex items-center justify-center rounded-xl bg-brand-primary px-6 py-3.5 text-sm font-bold text-brand-dark transition-transform duration-200 hover:scale-[1.02] hover:brightness-105 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
              >
                View charters
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center justify-center rounded-xl border-2 border-brand-dark/15 px-6 py-3.5 text-sm font-semibold text-brand-dark transition-colors hover:bg-brand-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
              >
                Ask a question
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
