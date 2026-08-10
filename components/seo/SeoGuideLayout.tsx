import Image from "next/image";
import Link from "next/link";
import { PageBreadcrumbs } from "@/components/experience/PageBreadcrumbs";
import { SeoCheckAvailabilityCta } from "@/components/seo/SeoCheckAvailabilityCta";
import { CharterPriceCards } from "@/components/seo/CharterPriceCards";
import { articleJsonLd, breadcrumbJsonLd, faqPageJsonLd } from "@/lib/seo/metadata";

export type SeoRelatedLink = { href: string; label: string };

export type SeoGuideSection =
  | { type: "p"; text: string }
  | { type: "h2"; id?: string; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "note"; text: string }
  | { type: "prices" }
  | { type: "cta"; experienceSlug?: "nasty-half-day" | "nasty-full-day" };

type Props = {
  path: string;
  h1: string;
  lede: string;
  heroImage?: string;
  heroAlt?: string;
  breadcrumbName: string;
  sections: SeoGuideSection[];
  faqs?: { question: string; answer: string }[];
  related: SeoRelatedLink[];
  showPricePreview?: boolean;
  pageKey: string;
  metaDescription: string;
};

export function SeoGuideLayout({
  path,
  h1,
  lede,
  heroImage = "/photos/stock/cabo/el-arco-from-boat-pexels.jpg",
  heroAlt = "View toward El Arco from a boat in Cabo San Lucas",
  breadcrumbName,
  sections,
  faqs = [],
  related,
  showPricePreview = false,
  pageKey,
  metaDescription,
}: Props) {
  const crumbs = [
    { name: "Home", href: "/" },
    { name: "Guides", href: "/cabo-san-lucas-fishing-charters" },
    { name: breadcrumbName, href: path },
  ];
  const schemas = [
    breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Guides", path: "/cabo-san-lucas-fishing-charters" },
      { name: breadcrumbName, path },
    ]),
    articleJsonLd({
      headline: h1,
      description: metaDescription,
      path,
      image: heroImage,
    }),
    faqPageJsonLd(faqs),
  ].filter(Boolean);

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
          <Image src={heroImage} alt="" fill className="object-cover opacity-35" sizes="100vw" priority />
          <div className="absolute inset-0 bg-gradient-to-b from-brand-dark/70 via-brand-dark/85 to-brand-dark" />
        </div>
        <div className="relative container-wide px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20 max-w-4xl mx-auto text-center">
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
            {h1}
          </h1>
          <p className="mt-4 text-base sm:text-lg text-white/80 leading-relaxed max-w-2xl mx-auto">{lede}</p>
          <div className="mt-8 max-w-md mx-auto">
            <SeoCheckAvailabilityCta page={pageKey} source="seo_hero" />
          </div>
        </div>
      </header>

      {/* Decorative hero context for AT; primary photo is background */}
      <div className="sr-only">{heroAlt}</div>

      <div className="container-wide px-4 sm:px-6 lg:px-8 py-10 sm:py-14 max-w-3xl mx-auto">
        <div className="prose-nsf space-y-6 text-brand-dark/90 leading-relaxed">
          {sections.map((section, i) => {
            if (section.type === "p") {
              return (
                <p key={i} className="text-base sm:text-lg">
                  {section.text}
                </p>
              );
            }
            if (section.type === "h2") {
              return (
                <h2
                  key={i}
                  id={section.id}
                  className="font-display text-2xl sm:text-3xl font-bold text-brand-dark pt-4 scroll-mt-24"
                >
                  {section.text}
                </h2>
              );
            }
            if (section.type === "h3") {
              return (
                <h3 key={i} className="font-display text-xl font-bold text-brand-dark pt-2">
                  {section.text}
                </h3>
              );
            }
            if (section.type === "ul") {
              return (
                <ul key={i} className="list-disc pl-5 space-y-1.5 text-base">
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              );
            }
            if (section.type === "note") {
              return (
                <p
                  key={i}
                  className="text-sm text-brand-muted bg-brand-bg/80 border border-brand-dark/10 rounded-xl px-4 py-3"
                >
                  {section.text}
                </p>
              );
            }
            if (section.type === "prices") {
              return (
                <div key={i} className="not-prose py-2">
                  <CharterPriceCards />
                </div>
              );
            }
            if (section.type === "cta") {
              return (
                <div key={i} className="not-prose py-4 border-y border-brand-dark/10 my-6">
                  <p className="text-sm font-semibold text-brand-dark mb-3">Check availability</p>
                  <SeoCheckAvailabilityCta
                    page={pageKey}
                    source="seo_mid"
                    experienceSlug={section.experienceSlug}
                  />
                </div>
              );
            }
            return null;
          })}
        </div>

        {showPricePreview && (
          <div className="mt-12 not-prose">
            <h2 className="font-display text-2xl font-bold text-brand-dark mb-4">Charter pricing preview</h2>
            <CharterPriceCards />
          </div>
        )}

        {faqs.length > 0 && (
          <section className="mt-14" aria-labelledby="seo-faq-heading">
            <h2 id="seo-faq-heading" className="font-display text-2xl font-bold text-brand-dark mb-6">
              FAQs
            </h2>
            <dl className="space-y-5">
              {faqs.map((f) => (
                <div key={f.question}>
                  <dt className="font-semibold text-brand-dark">{f.question}</dt>
                  <dd className="mt-1.5 text-brand-dark/80 leading-relaxed">{f.answer}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section className="mt-14 not-prose" aria-labelledby="seo-related-heading">
          <h2 id="seo-related-heading" className="font-display text-xl font-bold text-brand-dark mb-4">
            Related guides
          </h2>
          <ul className="flex flex-wrap gap-2">
            {related.map((link) => (
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

        <div className="mt-14 not-prose rounded-2xl bg-brand-bg border border-brand-dark/10 p-6 sm:p-8">
          <h2 className="font-display text-xl font-bold text-brand-dark">Ready to fish Cabo?</h2>
          <p className="mt-2 text-sm text-brand-muted mb-5">
            Book Nasty Half Day or Nasty Full Day on the live calendar — same private boat inventory.
          </p>
          <SeoCheckAvailabilityCta page={pageKey} source="seo_bottom" />
          <p className="mt-4 text-sm">
            <Link href="/experiences" className="font-semibold text-brand-primary hover:underline">
              View all charters
            </Link>
            {" · "}
            <Link href="/cabo-fishing-charter-prices" className="font-semibold text-brand-primary hover:underline">
              Pricing details
            </Link>
          </p>
        </div>
      </div>
    </article>
  );
}
