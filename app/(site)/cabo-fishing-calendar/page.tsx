import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PageBreadcrumbs } from "@/components/experience/PageBreadcrumbs";
import { SeoCheckAvailabilityCta } from "@/components/seo/SeoCheckAvailabilityCta";
import {
  CALENDAR_MONTHS,
  CALENDAR_VERIFICATION_NOTE,
  fishingCalendarSpecies,
  type SeasonLevel,
} from "@/content/seo/fishing-calendar";
import { articleJsonLd, breadcrumbJsonLd, buildSeoMetadata } from "@/lib/seo/metadata";

const path = "/cabo-fishing-calendar";
const description =
  "Cabo fishing calendar by species and month — educational grid with pending first-party ratings from Nasty Sport Fishing trip reports.";

export const metadata: Metadata = buildSeoMetadata({
  path,
  title: "Cabo Fishing Calendar",
  description,
  ogImage: "/photos/stock/cabo/el-arco-from-boat-pexels.jpg",
  ogImageAlt: "Boat view toward El Arco — Cabo fishing season planning",
});

function cellLabel(level: SeasonLevel): string {
  if (level == null) return "—";
  if (level === 1) return "Possible";
  if (level === 2) return "Often";
  return "Strong";
}

function cellTitle(level: SeasonLevel): string {
  if (level == null) return "Pending verification from Nasty trip reports";
  if (level === 1) return "Occasional / possible";
  if (level === 2) return "Often in play";
  return "Historically strong window (not a guarantee)";
}

