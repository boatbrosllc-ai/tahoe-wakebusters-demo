"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, Check } from "lucide-react";
import { brand } from "@/content/brand";
import { siteConfig } from "@/config/site";
import {
  inquiryPackages,
  INQUIRY_PARTNER_DISCLAIMER,
  PACKAGE_QUOTE_STEPS,
} from "@/content/inquiry-packages";

function packageMeta(pkg: (typeof inquiryPackages)[number]): string {
  return [pkg.guests, pkg.nights, pkg.fishingDays, pkg.boats].filter(Boolean).join(" · ");
}

export function PackagesPageClient() {
  return (
    <div className="min-h-screen w-full bg-brand-bg">
      {/* Hero — full-bleed, brand-first, centered */}
      <section className="relative w-full min-h-[88dvh] sm:min-h-[78vh] overflow-hidden flex flex-col items-center justify-center">
        <Image
          src={siteConfig.media.boats}
          alt="Private charter boat on the water"
          fill
          className="object-cover object-[center_35%]"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-dark via-brand-dark/55 to-brand-dark/25" />
        <div
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(242,122,10,0.28),_transparent_55%)]"
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

            <motion.p
              className="text-xs sm:text-sm font-semibold uppercase tracking-[0.22em] text-brand-secondary mb-3 text-center"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.06 }}
            >
              Inquiry only
            </motion.p>

            <motion.h1
              className="font-display text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-white tracking-tight text-center"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.1 }}
            >
              Multi-day packages
            </motion.h1>

            <motion.p
              className="mt-4 sm:mt-5 text-base sm:text-lg lg:text-xl text-white/85 max-w-xl mx-auto leading-relaxed text-center"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.16 }}
            >
              Bachelor, corporate, and week-long itineraries — coordinated by {brand.companyName}, quoted for your group.
            </motion.p>

            <motion.div
              className="mt-8 sm:mt-10 flex flex-wrap items-center justify-center gap-3 w-full"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.22 }}
            >
              <Link
                href="/contact?topic=package"
                className="inline-flex items-center justify-center rounded-xl bg-brand-secondary px-7 py-3.5 text-sm font-bold text-white shadow-[0_10px_32px_rgba(242,122,10,0.4)] transition-transform duration-200 hover:scale-[1.02] hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
              >
                Request a quote
              </Link>
              <a
                href="#packages"
                className="inline-flex items-center justify-center rounded-xl border border-white/35 px-6 py-3.5 text-sm font-semibold text-white/95 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
              >
                View packages
              </a>
            </motion.div>
          </div>
        </div>
      </section>

      {/* How quotes work */}
      <section className="section-padding bg-brand-bg" aria-labelledby="how-quotes-heading">
        <div className="container-wide px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-10 sm:mb-14">
            <h2
              id="how-quotes-heading"
              className="font-display text-3xl sm:text-4xl font-bold text-brand-dark tracking-tight"
            >
              How a package quote works
            </h2>
            <p className="mt-3 text-brand-muted text-base sm:text-lg leading-relaxed">
              These are not live calendar bookings. Day charters still book online as Half Day and Full Day.
            </p>
          </div>

          <ol className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10 max-w-5xl mx-auto list-none">
            {PACKAGE_QUOTE_STEPS.map((step, i) => (
              <motion.li
                key={step.title}
                className="relative text-center md:text-left"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
              >
                <span className="font-display text-4xl sm:text-5xl font-bold text-brand-secondary/25 tabular-nums leading-none">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-3 font-display text-xl font-bold text-brand-dark tracking-tight">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm sm:text-base text-brand-muted leading-relaxed">{step.body}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* Package grid */}
      <section
        id="packages"
        className="relative overflow-hidden bg-brand-dark section-padding scroll-mt-24"
        aria-labelledby="packages-heading"
      >
        <div className="absolute inset-0" aria-hidden>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(242,122,10,0.18),_transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(20,182,220,0.1),_transparent_45%)]" />
        </div>

        <div className="relative container-wide px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-10 sm:mb-14">
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.2em] text-brand-secondary mb-3">
              Quote packages
            </p>
            <h2
              id="packages-heading"
              className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight"
            >
              Choose your itinerary shape
            </h2>
            <div
              className="mx-auto mt-4 h-1 w-16 rounded-full bg-brand-secondary"
              aria-hidden
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6 max-w-6xl mx-auto">
            {inquiryPackages.map((pkg, i) => (
              <motion.article
                key={pkg.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-30px" }}
                transition={{ duration: 0.4, delay: Math.min(i * 0.06, 0.24) }}
                className="group flex flex-col overflow-hidden rounded-2xl bg-brand-bg ring-1 ring-white/15 transition-[box-shadow,transform] duration-300 hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(0,0,0,0.35)] hover:ring-brand-secondary/45"
              >
                <div className="relative aspect-[3/2] overflow-hidden">
                  <Image
                    src={pkg.image}
                    alt={pkg.imageAlt}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                    style={pkg.imagePosition ? { objectPosition: pkg.imagePosition } : undefined}
                    sizes="(max-width: 1024px) 100vw, 50vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-brand-dark/80 via-brand-dark/20 to-transparent" />
                  <p className="absolute bottom-3 left-4 right-4 font-display text-lg sm:text-xl font-semibold text-brand-secondary tabular-nums drop-shadow">
                    {pkg.fromPriceLabel}
                  </p>
                </div>

                <div className="flex flex-1 flex-col p-5 sm:p-7">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display text-2xl sm:text-[1.7rem] font-bold text-brand-dark tracking-tight leading-tight">
                        {pkg.title}
                      </h3>
                      <p className="mt-1.5 text-sm text-brand-muted tracking-wide">{packageMeta(pkg)}</p>
                    </div>
                    <ArrowUpRight
                      className="h-5 w-5 shrink-0 text-brand-secondary/80 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-brand-secondary"
                      aria-hidden
                    />
                  </div>

                  <p className="mt-4 text-base font-semibold text-brand-dark leading-snug">{pkg.hook}</p>
                  <p className="mt-2 text-sm sm:text-base text-brand-muted leading-relaxed">{pkg.description}</p>

                  <ul className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2 list-none">
                    {pkg.highlights.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-brand-muted">
                        <Check
                          className="mt-0.5 h-4 w-4 shrink-0 text-brand-secondary"
                          aria-hidden
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={`/contact?topic=package&package=${encodeURIComponent(pkg.id)}`}
                    className="mt-6 inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-brand-secondary px-5 py-3 text-sm font-bold text-white transition-transform duration-200 hover:scale-[1.02] hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg"
                    aria-label={`${pkg.title} — request a quote`}
                  >
                    Request this quote
                    <ArrowUpRight className="h-4 w-4" aria-hidden />
                  </Link>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* Coordinated for you */}
      <section className="section-padding bg-white" aria-labelledby="coordinated-heading">
        <div className="container-wide px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <motion.div
              className="relative aspect-[4/3] overflow-hidden rounded-2xl"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.45 }}
            >
              <Image
                src={siteConfig.media.boats}
                alt={`${brand.companyName} on the water`}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.45, delay: 0.08 }}
            >
              <h2
                id="coordinated-heading"
                className="font-display text-3xl sm:text-4xl font-bold text-brand-dark tracking-tight"
              >
                One crew. Partner logistics.
              </h2>
              <p className="mt-4 text-base sm:text-lg text-brand-muted leading-relaxed">
                Charter days run with {brand.companyName}. Lodging, transport, meals, and other third-party pieces are
                coordinated by us and fulfilled by vetted local partners — so your group gets one plan,
                not a stack of vendors.
              </p>
              <p className="mt-4 text-sm text-brand-muted/80 leading-relaxed">{INQUIRY_PARTNER_DISCLAIMER}</p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden bg-brand-dark section-padding">
        <div
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(242,122,10,0.2),_transparent_60%)]"
          aria-hidden
        />
        <div className="relative container-wide px-4 sm:px-6 lg:px-8 text-center max-w-2xl mx-auto">
          <motion.h2
            className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight"
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.4 }}
          >
            Ready to plan the trip?
          </motion.h2>
          <motion.p
            className="mt-4 text-base sm:text-lg text-white/75 leading-relaxed"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.35, delay: 0.06 }}
          >
            Send dates and headcount — we&apos;ll come back with a clear package quote. Need a single day on
            the water instead? Book Half Day or Full Day online.
          </motion.p>
          <motion.div
            className="mt-8 flex flex-wrap items-center justify-center gap-3"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.35, delay: 0.1 }}
          >
            <Link
              href="/contact?topic=package"
              className="inline-flex items-center justify-center rounded-xl bg-brand-secondary px-7 py-3.5 text-sm font-bold text-white shadow-[0_10px_32px_rgba(242,122,10,0.4)] transition-transform duration-200 hover:scale-[1.02] hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
            >
              Request a package quote
            </Link>
            <Link
              href="/experiences"
              className="inline-flex items-center justify-center rounded-xl border border-white/30 px-6 py-3.5 text-sm font-semibold text-white/90 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
            >
              Book a day charter
            </Link>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
