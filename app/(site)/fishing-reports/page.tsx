import type { Metadata } from "next";
import { brand } from "@/content/brand";
import Image from "next/image";
import Link from "next/link";
import { PageBreadcrumbs } from "@/components/experience/PageBreadcrumbs";
import { SeoCheckAvailabilityCta } from "@/components/seo/SeoCheckAvailabilityCta";
import { getPublishedFishingReports } from "@/content/seo/fishing-reports";
import { articleJsonLd, breadcrumbJsonLd, buildSeoMetadata } from "@/lib/seo/metadata";

const path = "/fishing-reports";
const description =
  `Cabo fishing reports from ${brand.companyName} — real trip write-ups with photos as we publish them. No invented catches.`;

export const metadata: Metadata = buildSeoMetadata({
  path,
  title: "Cabo Fishing Reports",
  description,
  ogImage: "/photos/nsf/yellowfin-marina-duo.png",
  ogImageAlt: "Cabo fishing catch photos at the marina",
});

export default function FishingReportsHubPage() {
  const reports = getPublishedFishingReports();
  const crumbs = [
    { name: "Home", href: "/" },
    { name: "Fishing Reports", href: path },
  ];
  const schemas = [
    breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Fishing Reports", path },
    ]),
    articleJsonLd({
      headline: "Cabo Fishing Reports",
      description,
      path,
      image: "/photos/nsf/yellowfin-marina-duo.png",
    }),
  ];

  return (
    <article className="bg-white min-h-screen">
      {schemas.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
      <PageBreadcrumbs items={crumbs} />

      <header className="relative overflow-hidden bg-brand-dark">
        <div className="absolute inset-0" aria-hidden>
          <Image
            src="/photos/nsf/yellowfin-marina-duo.png"
            alt=""
            fill
            className="object-cover opacity-35"
            sizes="100vw"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-b from-brand-dark/70 via-brand-dark/85 to-brand-dark" />
        </div>
        <div className="relative container-wide px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20 max-w-4xl mx-auto text-center">
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
            Cabo Fishing Reports
          </h1>
          <p className="mt-4 text-base sm:text-lg text-white/80 leading-relaxed max-w-2xl mx-auto">
            First-party trip reports from {brand.companyName} days on the water — published only when we have a real
            Cabo day to share.
          </p>
          <div className="mt-8 max-w-md mx-auto">
            <SeoCheckAvailabilityCta page="fishing_reports" source="seo_hero" />
          </div>
        </div>
      </header>

      <div className="container-wide px-4 sm:px-6 lg:px-8 py-10 sm:py-14 max-w-3xl mx-auto">
        {reports.length === 0 ? (
          <div className="rounded-2xl border border-brand-dark/10 bg-brand-bg/60 px-6 py-10 text-center">
            <h2 className="font-display text-2xl font-bold text-brand-dark">Trip reports coming soon</h2>
            <p className="mt-3 text-brand-dark/80 leading-relaxed max-w-xl mx-auto">
              We&apos;ll publish real Cabo days with photos as we fish. Until then, this hub stays empty on purpose —
              no invented catches or borrowed highlight reels.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/experiences/nasty-half-day"
                className="inline-flex rounded-xl bg-brand-primary px-5 py-3 text-sm font-bold text-white hover:brightness-110 transition-[filter]"
              >
                Book Half Day
              </Link>
              <Link
                href="/experiences/nasty-full-day"
                className="inline-flex rounded-xl border border-brand-dark/15 px-5 py-3 text-sm font-bold text-brand-dark hover:border-brand-primary hover:text-brand-primary transition-colors"
              >
                Book Full Day
              </Link>
              <Link
                href="/cabo-fishing-calendar"
                className="inline-flex rounded-xl border border-brand-dark/15 px-5 py-3 text-sm font-bold text-brand-dark hover:border-brand-primary hover:text-brand-primary transition-colors"
              >
                Fishing calendar
              </Link>
            </div>
          </div>
        ) : (
          <ul className="space-y-6">
            {reports.map((report) => (
              <li key={report.slug} className="border-b border-brand-dark/10 pb-6 last:border-0">
                <Link
                  href={`/fishing-reports/${report.slug}`}
                  className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded-lg"
                >
                  <p className="text-sm text-brand-muted tabular-nums">{report.date}</p>
                  <h2 className="mt-1 font-display text-xl font-bold text-brand-dark group-hover:text-brand-primary transition-colors">
                    {report.title}
                  </h2>
                  <p className="mt-2 text-brand-dark/80 leading-relaxed">{report.catchSummary}</p>
                  {report.species.length > 0 ? (
                    <p className="mt-2 text-sm text-brand-muted">{report.species.join(" · ")}</p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <section className="mt-14" aria-labelledby="reports-related-heading">
          <h2 id="reports-related-heading" className="font-display text-xl font-bold text-brand-dark mb-4">
            Related guides
          </h2>
          <ul className="flex flex-wrap gap-2">
            {[
              { href: "/cabo-fishing-calendar", label: "Fishing calendar" },
              { href: "/best-time-to-fish-cabo", label: "Best time to fish Cabo" },
              { href: "/cabo-marlin-fishing", label: "Marlin fishing" },
              { href: "/cabo-san-lucas-fishing-charters", label: "Cabo San Lucas charters" },
              { href: "/cabo-fishing-charter-prices", label: "Prices" },
              { href: "/contact", label: "Contact" },
            ].map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-block rounded-full border border-brand-dark/15 px-3 py-1.5 text-sm text-brand-dark/90 hover:border-brand-primary hover:text-brand-primary transition-colors"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </article>
  );
}
