"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { brand } from "@/content/brand";
import { homepageCopy } from "@/content/homepage";
import { BookingCTA } from "@/components/site/BookingCTA";
import { LipScrollZoominAnimation } from "@/components/ui/lip-scroll-zoomin-animation";
import { LayeredText } from "@/components/ui/layered-text";
import { FoundersPhotos } from "@/components/site/FoundersPhotos";

const WATER_PHOTO = "/photos/wakebusters/tahoe-aerial.jpg";

const STORY_LAYERED_LINES = [
  { top: "\u00A0", bottom: "BROTHERS" },
  { top: "BROTHERS", bottom: "LOCALS" },
  { top: "LOCALS", bottom: "MAKE" },
  { top: "MAKE", bottom: "WAKES" },
  { top: "WAKES", bottom: "CREATE" },
  { top: "CREATE", bottom: "MEMORIES" },
  { top: "MEMORIES", bottom: "\u00A0" },
];

function FadeIn({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, delay }}
    >
      {children}
    </motion.div>
  );
}

function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex items-center gap-3 mb-4">
      <span className="h-px w-8 bg-brand-secondary" aria-hidden />
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-secondary">{children}</p>
    </div>
  );
}

export function OurStoryPageClient() {
  return (
    <div className="min-h-screen w-full bg-white">
      <LipScrollZoominAnimation
        title={homepageCopy.story.h2}
        watermark="TAHOE"
        posterSrc="/photos/wakebusters/tahoe-shoreline.jpg"
        imageAlt={homepageCopy.story.imageAlt}
        firstSlide={
          <div className="mx-auto flex w-full max-w-5xl flex-col items-center px-2 text-center sm:px-4">
            <h1 className="sr-only">{homepageCopy.story.h2}</h1>
            <LayeredText
              lines={STORY_LAYERED_LINES}
              className="font-display py-6 sm:py-8 md:py-10"
              color="#7dd3fc"
              activeColor="#ff6b2b"
              fontSize="68px"
              fontSizeMd="34px"
              lineHeight={56}
              lineHeightMd={34}
            />
            <p className="mt-2 max-w-3xl text-xs font-bold uppercase leading-relaxed tracking-wider text-white/90 sm:text-sm md:text-base">
              We&apos;re Jarod and Bobby Minghini — Tahoe locals who grew up skiing this mountain in
              winter and living on this lake every summer. Ten years of{" "}
              <span className="text-[#7dd3fc] font-black">Lake Tahoe boat rentals</span> from a
              family-owned crew. One flat rate. No hidden fuel charges.{" "}
              <span className="text-[#7dd3fc] font-black">USCG-certified captains</span> who know
              every cove from Emerald Bay to Camp Richardson.
            </p>
          </div>
        }
        outroTitle={
          <>
            Not an app.{" "}
            <span className="text-brand-primary font-black">A real crew</span> on a real lake.
          </>
        }
        outroSubtitle={
          <>
            Finest boats, everything included, honest prices, and cove knowledge no booking widget
            can fake. From{" "}
            <span className="text-brand-primary font-black">Emerald Bay</span> to Camp Richardson,
            we know where the day wants to go.
          </>
        }
      />

      <section className="section-padding bg-brand-bg" aria-labelledby="why-we-exist-heading">
        <div className="container-wide px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto">
            <FadeIn>
              <SectionEyebrow>Why we exist</SectionEyebrow>
              <h2
                id="why-we-exist-heading"
                className="font-display text-3xl sm:text-4xl lg:text-[2.65rem] font-bold text-brand-dark tracking-tight leading-[1.15]"
              >
                {brand.companyName} exists for one reason: give every guest the best possible day
                on the water.
              </h2>
            </FadeIn>

            <FadeIn delay={0.05} className="mt-8 space-y-6 text-base sm:text-lg text-brand-muted leading-relaxed">
              <p>
                Ten years of Lake Tahoe boat rentals from a family-owned crew who actually grew up
                on this water. One flat rate. No hidden fuel charges. USCG-certified captains who
                know every cove from Emerald Bay to Camp Richardson.
              </p>
              <p>
                Not an app. A real crew on a real lake. Finest boats, everything included, honest
                prices, and cove knowledge no booking widget can fake. From Emerald Bay to Camp
                Richardson, we know where the day wants to go.
              </p>
            </FadeIn>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-brand-dark" aria-labelledby="crew-lake-heading">
        <div className="absolute inset-0" aria-hidden>
          <Image
            src={WATER_PHOTO}
            alt=""
            fill
            className="object-cover object-center opacity-30"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-brand-dark via-brand-dark/92 to-brand-dark/80" />
        </div>

        <div className="relative section-padding">
          <div className="container-wide px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 max-w-6xl mx-auto">
              <FadeIn className="lg:col-span-5">
                <SectionEyebrow>How we run it</SectionEyebrow>
                <h2
                  id="crew-lake-heading"
                  className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight leading-tight"
                >
                  Not an app. A real crew on a real lake.
                </h2>
              </FadeIn>

              <FadeIn delay={0.08} className="lg:col-span-7 space-y-6 text-base sm:text-lg text-white/75 leading-relaxed">
                <p>
                  Finest boats, everything included, honest prices, and cove knowledge no booking
                  widget can fake. From Emerald Bay to Camp Richardson, we know where the day wants
                  to go.
                </p>
                <p>
                  Every charter runs with a USCG-certified captain — Tahoe locals who know which
                  cove is empty on a Saturday, where the wake is cleanest at 9 a.m., and exactly how
                  long you&apos;ve got before the wind comes up.
                </p>
              </FadeIn>
            </div>
          </div>
        </div>
      </section>

      <section
        id="crew"
        className="relative scroll-mt-28 bg-white"
        aria-labelledby="crew-heading"
      >
        <div className="section-padding">
          <div className="container-wide px-4 sm:px-6 lg:px-8">
            <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2 lg:items-center lg:gap-14">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.45 }}
              >
                <FoundersPhotos showCaptions sizes="(max-width: 1024px) 50vw, 28vw" />
              </motion.div>

              <FadeIn delay={0.05} className="max-w-md">
                <SectionEyebrow>Who we are</SectionEyebrow>
                <h2
                  id="crew-heading"
                  className="font-display text-3xl sm:text-4xl lg:text-[2.75rem] font-bold text-brand-dark tracking-tight leading-[1.15]"
                >
                  Jarod and Bobby Minghini
                </h2>
                <p className="mt-5 text-base sm:text-lg text-brand-muted leading-relaxed">
                  Tahoe locals who grew up skiing this mountain in winter and living on this lake
                  every summer. After ten years on the water, we still show up for one job: your best
                  day on Tahoe.
                </p>
                <p className="mt-5 text-base sm:text-lg text-brand-muted leading-relaxed">
                  Bachelorettes to board meetings. Birthdays, weddings, corporate outings, 4th of July
                  chaos — groups of 2 to 40+, with single boats or the full fleet running together.
                </p>

                <Link
                  href="/experiences"
                  className="mt-8 inline-flex items-center justify-center rounded-xl bg-brand-secondary px-6 py-3.5 text-sm font-bold text-white transition-transform duration-200 hover:scale-[1.02] hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary focus-visible:ring-offset-2"
                >
                  See the fleet
                </Link>
              </FadeIn>
            </div>
          </div>
        </div>
      </section>

      <section className="section-padding bg-white" aria-labelledby="close-heading">
        <div className="container-wide px-4 sm:px-6 lg:px-8">
          <FadeIn className="max-w-2xl mx-auto text-center">
            <h2
              id="close-heading"
              className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-brand-dark tracking-tight"
            >
              Ready to Book Your Lake Tahoe Boat Rental?
            </h2>
            <p className="mt-5 text-base sm:text-lg text-brand-muted leading-relaxed">
              Party barge, wakesurf charter, or luxury tritoon — reserve your day on Lake Tahoe with
              a captain who knows the water. Gas and toys included, no hidden fees.
            </p>
            <div className="mt-8 flex justify-center">
              <BookingCTA
                source="our_story_page"
                page="our-story"
                variant="secondary"
                showCall
                primaryHint="Instant confirmation · Easy reschedule · Flexible weather policy"
                className="justify-center"
              />
            </div>
          </FadeIn>
        </div>
      </section>
    </div>
  );
}
