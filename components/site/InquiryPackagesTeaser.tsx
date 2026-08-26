"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { inquiryPackages, INQUIRY_PARTNER_DISCLAIMER } from "@/content/inquiry-packages";
import { hasFeature } from "@/lib/plan";

function packageMeta(pkg: (typeof inquiryPackages)[number]): string {
  return [pkg.guests, pkg.nights, pkg.fishingDays, pkg.boats].filter(Boolean).join(" · ");
}

export function InquiryPackagesTeaser() {
  if (!hasFeature("packages")) return null;
  return (
    <section
      className="relative overflow-hidden bg-brand-dark section-padding"
      aria-labelledby="inquiry-packages-heading"
    >
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(242,122,10,0.12),_transparent_50%)]"
        aria-hidden
      />
      <div className="relative container-wide px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center mb-8 sm:mb-10">
          <motion.p
            className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-secondary mb-3"
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
            Multi-day packages
          </motion.h2>
          <motion.p
            className="mt-4 text-base sm:text-lg text-white/80 leading-relaxed"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.35, delay: 0.08 }}
          >
            Bachelor, corporate, and week-long itineraries. We coordinate partners. We don&apos;t
            auto-book villa or multi-day inventory online.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 max-w-5xl mx-auto mb-8 sm:mb-10">
          {inquiryPackages.map((pkg, i) => (
            <motion.div
              key={pkg.id}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-30px" }}
              transition={{ duration: 0.4, delay: Math.min(i * 0.06, 0.24) }}
            >
              <Link
                href={`/contact?topic=package&package=${encodeURIComponent(pkg.id)}`}
                className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white border border-white/10 shadow-sm transition-all duration-300 hover:border-brand-secondary/50 hover:shadow-lg hover:shadow-brand-secondary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
                aria-label={`${pkg.title} — request a quote`}
              >
                <div className="relative aspect-[3/2] overflow-hidden bg-brand-dark">
                  <Image
                    src={pkg.image}
                    alt=""
                    fill
                    className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                    style={pkg.imagePosition ? { objectPosition: pkg.imagePosition } : undefined}
                    sizes="(max-width: 768px) 100vw, 50vw"
                  />
                </div>

                <div className="relative flex flex-1 flex-col p-5 sm:p-6">
                  <p className="font-display text-base sm:text-lg font-semibold text-brand-secondary tabular-nums tracking-tight">
                    {pkg.fromPriceLabel}
                  </p>
                  <h3 className="mt-1 font-display text-xl sm:text-2xl font-bold text-brand-dark tracking-tight leading-tight">
                    {pkg.title}
                  </h3>
                  <p className="mt-2 text-sm sm:text-[15px] text-brand-muted leading-snug">{pkg.hook}</p>
                  <p className="mt-3 text-sm text-brand-muted/80">{packageMeta(pkg)}</p>
                  <span className="mt-auto pt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-dark transition-colors duration-300 group-hover:text-brand-secondary">
                    Request quote
                    <ArrowUpRight
                      className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      aria-hidden
                    />
                  </span>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        <motion.div
          className="flex flex-col items-center gap-5 text-center max-w-2xl mx-auto"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.35, delay: 0.1 }}
        >
          <p className="text-sm text-white/65 leading-relaxed">{INQUIRY_PARTNER_DISCLAIMER}</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/contact?topic=package"
              className="inline-flex items-center justify-center rounded-xl bg-brand-secondary px-7 py-3.5 text-sm font-bold text-white shadow-[0_8px_28px_rgba(242,122,10,0.35)] transition-transform duration-200 hover:scale-[1.02] hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
            >
              Request a package quote
            </Link>
            <Link
              href="/packages"
              className="inline-flex items-center justify-center rounded-xl border border-white/30 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
            >
              View package details
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
