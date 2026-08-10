import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageBreadcrumbs } from "@/components/experience/PageBreadcrumbs";
import { SeoCheckAvailabilityCta } from "@/components/seo/SeoCheckAvailabilityCta";
import {
  getFishingReportBySlug,
  getPublishedFishingReports,
} from "@/content/seo/fishing-reports";
import { articleJsonLd, breadcrumbJsonLd, buildSeoMetadata, siteBaseUrl } from "@/lib/seo/metadata";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getPublishedFishingReports().map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const report = getFishingReportBySlug(slug);
  if (!report) {
    return {
      title: "Report not found",
      robots: { index: false, follow: false },
    };
  }
  return buildSeoMetadata({
    path: `/fishing-reports/${report.slug}`,
    title: report.metaTitle ?? report.title,
    description: report.metaDescription ?? report.catchSummary.slice(0, 155),
    ogImage: report.images[0] ?? "/photos/nsf/yellowfin-marina-duo.png",
    ogImageAlt: report.title,
  });
}

export default async function FishingReportPage({ params }: Props) {
  const { slug } = await params;
  const report = getFishingReportBySlug(slug);
  if (!report) notFound();

  const path = `/fishing-reports/${report.slug}`;
  const crumbs = [
    { name: "Home", href: "/" },
    { name: "Fishing Reports", href: "/fishing-reports" },
    { name: report.title, href: path },
  ];
  const hero = report.images[0] ?? "/photos/nsf/yellowfin-marina-duo.png";
  const schemas = [
    breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Fishing Reports", path: "/fishing-reports" },
      { name: report.title, path },
    ]),
    articleJsonLd({
      headline: report.title,
      description: report.catchSummary,
      path,
      image: hero,
      dateModified: report.date,
    }),
  ];

  const charterLabel =
    report.charterType === "half"
      ? "Nasty Half Day"
      : report.charterType === "full"
        ? "Nasty Full Day"
        : report.charterType === "other"
          ? "Charter"
          : null;

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
          <Image src={hero} alt="" fill className="object-cover opacity-35" sizes="100vw" priority />
          <div className="absolute inset-0 bg-gradient-to-b from-brand-dark/70 via-brand-dark/85 to-brand-dark" />
        </div>
        <div className="relative container-wide px-4 sm:px-6 lg:px-8 py-12 sm:py-16 max-w-4xl mx-auto text-center">
          <p className="text-sm text-white/60 tabular-nums">{report.date}</p>
          <h1 className="mt-2 font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
            {report.title}
          </h1>
          <p className="mt-4 text-base sm:text-lg text-white/80 leading-relaxed max-w-2xl mx-auto">{report.catchSummary}</p>
        </div>
      </header>

      <div className="container-wide px-4 sm:px-6 lg:px-8 py-10 sm:py-14 max-w-3xl mx-auto">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm border border-brand-dark/10 rounded-2xl p-5 bg-brand-bg/40">
          {report.species.length > 0 ? (
            <div>
              <dt className="font-semibold text-brand-dark">Species</dt>
              <dd className="mt-1 text-brand-dark/80">{report.species.join(", ")}</dd>
            </div>
          ) : null}
          {charterLabel ? (
            <div>
              <dt className="font-semibold text-brand-dark">Charter</dt>
              <dd className="mt-1 text-brand-dark/80">
                {charterLabel}
                {report.durationHours ? ` · ${report.durationHours}h` : ""}
              </dd>
            </div>
          ) : null}
          {report.boatName ? (
            <div>
              <dt className="font-semibold text-brand-dark">Boat</dt>
              <dd className="mt-1 text-brand-dark/80">{report.boatName}</dd>
            </div>
          ) : null}
          {report.areaNote ? (
            <div>
              <dt className="font-semibold text-brand-dark">Area note</dt>
              <dd className="mt-1 text-brand-dark/80">{report.areaNote}</dd>
            </div>
          ) : null}
          {report.conditions ? (
            <div className="sm:col-span-2">
              <dt className="font-semibold text-brand-dark">Conditions</dt>
              <dd className="mt-1 text-brand-dark/80">{report.conditions}</dd>
            </div>
          ) : null}
        </dl>

        {report.images.length > 0 ? (
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {report.images.map((src) => (
              <div key={src} className="relative aspect-[4/3] overflow-hidden rounded-xl bg-brand-bg">
                <Image src={src} alt="" fill className="object-cover" sizes="(max-width: 640px) 100vw, 50vw" />
              </div>
            ))}
          </div>
        ) : null}

        {report.videoUrl ? (
          <p className="mt-6 text-sm">
            <a
              href={report.videoUrl.startsWith("http") ? report.videoUrl : `${siteBaseUrl()}${report.videoUrl}`}
              className="font-semibold text-brand-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Watch video
            </a>
          </p>
        ) : null}

        <div className="mt-8 prose-nsf space-y-4 text-brand-dark/90 leading-relaxed text-base sm:text-lg">
          {report.body.split(/\n\n+/).map((para) => (
            <p key={para.slice(0, 48)}>{para}</p>
          ))}
        </div>

        {report.captainNotes ? (
          <aside className="mt-8 text-sm text-brand-muted bg-brand-bg/80 border border-brand-dark/10 rounded-xl px-4 py-3">
            <p className="font-semibold text-brand-dark mb-1">Captain notes</p>
            <p>{report.captainNotes}</p>
          </aside>
        ) : null}

        {(report.relatedSpeciesPaths?.length || report.relatedCharterSlug) && (
          <section className="mt-10">
            <h2 className="font-display text-xl font-bold text-brand-dark mb-3">Related</h2>
            <ul className="flex flex-wrap gap-2">
              {report.relatedCharterSlug ? (
                <li>
                  <Link
                    href={`/experiences/${report.relatedCharterSlug}`}
                    className="inline-block rounded-full border border-brand-dark/15 px-3 py-1.5 text-sm hover:border-brand-primary hover:text-brand-primary transition-colors"
                  >
                    {report.relatedCharterSlug === "nasty-half-day" ? "Nasty Half Day" : "Nasty Full Day"}
                  </Link>
                </li>
              ) : null}
              {(report.relatedSpeciesPaths ?? []).map((href) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="inline-block rounded-full border border-brand-dark/15 px-3 py-1.5 text-sm hover:border-brand-primary hover:text-brand-primary transition-colors"
                  >
                    {href.replace(/^\//, "").replace(/-/g, " ")}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-12 rounded-2xl bg-brand-bg border border-brand-dark/10 p-6 sm:p-8">
          <h2 className="font-display text-xl font-bold text-brand-dark">Book a Cabo day</h2>
          <p className="mt-2 text-sm text-brand-muted mb-5">
            Check live availability for Nasty Half Day or Nasty Full Day.
          </p>
          <SeoCheckAvailabilityCta
            page="fishing_report"
            source="seo_bottom"
            experienceSlug={report.relatedCharterSlug}
          />
          <p className="mt-4 text-sm">
            <Link href="/fishing-reports" className="font-semibold text-brand-primary hover:underline">
              All fishing reports
            </Link>
            {" · "}
            <Link href="/cabo-fishing-calendar" className="font-semibold text-brand-primary hover:underline">
              Fishing calendar
            </Link>
          </p>
        </div>
      </div>
    </article>
  );
}
