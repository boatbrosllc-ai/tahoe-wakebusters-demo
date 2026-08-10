"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { bundlePresets, type BundlePreset, type BundleId } from "@/content/bundle-presets";
import {
  FOUNDING_ANGLER_LABEL,
  FOUNDING_ANGLER_RATE_ACTIVE,
} from "@/content/catalog-pricing";
import { useBookingModal } from "@/components/site/BookingModalContext";
import { cn, getDisplayImageUrl } from "@/lib/utils";

/** Fishing / catch imagery for package cards — not the boat listing photo. */
const PACKAGE_FISHING_HEROES: Record<BundleId, string> = {
  nasty: "/photos/nsf/yellowfin-marina-duo.png",
  nastier: "/photos/nsf/yellowfin-ocean-duo.png",
  nastiest: "/photos/nsf/sailfish-baitball.png",
};

type ListingPayload = {
  slug: string;
  title?: string;
  subtitle?: string;
  heroMedia?: { type?: "image" | "video"; url?: string };
  gallery?: string[];
  fromPriceCents?: number | null;
  pricingType?: "charter" | "ticketed";
};

function packageHero(bundle: BundlePreset): string {
  return PACKAGE_FISHING_HEROES[bundle.id] ?? "/photos/nsf/yellowfin-marina-catch.png";
}

/**
 * Homepage package ladder: Nasty (Half) → Nastier (Full) → Nastiest (Full all-in).
 * Each card books one real charter; Nasty/Nastier leave add-ons a la carte.
 */
export function BundleChooser({ initialListings: _initialListings = [] }: { initialListings?: ListingPayload[] }) {
  const { openWithSelection } = useBookingModal();

  const startBooking = (bundle: BundlePreset) => {
    const option = bundle.charterOptions[bundle.defaultOptionIndex] ?? bundle.charterOptions[0];
    if (!option) return;
    openWithSelection({
      experienceSlug: option.experienceSlug,
      durationHours: option.durationHours,
      bookingMode: "charter",
      pricingType: "charter",
      addonCatalogKeys: bundle.addonCatalogKeys,
    });
  };

  return (
    <section className="section-padding bg-brand-bg" aria-labelledby="how-nasty-heading">
      <div className="container-wide px-4 sm:px-6 lg:px-8">
        <motion.h2
          id="how-nasty-heading"
          className="text-3xl sm:text-4xl lg:text-5xl font-bold text-brand-dark text-center mb-3"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4 }}
        >
          Choose how nasty you want to get
        </motion.h2>
        <motion.p
          className="text-center text-brand-muted max-w-2xl mx-auto mb-8 sm:mb-10"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.35, delay: 0.05 }}
        >
          Same private boat. Three packages — Half Day, Full Day, or Full Day all-in. Add-ons are a la carte on Nasty and Nastier.
        </motion.p>

        {FOUNDING_ANGLER_RATE_ACTIVE && (
          <p className="text-center text-sm font-semibold tracking-wide text-brand-secondary mb-6">
            {FOUNDING_ANGLER_LABEL}
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 lg:gap-6 overflow-visible pt-10 sm:pt-12">
          {bundlePresets.map((bundle, i) => {
            const hero = packageHero(bundle);
            const tripLabel = bundle.charterOptions[0]?.label ?? bundle.tagline;
            const isNastiest = bundle.id === "nastiest";
            return (
              <motion.article
                key={bundle.id}
                className={cn(
                  "group relative flex flex-col overflow-visible",
                  isNastiest && "z-20"
                )}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-30px" }}
                transition={{ duration: 0.35, delay: 0.05 * i }}
              >
                <div
                  className={cn(
                    "relative flex flex-1 flex-col overflow-visible rounded-2xl bg-white border-2 transition-shadow",
                    bundle.recommended
                      ? "border-brand-primary shadow-lg shadow-brand-primary/15 ring-1 ring-brand-primary/25 md:-translate-y-1"
                      : "border-brand-dark/10 shadow-sm"
                  )}
                >
                  {isNastiest && (
                    <div
                      className="pointer-events-none absolute top-0 right-0 z-30 h-40 w-40 sm:h-52 sm:w-52 lg:h-64 lg:w-64 translate-x-[28%] -translate-y-1/2 rotate-[16deg] transition-transform duration-500 ease-out group-hover:scale-105 group-hover:rotate-[20deg]"
                      aria-hidden
                    >
                      <Image
                        src="/photos/most-popular.png"
                        alt=""
                        fill
                        className="object-contain drop-shadow-xl transition-[filter] duration-500 group-hover:drop-shadow-2xl"
                        sizes="(max-width: 640px) 160px, (max-width: 1024px) 208px, 256px"
                      />
                    </div>
                  )}

                  <div className="relative aspect-[16/10] overflow-hidden rounded-t-2xl bg-brand-dark">
                    <Image
                      src={getDisplayImageUrl(hero)}
                      alt=""
                      fill
                      className="object-cover object-center"
                      sizes="(max-width: 768px) 100vw, 33vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    <div className="absolute bottom-3 left-3 right-3 z-10">
                      <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">
                        {bundle.tagline}
                      </p>
                      <h3 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
                        {bundle.title}
                      </h3>
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col overflow-hidden rounded-b-2xl p-5 sm:p-6">
                    <p className="text-sm text-brand-muted leading-relaxed">{bundle.description}</p>
                    <p className="mt-4 text-xl font-bold text-brand-dark tabular-nums">{bundle.fromPriceLabel}</p>
                    <p className="mt-1 text-xs text-brand-muted">{tripLabel}</p>

                    <ul className="mt-5 space-y-2.5 flex-1">
                      {bundle.includes.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-sm text-brand-dark/90">
                          <Check className="h-4 w-4 shrink-0 text-brand-primary mt-0.5" aria-hidden />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      type="button"
                      onClick={() => startBooking(bundle)}
                      className={cn(
                        "mt-6 inline-flex w-full items-center justify-center rounded-xl px-6 py-3.5 text-sm font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2",
                        bundle.recommended
                          ? "bg-brand-primary text-white shadow-md shadow-brand-primary/25 hover:brightness-105"
                          : "bg-brand-dark text-white hover:bg-brand-dark/90"
                      )}
                    >
                      {bundle.ctaLabel}
                    </button>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>

        <p className="text-center text-xs text-brand-muted mt-6 max-w-lg mx-auto">
          Display prices are starting points. Your hold and Stripe charge use live rates
          {bundlePresets.some((b) => b.addonCatalogKeys.length > 0) ? " and selected add-ons" : ""}.
          {" "}
          <Link href="/experiences" className="text-brand-primary font-medium hover:underline">
            View charter details
          </Link>
        </p>
      </div>
    </section>
  );
}