export default function CaboFishingCalendarPage() {
  const crumbs = [
    { name: "Home", href: "/" },
    { name: "Guides", href: "/cabo-san-lucas-fishing-charters" },
    { name: "Fishing Calendar", href: path },
  ];
  const schemas = [
    breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Guides", path: "/cabo-san-lucas-fishing-charters" },
      { name: "Fishing Calendar", path },
    ]),
    articleJsonLd({
      headline: "Cabo Fishing Calendar",
      description,
      path,
      image: "/photos/stock/cabo/el-arco-from-boat-pexels.jpg",
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
            src="/photos/stock/cabo/el-arco-from-boat-pexels.jpg"
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
            Cabo Fishing Calendar
          </h1>
          <p className="mt-4 text-base sm:text-lg text-white/80 leading-relaxed max-w-2xl mx-auto">
            A species-by-month grid for planning Cabo San Lucas fishing trips. Ratings stay pending until verified from
            Nasty Sport Fishing trip reports — we do not invent peak months.
          </p>
          <div className="mt-8 max-w-md mx-auto">
            <SeoCheckAvailabilityCta page="cabo_fishing_calendar" source="seo_hero" />
          </div>
        </div>
      </header>

      <div className="container-wide px-4 sm:px-6 lg:px-8 py-10 sm:py-14 max-w-5xl mx-auto">
        <div className="space-y-6 text-brand-dark/90 leading-relaxed max-w-3xl">
          <p className="text-base sm:text-lg">
            Use this calendar to compare species interest across the year, then pick Nasty Half Day (5h) or Nasty Full
            Day (8h) on the live booking calendar. For goal-based timing (“best for marlin vs tuna”), see{" "}
            <Link href="/best-time-to-fish-cabo" className="font-semibold text-brand-primary hover:underline">
              Best Time to Fish Cabo
            </Link>
            .
          </p>
          <p className="text-sm text-brand-muted bg-brand-bg/80 border border-brand-dark/10 rounded-xl px-4 py-3">
            {CALENDAR_VERIFICATION_NOTE}
          </p>
          <div>
            <h2 className="font-display text-xl font-bold text-brand-dark mb-2">How to read the grid</h2>
            <ul className="list-disc pl-5 space-y-1.5 text-sm sm:text-base">
              <li>
                <span className="font-semibold">—</span> / Pending — not yet verified from Nasty reports
              </li>
              <li>
                <span className="font-semibold">Possible</span> — occasional opportunity once verified
              </li>
              <li>
                <span className="font-semibold">Often</span> — frequently in play once verified
              </li>
              <li>
                <span className="font-semibold">Strong</span> — historically strong window once verified (still not a
                guarantee)
              </li>
            </ul>
          </div>
        </div>

        <section className="mt-10" aria-labelledby="calendar-grid-heading">
          <h2 id="calendar-grid-heading" className="font-display text-2xl font-bold text-brand-dark mb-4">
            Species × month
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-brand-dark/10 bg-white shadow-sm">
            <table className="min-w-[720px] w-full text-sm text-left border-collapse">
              <caption className="sr-only">
                Cabo fishing season grid by species and month. Empty cells are pending verification.
              </caption>
              <thead>
                <tr className="bg-brand-bg/90">
                  <th
                    scope="col"
                    className="sticky left-0 z-10 bg-brand-bg/95 px-3 py-3 font-display font-bold text-brand-dark border-b border-brand-dark/10"
                  >
                    Species
                  </th>
                  {CALENDAR_MONTHS.map((m) => (
                    <th
                      key={m}
                      scope="col"
                      className="px-2 py-3 text-center font-semibold text-brand-dark/80 border-b border-brand-dark/10"
                    >
                      {m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fishingCalendarSpecies.map((species) => (
                  <tr key={species.id} className="border-b border-brand-dark/5 last:border-0">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-white px-3 py-3 font-semibold text-brand-dark whitespace-nowrap"
                    >
                      {species.href ? (
                        <Link href={species.href} className="text-brand-primary hover:underline">
                          {species.name}
                        </Link>
                      ) : (
                        species.name
                      )}
                      {species.note ? (
                        <span className="block text-xs font-normal text-brand-muted mt-0.5 max-w-[10rem] sm:max-w-xs">
                          {species.note}
                        </span>
                      ) : null}
                    </th>
                    {species.months.map((level, i) => (
                      <td
                        key={`${species.id}-${i}`}
                        className="px-2 py-3 text-center tabular-nums text-brand-dark/75"
                        title={cellTitle(level)}
                      >
                        {level == null ? (
                          <span className="text-brand-muted">—</span>
                        ) : (
                          <span className="text-xs sm:text-sm">{cellLabel(level)}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-brand-muted sm:hidden">Scroll horizontally to see all months.</p>
        </section>

        <section className="mt-12 max-w-3xl space-y-4 text-brand-dark/90 leading-relaxed">
          <h2 className="font-display text-2xl font-bold text-brand-dark">Planning next steps</h2>
          <p>
            Marlin-focused anglers should read{" "}
            <Link href="/cabo-marlin-fishing" className="font-semibold text-brand-primary hover:underline">
              Cabo marlin fishing
            </Link>
            ; coastal roosterfish interest is covered on{" "}
            <Link href="/cabo-roosterfish-fishing" className="font-semibold text-brand-primary hover:underline">
              Cabo roosterfish fishing
            </Link>
            . Real day write-ups will appear on{" "}
            <Link href="/fishing-reports" className="font-semibold text-brand-primary hover:underline">
              fishing reports
            </Link>{" "}
            as we publish them.
          </p>
        </section>

        <section className="mt-14" aria-labelledby="calendar-related-heading">
          <h2 id="calendar-related-heading" className="font-display text-xl font-bold text-brand-dark mb-4">
            Related guides
          </h2>
          <ul className="flex flex-wrap gap-2">
            {[
              { href: "/best-time-to-fish-cabo", label: "Best time to fish Cabo" },
              { href: "/cabo-marlin-fishing", label: "Marlin fishing" },
              { href: "/cabo-roosterfish-fishing", label: "Roosterfish" },
              { href: "/fishing-reports", label: "Fishing reports" },
              { href: "/experiences/nasty-half-day", label: "Nasty Half Day" },
              { href: "/experiences/nasty-full-day", label: "Nasty Full Day" },
              { href: "/cabo-fishing-charter-prices", label: "Prices" },
              { href: "/deep-sea-fishing-cabo", label: "Deep sea fishing" },
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

        <div className="mt-14 rounded-2xl bg-brand-bg border border-brand-dark/10 p-6 sm:p-8 max-w-3xl">
          <h2 className="font-display text-xl font-bold text-brand-dark">Ready to pick a date?</h2>
          <p className="mt-2 text-sm text-brand-muted mb-5">
            Season planning is educational — your captain still sets the daily plan from live conditions.
          </p>
          <SeoCheckAvailabilityCta page="cabo_fishing_calendar" source="seo_bottom" />
        </div>
      </div>
    </article>
  );
}
