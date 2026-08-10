"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { inquiryPackages, INQUIRY_PARTNER_DISCLAIMER } from "@/content/inquiry-packages";

function packageMeta(pkg: (typeof inquiryPackages)[number]): string {
  return [pkg.guests, pkg.nights, pkg.fishingDays, pkg.boats].filter(Boolean).join(" · ");
}

export function InquiryPackagesTeaser() {
  return (
    <section
      className="relative overflow-hidden bg-brand-dark section-padding"
      aria-labelledby="inquiry-packages-heading"
    >
      <div className="absolute inset-0" aria-hidden>
        <Image
          src="/photos/stock/cabo/aerial-lands-end-clark.jpg"
          alt=""
          fill
          className="object-cover object-[center_35%] opacity-[0.32]"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-brand-dark/80 via-brand-dark/90 to-brand-dark" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(242,122,10,0.22),_transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(242,122,10,0.12),_transparent_45%)]" />
      </div>

      <div className="relative container-wide px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center mb-10 sm:mb-14">
          <motion.p
            className="text-xs sm:text-sm font-semibold uppercase tracking-[0.2em] text-brand-secondary mb-3"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.35 }}
          >
            Inquiry only
          </motion.p>
          <motion.h2
            id="inquiry-packages-heading"
            className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.4, delay: 0.04 }}
          >
            Multi-day Cabo packages
          </motion.h2>
          <motion.div
            className="mx-auto mt-4 h-1 w-16 rounded-full bg-brand-secondary"
            initial={{ opacity: 0, scaleX: 0.6 }}
            whileInView={{ opacity: 1, scaleX: 1 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.35, delay: 0.06 }}
            aria-hidden
          />
          <motion.p
            className="mt-4 text-base sm:text-lg text-white/75 leading-relaxed"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.35, delay: 0.08 }}
          >
            Bachelor, corporate, and week-long itineraries. We coordinate partners — we don’t auto-book villa or multi-day inventory online.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-brand-secondary/25 rounded-2xl overflow-hidden ring-1 ring-brand-secondary/30 mb-10 sm:mb-12">
          {inquiryPackages.map((pkg, i) => (
            <motion.div
              key={pkg.id}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-30px" }}
              transition={{ duration: 0.4, delay: 0.05 * i }}
            >
              <Link
                href={`/contact?topic=package&package=${encodeURIComponent(pkg.id)}`}
                className="group relative flex h-full flex-col justify-between bg-brand-dark/85 backdrop-blur-[2px] p-6 sm:p-8 transition-colors duration-300 hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary focus-visible:ring-inset before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-brand-secondary/0 before:transition-colors before:duration-300 hover:before:bg-brand-secondary"
                aria-label={`${pkg.title} — request a quote`}
              >
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="font-display text-2xl sm:text-[1.65rem] font-bold text-white tracking-tight leading-tight">
                      {pkg.title}
                    </h3>
                    <ArrowUpRight
                      className="h-5 w-5 shrink-0 text-brand-secondary transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      aria-hidden
                    />
                  </div>
                  <p className="mt-2 text-sm text-white/55 tracking-wide">{packageMeta(pkg)}</p>
                  <p className="mt-5 font-display text-xl sm:text-2xl font-semibold text-brand-secondary tabular-nums">
                    {pkg.fromPriceLabel}
                  </p>
                  <p className="mt-3 text-sm sm:text-base text-white/80 leading-relaxed max-w-md">
                    {pkg.description}
                  </p>
                </div>
                <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-white transition-colors duration-300 group-hover:text-brand-secondary">
                  Request quote
                  <span className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden>
                    →
                  </span>
                </span>
              </Link>
            </motion.div>
          ))}
        </div>

        <motion.div
          className="flex flex-col items-center gap-5 text-center"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.35, delay: 0.12 }}
        >
          <p className="text-xs sm:text-sm text-white/45 max-w-2xl leading-relaxed">
            {INQUIRY_PARTNER_DISCLAIMER}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/contact?topic=package"
              className="inline-flex items-center justify-center rounded-xl bg-brand-secondary px-7 py-3.5 text-sm font-bold text-white shadow-[0_8px_28px_rgba(242,122,10,0.35)] transition-transform duration-200 hover:scale-[1.02] hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
            >
              Request a package quote
            </Link>
            <Link
              href="/packages"
              className="inline-flex items-center justify-center rounded-xl border border-brand-secondary/40 px-6 py-3.5 text-sm font-semibold text-white/90 transition-colors hover:bg-brand-secondary/15 hover:border-brand-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
            >
              View package details
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
