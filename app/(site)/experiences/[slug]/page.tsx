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
      {/* Hero – consistent sizing and centering on mobile/desktop */}
      <section
        id="experience-detail-hero"
        className="relative aspect-[16/10] sm:aspect-[2/1] max-h-[360px] sm:max-h-[420px] lg:max-h-[480px] bg-brand-dark"
      >
        <Image
          src={experience.heroImage}
          alt=""
          fill
          className="object-cover"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-dark/80 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 lg:p-8 text-white">
          <div className="container-narrow mx-auto px-4 sm:px-6 lg:px-8">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">
              {experience.title}
            </h1>
            <p className="mt-2 text-sm sm:text-base text-white/90 max-w-xl">
              {experience.shortDescription}
            </p>
          </div>
        </div>
      </section>

      <div className="section-padding pt-8 sm:pt-10 lg:pt-12">
        <div className="container-narrow mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-3 gap-8 lg:gap-10">
            {/* Main content */}
            <div className="lg:col-span-2 space-y-6 lg:space-y-8">
              <p className="text-base sm:text-lg text-brand-muted leading-relaxed">
                {experience.description}
              </p>
              <div>
                <h2 className="text-lg sm:text-xl font-semibold text-brand-dark mb-3">
                  Highlights
                </h2>
                <ul className="grid sm:grid-cols-2 gap-2 sm:gap-3">
                  {experience.highlights.map((h) => (
                    <li key={h} className="flex items-center gap-2 text-brand-dark/90 text-sm sm:text-base">
                      <span className="h-2 w-2 rounded-full bg-brand-primary shrink-0" aria-hidden />
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
              {experience.gallery.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                  {experience.gallery.map((src) => (
                    <div key={src} className="relative aspect-[4/3] rounded-xl overflow-hidden bg-brand-dark/5">
                      <Image src={src} alt="" fill className="object-cover" sizes="(max-width: 640px) 50vw, 33vw" />
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Sidebar – booking card */}
            <div className="lg:col-span-1">
              <div className="rounded-2xl border border-brand-dark/10 bg-brand-bg/80 p-5 sm:p-6 lg:sticky lg:top-24">
                <div className="space-y-3 sm:space-y-4 text-sm text-brand-muted">
                  <p><strong className="text-brand-dark">Duration:</strong> {experience.duration}</p>
                  <p><strong className="text-brand-dark">Capacity:</strong> {experience.capacity}</p>
                  <p><strong className="text-brand-dark">From:</strong> {experience.pricingNote}</p>
                </div>
                <div className="mt-5 sm:mt-6">
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

          {faqs.length > 0 && (
            <section className="mt-12 sm:mt-14 lg:mt-16" aria-labelledby="faq-heading">
              <h2 id="faq-heading" className="text-xl sm:text-2xl font-bold text-brand-dark mb-4 sm:mb-6">
                FAQs
              </h2>
              <Accordion type="single" collapsible className="w-full">
                {faqs.map((item, i) => (
                  <AccordionItem key={i} value={`faq-${i}`}>
                    <AccordionTrigger className="text-left font-medium text-sm sm:text-base">
                      {item.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm sm:text-base">{item.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </section>
          )}

          {/* Bottom actions – centered on mobile, left on desktop */}
          <div className="mt-10 sm:mt-12 flex flex-wrap justify-center sm:justify-start gap-3 sm:gap-4">
            <Button asChild size="lg" className="rounded-xl min-h-[48px]">
              <Link href="/book">Check Availability</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-xl min-h-[48px]">
              <Link href="/experiences">All experiences</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
