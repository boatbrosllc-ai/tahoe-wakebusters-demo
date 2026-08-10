import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { inquiryPackages, INQUIRY_PARTNER_DISCLAIMER } from "@/content/inquiry-packages";

const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://nastysportfishing.com").replace(/\/+$/, "");
const canonical = `${baseUrl}/packages`;

export const metadata: Metadata = {
  title: "Cabo Multi-Day Packages | Inquiry Only | Nasty Sport Fishing",
  description:
    "Bachelor Blowout, Corporate Retreat, Nasty Cabo Week, and Tournament Week — coordinated Cabo packages. Inquiry only; partner-fulfilled lodging and logistics.",
  alternates: { canonical },
};

function packageMeta(pkg: (typeof inquiryPackages)[number]): string {
  return [pkg.guests, pkg.nights, pkg.fishingDays, pkg.boats].filter(Boolean).join(" · ");
}

export default function PackagesInquiryPage() {
  return (
    <div className="bg-brand-dark min-h-screen">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0" aria-hidden>
          <Image
            src="/photos/stock/cabo/aerial-lands-end-clark.jpg"
            alt=""
            fill
            className="object-cover object-center opacity-30"
            sizes="100vw"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-b from-brand-dark/70 via-brand-dark/88 to-brand-dark" />
        </div>

        <div className="relative section-padding">
          <div className="container-wide px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.2em] text-brand-primary mb-3">
              Inquiry only
            </p>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-white tracking-tight mb-4">
              Multi-day Cabo packages
            </h1>
            <p className="text-lg text-white/75 max-w-2xl mb-4 leading-relaxed">
              Marketing quote packages — not online charter inventory. Day trips still book through Nasty Half Day and
              Nasty Full Day on the shared boat calendar.
            </p>
            <p className="text-sm text-white/45 max-w-2xl mb-12 sm:mb-16 leading-relaxed">{INQUIRY_PARTNER_DISCLAIMER}</p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-white/10 rounded-2xl overflow-hidden ring-1 ring-white/10 mb-12">
              {inquiryPackages.map((pkg) => (
                <article key={pkg.id} className="bg-brand-dark/85 p-6 sm:p-8 flex flex-col">
                  <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">{pkg.title}</h2>
                  <p className="mt-2 text-sm text-white/55">{packageMeta(pkg)}</p>
                  <p className="mt-5 font-display text-xl sm:text-2xl font-semibold text-brand-primary tabular-nums">
                    {pkg.fromPriceLabel}
                  </p>
                  <p className="mt-3 text-white/80 leading-relaxed">{pkg.description}</p>
                  <p className="mt-3 text-sm text-white/45 leading-relaxed">{pkg.includesHint}</p>
                  <Link
                    href={`/contact?topic=package&package=${encodeURIComponent(pkg.id)}`}
                    className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-white/80 hover:text-brand-primary transition-colors w-fit"
                  >
                    Request this quote
                    <ArrowUpRight className="h-4 w-4" aria-hidden />
                  </Link>
                </article>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/contact?topic=package"
                className="inline-flex rounded-xl bg-brand-primary px-6 py-3.5 text-sm font-bold text-white shadow-[0_8px_28px_rgba(20,182,220,0.28)] hover:brightness-110 transition-[filter]"
              >
                Request a quote
              </Link>
              <Link
                href="/experiences"
                className="inline-flex rounded-xl border border-white/25 px-6 py-3.5 text-sm font-semibold text-white/90 hover:bg-white/10 transition-colors"
              >
                Book a day charter
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
