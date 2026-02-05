import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { brand } from "@/content/brand";
import { getExperienceBySlug, experiences } from "@/content/experiences";
import { BookingCTA } from "@/components/site/BookingCTA";
import { MobileExperienceBookRail } from "@/components/site/MobileExperienceBookRail";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Clock, Users, Tag, CheckCircle2, ArrowLeft } from "lucide-react";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return experiences.map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const experience = getExperienceBySlug(slug);
  if (!experience) return { title: "Experience" };
  return {
    title: `${experience.title} | Lake Travis & Lake Austin Boat Rental`,
    description: experience.shortDescription,
    openGraph: {
      title: `${experience.title} | ${brand.companyName}`,
      description: experience.shortDescription,
    },
  };
}

export default async function ExperienceDetailPage({ params }: Props) {
  const { slug } = await params;
  const experience = getExperienceBySlug(slug);
  if (!experience) notFound();

  const faqs = experience.faqs?.length
    ? experience.faqs
    : [{ q: "What's included?", a: experience.pricingNote }];

  return (
    <div className="bg-white pb-36 lg:pb-0">
      <MobileExperienceBookRail title={experience.title} slug={slug} />
      {/* Hero – elevated with stronger gradient and typography */}
      <section
        id="experience-detail-hero"
        className="relative aspect-[16/10] sm:aspect-[2/1] min-h-[280px] max-h-[360px] sm:max-h-[440px] lg:max-h-[520px] bg-brand-dark"
      >
        <Image
          src={experience.heroImage}
          alt=""
          fill
          className="object-cover"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-dark/95 via-brand-dark/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-8 lg:p-10 text-white">
          <div className="container-narrow mx-auto px-4 sm:px-6 lg:px-8">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight drop-shadow-lg">
              {experience.title}
            </h1>
            <p className="mt-3 text-base sm:text-lg lg:text-xl text-white/95 max-w-2xl leading-relaxed">
              {experience.shortDescription}
            </p>
          </div>
        </div>
      </section>

      {/* Main content + sidebar */}
      <section className="section-padding pt-10 sm:pt-12 lg:pt-16 bg-brand-bg/30">
        <div className="container-narrow mx-auto px-4 sm:px-6 lg:px-8">
          {/* Back to experiences – prominent on mobile */}
          <Link
            href="/experiences"
            className="inline-flex items-center gap-2 text-brand-primary font-medium text-sm sm:text-base mb-6 sm:mb-8 hover:text-brand-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white rounded-lg"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            Back to experiences
          </Link>
          <div className="grid lg:grid-cols-3 gap-10 lg:gap-12">
            {/* Main content */}
            <div className="lg:col-span-2 space-y-8 lg:space-y-10">
              <div className="rounded-2xl bg-white p-6 sm:p-8 shadow-soft border border-brand-dark/5">
                <p className="text-lg sm:text-xl text-brand-dark leading-relaxed">
                  {experience.description}
                </p>
              </div>

              <div className="rounded-2xl bg-white p-6 sm:p-8 shadow-soft border border-brand-dark/5">
                <h2 className="text-xl sm:text-2xl font-bold text-brand-dark mb-4 flex items-center gap-2">
                  <CheckCircle2 className="h-6 w-6 text-brand-primary shrink-0" aria-hidden />
                  Highlights
                </h2>
                <ul className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                  {experience.highlights.map((h) => (
                    <li key={h} className="flex items-center gap-3 text-brand-dark text-sm sm:text-base">
                      <span className="h-2.5 w-2.5 rounded-full bg-brand-primary shrink-0" aria-hidden />
                      {h}
                    </li>
                  ))}
                </ul>
              </div>

              {experience.gallery.length > 0 && (
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-brand-dark mb-4">Gallery</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                    {experience.gallery.map((src) => (
                      <div key={src} className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-brand-dark/5 shadow-soft">
                        <Image src={src} alt="" fill className="object-cover" sizes="(max-width: 640px) 50vw, 33vw" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar – elevated booking card */}
            <div className="lg:col-span-1">
              <div className="rounded-2xl border border-brand-dark/8 bg-white shadow-soft-lg p-6 sm:p-7 lg:sticky lg:top-24">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary/15 text-brand-primary">
                      <Clock className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Duration</p>
                      <p className="text-base font-medium text-brand-dark">{experience.duration}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary/15 text-brand-primary">
                      <Users className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Capacity</p>
                      <p className="text-base font-medium text-brand-dark">{experience.capacity}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary/15 text-brand-primary">
                      <Tag className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">From</p>
                      <p className="text-base font-medium text-brand-dark">{experience.pricingNote}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-6 pt-6 border-t border-brand-dark/10">
                  <BookingCTA
                    source="experience_detail"
                    page={`experiences/${slug}`}
                    experience={slug}
                    variant="primary"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* FAQs – elevated section */}
          {faqs.length > 0 && (
            <section className="mt-14 lg:mt-16" aria-labelledby="faq-heading">
              <div className="rounded-2xl bg-white border border-brand-dark/8 shadow-soft p-6 sm:p-8 lg:p-10">
                <h2 id="faq-heading" className="text-xl sm:text-2xl font-bold text-brand-dark mb-6">
                  FAQs
                </h2>
                <Accordion type="single" collapsible className="w-full">
                  {faqs.map((item, i) => (
                    <AccordionItem key={i} value={`faq-${i}`} className="border-brand-dark/10">
                      <AccordionTrigger className="text-left font-medium text-base sm:text-lg py-5 hover:no-underline">
                        {item.q}
                      </AccordionTrigger>
                      <AccordionContent className="text-base text-brand-muted leading-relaxed">
                        {item.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            </section>
          )}

          {/* Bottom CTAs – elevated block */}
          <div className="mt-14 lg:mt-16 rounded-2xl bg-brand-bg/60 border border-brand-dark/5 p-6 sm:p-8 text-center">
            <p className="text-sm text-brand-muted mb-6">Ready to book? Check availability or browse more experiences.</p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button asChild size="lg" className="rounded-xl h-14 px-10 shadow-soft">
                <Link href="/book">Check Availability</Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="rounded-xl h-14 px-10 border-brand-primary text-brand-dark hover:bg-brand-primary/10">
                <Link href="/experiences">All experiences</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
