import type { Metadata } from "next";
import Image from "next/image";
import { brand } from "@/content/brand";
import { experiences } from "@/content/experiences";
import { ExperienceCard } from "@/components/site/ExperienceCard";
import { TrustLine } from "@/components/site/TrustLine";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Clock, Users, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Experiences | Lake Travis & Lake Austin Boat Rentals",
  description: `Pontoon party, wake & surf, sunset cruise, family day, corporate & bachelor/bachelorette on Lake Travis and Lake Austin. ${brand.companyName}, Austin TX.`,
};

export default function ExperiencesPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero – full-width lake/boat vibe */}
      <section className="relative aspect-[3/2] sm:aspect-[21/9] min-h-[280px] sm:min-h-[320px] lg:min-h-[400px] overflow-hidden bg-brand-dark">
        <Image
          src="/photos/DSC09354.webp"
          alt=""
          fill
          className="object-cover"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-dark/90 via-brand-dark/40 to-transparent" />
        <div className="absolute inset-0 flex flex-col justify-end px-5 py-10 sm:px-8 sm:py-14 lg:px-12 lg:py-20">
          <div className="container-wide mx-auto px-4 sm:px-6 lg:px-8">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-white tracking-tight drop-shadow-lg">
              Our experiences
            </h1>
            <p className="mt-3 sm:mt-4 text-lg sm:text-xl lg:text-2xl text-white/95 max-w-2xl">
              From chill pontoon days to wakeboarding and sunset cruises. Pick one and get on the water.
            </p>
          </div>
        </div>
      </section>

      {/* Trust strip – why choose an experience */}
      <section className="border-b border-brand-dark/5 bg-brand-bg/60 py-6 sm:py-8">
        <div className="container-wide mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12 lg:gap-16 text-center">
            <div className="flex items-center gap-3 text-brand-muted">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary/15 text-brand-primary">
                <Clock className="h-5 w-5" aria-hidden />
              </span>
              <span className="text-sm font-medium text-brand-dark sm:text-base">Same-day availability</span>
            </div>
            <div className="flex items-center gap-3 text-brand-muted">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary/15 text-brand-primary">
                <Users className="h-5 w-5" aria-hidden />
              </span>
              <span className="text-sm font-medium text-brand-dark sm:text-base">Groups 2–40+</span>
            </div>
            <div className="flex items-center gap-3 text-brand-muted">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary/15 text-brand-primary">
                <Sparkles className="h-5 w-5" aria-hidden />
              </span>
              <span className="text-sm font-medium text-brand-dark sm:text-base">Licensed & insured</span>
            </div>
          </div>
        </div>
      </section>

      {/* Experience cards grid */}
      <section className="section-padding">
        <div className="container-wide mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 sm:gap-10 lg:gap-12">
            {experiences.map((exp, i) => (
              <ExperienceCard key={exp.slug} experience={exp} index={i} />
            ))}
          </div>

          {/* Bottom CTA – prominent block */}
          <div className="mt-16 sm:mt-20 lg:mt-24 text-center">
            <TrustLine variant="default" className="justify-center flex-wrap mb-8" />
            <div className="inline-flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button asChild size="lg" className="rounded-xl h-14 px-10 text-base sm:text-lg shadow-soft-lg w-full sm:w-auto">
                <Link href="/book">Check Availability</Link>
              </Button>
              <span className="text-sm text-brand-muted">or</span>
              <Button asChild variant="outline" size="lg" className="rounded-xl h-14 px-10 text-base sm:text-lg w-full sm:w-auto border-brand-primary text-brand-dark hover:bg-brand-primary/10">
                <Link href="/contact">Contact us</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
