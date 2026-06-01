"use client";

import { useCallback } from "react";
import Link from "next/link";
import { Hero } from "@/components/experience/Hero";
import { PageBreadcrumbs, type BreadcrumbItem } from "@/components/experience/PageBreadcrumbs";
import { ComparisonSection } from "@/components/experience/ComparisonSection";
import { FAQ } from "@/components/experience/FAQ";
import { RelatedArticlesSection } from "@/components/experience/RelatedArticlesSection";
import { RelatedExperiencesSection } from "@/components/experience/RelatedExperiencesSection";
import { FinalCTA } from "@/components/experience/FinalCTA";
import { useBookingModal } from "@/components/site/BookingModalContext";
import type { SeoLandingPageConfig } from "@/lib/experience/seoLanding.data";
import type { RelatedArticleLink } from "@/components/experience/RelatedArticlesSection";

export function SeoLandingGuideLayout({
  config,
  heroImageUrl,
  heroImageFallback,
  heroImageAlt,
  heroBadge,
  relatedArticles,
  breadcrumbs,
}: {
  config: SeoLandingPageConfig;
  heroImageUrl?: string;
  heroImageFallback: string;
  heroImageAlt: string;
  heroBadge?: string;
  relatedArticles: RelatedArticleLink[];
  breadcrumbs: BreadcrumbItem[];
}) {
  const { openWithSelection } = useBookingModal();
  const handleBook = useCallback(() => {
    openWithSelection({ experienceSlug: "pontoon", pricingType: "charter" });
  }, [openWithSelection]);

  const comparisonRows = [
    { label: "Distance from downtown", left: "15–25 min", right: "45+ min to many ramps" },
    { label: "Water feel", left: "Calmer, narrower lake", right: "Larger, busier reservoir" },
    { label: "Best for private charters", left: "Excellent", right: "Varies by area" },
    { label: "Party scene", left: "Private pontoons & coves", right: "Busy open-lake weekends" },
    { label: "Boat Bros operates here", left: "Yes — Lake Austin only", right: "No" },
  ];

  return (
    <article className="min-h-screen bg-white">
      <PageBreadcrumbs items={breadcrumbs} />
      <Hero
        heroImageUrl={heroImageUrl ?? heroImageFallback}
        imageAlt={heroImageAlt}
        title={config.heroTitle}
        subtitle={config.heroSubtitle}
        introParagraph={config.heroIntroParagraph}
        badge={heroBadge}
        mobileSafeLayout
      />

      <div className="max-w-3xl mx-auto px-5 sm:px-6 lg:px-8 py-12 sm:py-16 prose prose-lg prose-brand-dark">
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-brand-dark not-prose">{config.overviewHeadline}</h2>
        <p className="text-brand-dark/85 leading-relaxed">{config.overviewStory}</p>
        {config.overviewSeoParagraphs.map((p) => (
          <p key={p.slice(0, 40)} className="text-brand-dark/85 leading-relaxed">
            {p}
          </p>
        ))}
      </div>

      <ComparisonSection
        rows={comparisonRows}
        leftHeading="Lake Austin"
        rightHeading="Lake Travis"
        headline="Lake Austin vs Lake Travis at a glance"
      />

      <section className="bg-brand-bg py-12 px-5 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-display text-2xl font-bold text-brand-dark mb-4">Our recommendation</h2>
          <p className="text-brand-dark/80 mb-6">
            For captained private charters, swimming, and celebrations close to Austin, we recommend Lake Austin — that is where every Boat Bros trip runs.
          </p>
          <Link
            href="/lake-austin-boat-rentals"
            className="inline-flex items-center justify-center rounded-xl bg-brand-primary px-6 py-3 font-semibold text-white hover:bg-brand-primary/90 transition-colors"
          >
            Lake Austin boat rentals
          </Link>
        </div>
      </section>

      <div className="bg-brand-dark">
        <FAQ items={config.faq} />
      </div>

      {relatedArticles.length > 0 ? <RelatedArticlesSection articles={relatedArticles} /> : null}
      {config.relatedExperiences?.length ? (
        <RelatedExperiencesSection experiences={config.relatedExperiences} />
      ) : null}

      <FinalCTA
        onBookNow={handleBook}
        headline={config.finalCtaHeadline}
        primaryCta="Check availability"
        secondaryCta={config.finalCtaSecondaryCta}
        secondaryHref={config.finalCtaSecondaryHref ?? "/lake-austin-boat-rentals"}
      />
    </article>
  );
}
