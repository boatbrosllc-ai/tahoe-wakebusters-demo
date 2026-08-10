"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { brand } from "@/content/brand";
import { BookingCTA } from "@/components/site/BookingCTA";

const CREW_PHOTO = "/photos/nsf/our-story-crew.jpg";
const HERO_PHOTO = "/photos/nsf/rods-wake-sunset.png";
const WATER_PHOTO = "/photos/nsf/sportfisher-running.png";
const CATCH_PHOTO = "/photos/nsf/yellowfin-ocean-duo.png";

const AROUND_FISHING = [
  "Getting to the marina",
  "Food and drinks",
  "Cleaning your catch",
  "Vacuum sealing it",
  "Getting your fish back home",
  "Capturing the day properly",
] as const;

const DECK_MOMENTS = [
  "Marlin beside the boat.",
  "Yellowfin hitting the deck.",
  "Dorado lighting up electric blue and gold.",
  "A screaming reel while everyone onboard knows something big just ate.",
] as const;

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
      {/* Hero — brand first, one job */}
      <section className="relative w-full min-h-[85dvh] sm:min-h-[75vh] overflow-hidden flex flex-col items-center justify-center">
        <Image
          src={HERO_PHOTO}
          alt="Sportfishing rods and wake at sunset off Cabo San Lucas"
          fill
          className="object-cover object-[center_45%]"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-dark via-brand-dark/55 to-brand-dark/20" />
        <div
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(242,122,10,0.2),_transparent_55%)]"
          aria-hidden
        />

        <div className="relative z-10 w-full px-5 sm:px-8 lg:px-12 py-28 sm:py-24 flex flex-col items-center text-center">
          <div className="w-full max-w-3xl mx-auto flex flex-col items-center text-center">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="mb-6 sm:mb-8 flex w-full justify-center"
            >
              <Image
                src={brand.logoHeroPath}
                alt={brand.logoAlt}
                width={280}
                height={90}
                className="h-14 sm:h-16 lg:h-[4.5rem] w-auto drop-shadow-lg"
                priority
              />
            </motion.div>

            <motion.h1
              className="font-display text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-white tracking-tight"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.08 }}
            >
              Our Story
            </motion.h1>

            <motion.p
              className="mt-4 sm:mt-5 text-base sm:text-lg lg:text-xl text-white/85 max-w-lg mx-auto leading-relaxed"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.14 }}
            >
              Come to Cabo to fish. We&apos;ll handle the rest.
            </motion.p>

            <motion.div
              className="mt-8 sm:mt-10 flex flex-wrap items-center justify-center gap-3"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
            >
              <BookingCTA
                source="our_story_hero"
                page="our-story"
                variant="secondary"
                showCall={false}
                onDark
                primaryHint=""
                callHint=""
                className="!w-auto inline-flex justify-center [&>div]:justify-center [&_button]:!flex-none [&_a]:!flex-none"
              />
              <a
                href="#crew"
                className="inline-flex items-center justify-center rounded-xl border border-white/35 px-6 py-3.5 text-sm font-semibold text-white/95 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
              >
                The proof is on deck
              </a>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Opening — editorial column */}
      <section className="section-padding bg-brand-bg" aria-labelledby="why-nasty-heading">
        <div className="container-wide px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto">
            <FadeIn>
              <SectionEyebrow>Why we exist</SectionEyebrow>
              <h2
                id="why-nasty-heading"
                className="font-display text-3xl sm:text-4xl lg:text-[2.65rem] font-bold text-brand-dark tracking-tight leading-[1.15]"
              >
                We didn&apos;t come to Cabo to build another fishing charter.
              </h2>
            </FadeIn>

            <FadeIn delay={0.05} className="mt-8 space-y-6 text-base sm:text-lg text-brand-muted leading-relaxed">
              <p>
                We built <strong className="font-semibold text-brand-dark">{brand.companyName}</strong> because
                too many fishing trips in Cabo feel exactly the same.
              </p>
              <p className="border-l-2 border-brand-secondary/70 pl-5 text-brand-dark/85">
                Meet at the marina. Get shuffled onto a boat. Troll around for a few hours. Take a picture.
                Head back in.
              </p>
              <p>That wasn&apos;t what we wanted.</p>
              <p>
                We wanted to build the kind of charter we would actually book ourselves: a private boat, a
                serious crew, great equipment, aggressive fishing, and an entire experience built around one
                thing.
              </p>
            </FadeIn>

            <FadeIn delay={0.1} className="mt-10 pt-8 border-t border-brand-dark/10">
              <p className="font-display text-3xl sm:text-4xl font-bold text-brand-dark tracking-tight">
                Getting you on fish.
              </p>
              <p className="mt-5 text-base sm:text-lg text-brand-muted leading-relaxed">
                Cabo San Lucas is one of the greatest sportfishing destinations on the planet. Marlin,
                yellowfin tuna, dorado, wahoo and more move through these waters every year, and when the bite
                turns on, there are few places like it. We believe the charter should live up to the fishery.
              </p>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* Built around the bite — navy split: headline + beats */}
      <section className="relative overflow-hidden bg-brand-dark" aria-labelledby="bite-heading">
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
                <SectionEyebrow>How we fish</SectionEyebrow>
                <h2
                  id="bite-heading"
                  className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight leading-tight"
                >
                  Built around the bite.
                </h2>
                <p className="mt-5 text-base sm:text-lg text-white/70 leading-relaxed">
                  Every trip starts with the conditions. There is no canned sightseeing route.
                </p>
              </FadeIn>

              <FadeIn delay={0.08} className="lg:col-span-7 space-y-6 text-base sm:text-lg text-white/75 leading-relaxed">
                <p>
                  Where are the fish moving? What has been biting? What are the water temperatures doing? Are
                  we running the Pacific side, the Sea of Cortez, the banks, or pushing farther offshore?
                </p>
                <p>
                  Our captain and crew build the day around what gives you the best opportunity to catch fish.
                  Sometimes that means chasing marlin. Sometimes it means finding schools of yellowfin and
                  turning the deck into absolute chaos.
                </p>
                <p className="pt-2 font-display text-xl sm:text-2xl font-bold text-white tracking-tight">
                  That is fishing. And that is exactly why we built Nasty.
                </p>
              </FadeIn>
            </div>
          </div>
        </div>
      </section>

      {/* Private boat — photo + copy */}
      <section className="section-padding bg-white" aria-labelledby="private-heading">
        <div className="container-wide px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 xl:gap-16 items-center max-w-6xl mx-auto">
            <FadeIn className="relative aspect-[4/5] max-h-[540px] w-full overflow-hidden rounded-2xl bg-brand-dark ring-1 ring-brand-dark/10 shadow-soft-lg order-1 lg:order-1 mx-auto lg:mx-0">
              <Image
                src={CATCH_PHOTO}
                alt="Guest and crew with a yellowfin tuna offshore after a Cabo charter"
                fill
                className="object-cover object-[center_22%]"
                sizes="(max-width: 1024px) 92vw, 44vw"
              />
            </FadeIn>

            <FadeIn delay={0.06} className="max-w-xl mx-auto lg:mx-0 order-2 text-center lg:text-left">
              <SectionEyebrow>How we run it</SectionEyebrow>
              <h2
                id="private-heading"
                className="font-display text-3xl sm:text-4xl font-bold text-brand-dark tracking-tight leading-tight"
              >
                Private boat. Your crew. Your day.
              </h2>
              <div className="mt-5 sm:mt-6 space-y-5 text-base sm:text-lg text-brand-muted leading-relaxed">
                <p>
                  Nasty Sport Fishing is built around{" "}
                  <strong className="font-semibold text-brand-dark">private Cabo charters</strong>. You
                  aren&apos;t sharing the boat with strangers. You aren&apos;t fighting six other groups for
                  space on the rail.
                </p>
                <p className="font-display text-xl sm:text-2xl font-bold text-brand-dark tracking-tight leading-snug">
                  When you book Nasty, the boat is yours.
                  <span className="block mt-1 text-lg sm:text-xl font-semibold text-brand-muted">
                    Your captain. Your crew. Your fishing plan.
                  </span>
                </p>
                <p>
                  Whether you&apos;re an experienced offshore angler looking for a trophy fish or you&apos;re
                  bringing your family offshore for the first time, we adjust the trip around you without
                  watering down the experience.
                </p>
                <p>
                  We handle the boat, tackle, bait, ice, safety and strategy.{" "}
                  <strong className="font-semibold text-brand-dark">You show up ready to fish.</strong>
                </p>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* Complete experience — light blue + amenity grid */}
      <section className="section-padding bg-brand-bg" aria-labelledby="complete-heading">
        <div className="container-wide px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-start">
              <FadeIn className="lg:col-span-5">
                <SectionEyebrow>The full experience</SectionEyebrow>
                <h2
                  id="complete-heading"
                  className="font-display text-3xl sm:text-4xl font-bold text-brand-dark tracking-tight leading-tight"
                >
                  More than the hours on the water.
                </h2>
                <p className="mt-5 text-base sm:text-lg text-brand-muted leading-relaxed">
                  We also wanted to fix something else about the traditional charter experience: everything
                  surrounding the fishing. Those things shouldn&apos;t become your problem after an incredible
                  day offshore.
                </p>
                <p className="mt-5 text-base sm:text-lg text-brand-muted leading-relaxed">
                  Nasty is being built as a{" "}
                  <strong className="font-semibold text-brand-dark">complete sportfishing experience</strong>,
                  not simply a boat rental. From the moment you book to the moment your fish is packed and
                  your photos are on your phone, we want the entire experience to feel simple, premium and
                  handled.
                </p>
              </FadeIn>

              <FadeIn delay={0.08} className="lg:col-span-7">
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 list-none p-0 m-0">
                  {AROUND_FISHING.map((item, i) => (
                    <li
                      key={item}
                      className="flex items-start gap-3 rounded-xl bg-white px-5 py-4 ring-1 ring-brand-dark/8 shadow-sm"
                    >
                      <span className="mt-0.5 font-display text-sm font-bold text-brand-secondary tabular-nums">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="text-[15px] sm:text-base font-medium text-brand-dark leading-snug">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </FadeIn>
            </div>
          </div>
        </div>
      </section>

      {/* Proof on deck — full-bleed photo + condensed copy */}
      <section
        id="crew"
        className="relative scroll-mt-24 bg-brand-dark overflow-hidden"
        aria-labelledby="crew-heading"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 min-h-[68vh] lg:min-h-[80vh]">
          <motion.div
            className="relative min-h-[48vh] sm:min-h-[56vh] lg:min-h-full"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-20px" }}
            transition={{ duration: 0.55 }}
          >
            <Image
              src={CREW_PHOTO}
              alt="Nasty Sport Fishing angler with twin yellowfin tuna on deck in Cabo"
              fill
              className="object-cover object-[center_20%]"
              sizes="(max-width: 1024px) 100vw, 50vw"
              priority
            />
          </motion.div>

          <div className="relative flex items-center px-5 sm:px-10 lg:px-14 xl:px-16 py-14 sm:py-16 lg:py-20">
            <div
              className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(242,122,10,0.16),_transparent_55%)]"
              aria-hidden
            />
            <FadeIn delay={0.05} className="relative max-w-md">
              <SectionEyebrow>The proof is on deck</SectionEyebrow>
              <h2
                id="crew-heading"
                className="font-display text-3xl sm:text-4xl lg:text-[2.75rem] font-bold text-white tracking-tight leading-[1.15]"
              >
                <span className="block">
                  This is what
                  {/* eslint-disable-next-line @next/next/no-img-element -- must stay truly inline with surrounding text */}
                  <img
                    src={brand.logoNavbarPath}
                    alt="Nasty"
                    width={200}
                    height={90}
                    className="inline h-[1.35em] w-auto align-baseline object-contain object-left ml-[0.08em] mr-[0.12em] relative top-[0.1em]"
                  />
                </span>
                <span className="block">looks like.</span>
              </h2>
              <p className="mt-5 text-base sm:text-lg text-white/70 leading-relaxed">
                We can talk about boats, equipment and service all day. But ultimately there is only one thing
                that matters: what happens when the lines go in the water.
              </p>

              <ul className="mt-7 space-y-3 list-none p-0 m-0">
                {DECK_MOMENTS.map((line) => (
                  <li
                    key={line}
                    className="border-l-2 border-brand-secondary/80 pl-4 text-base sm:text-[17px] text-white/90 leading-snug"
                  >
                    {line}
                  </li>
                ))}
              </ul>

              <p className="mt-7 text-base sm:text-lg text-white/70 leading-relaxed">
                Those are the moments people fly to Cabo for. Those are the moments we built{" "}
                {brand.companyName} around.
              </p>

              <Link
                href="/experiences"
                className="mt-8 inline-flex items-center justify-center rounded-xl bg-brand-secondary px-6 py-3.5 text-sm font-bold text-white transition-transform duration-200 hover:scale-[1.02] hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
              >
                See Half Day &amp; Full Day
              </Link>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* Close */}
      <section className="section-padding bg-white" aria-labelledby="close-heading">
        <div className="container-wide px-4 sm:px-6 lg:px-8">
          <FadeIn className="max-w-2xl mx-auto text-center">
            <h2
              id="close-heading"
              className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-brand-dark tracking-tight"
            >
              Come to Cabo to fish.
            </h2>
            <p className="mt-5 text-base sm:text-lg text-brand-muted leading-relaxed">
              Not to take a boat ride. Not to get pushed through another tourist package. Come ready to chase
              something. We&apos;ll handle the rest.
            </p>
            <div className="mt-8 pt-8 border-t border-brand-dark/10">
              <p className="font-display text-xl sm:text-2xl font-bold text-brand-dark tracking-tight">
                This is {brand.companyName}.
              </p>
              <p className="mt-2 text-base sm:text-lg font-semibold text-brand-muted">
                Private Cabo charters. Serious fishing. No bullshit.
              </p>
            </div>
            <div className="mt-8 flex justify-center">
              <BookingCTA
                source="our_story_page"
                page="our-story"
                variant="secondary"
                showCall
                primaryHint="Instant confirmation · Easy reschedule"
                className="justify-center"
              />
            </div>
          </FadeIn>
        </div>
      </section>
    </div>
  );
}
