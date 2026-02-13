"use client";

import { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import { experiences } from "@/content/experiences";
import { ExperienceCard } from "@/components/site/ExperienceCard";
import { TrustLine } from "@/components/site/TrustLine";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Clock, Users, Sparkles } from "lucide-react";
import { useBookingModal } from "@/components/site/BookingModalContext";

export function ExperiencesListClient() {
  const [order, setOrder] = useState<string[] | null>(null);
  const { setOpen: setBookingModalOpen } = useBookingModal();

  useEffect(() => {
    fetch("/api/experiences/order")
      .then((res) => res.json())
      .then((data) => setOrder(Array.isArray(data.order) ? data.order : []))
      .catch(() => setOrder([]));
  }, []);

  const sortedExperiences = useMemo(() => {
    if (!order || order.length === 0) return experiences;
    return [...experiences].sort((a, b) => {
      const i = order.indexOf(a.slug);
      const j = order.indexOf(b.slug);
      if (i === -1 && j === -1) return a.title.localeCompare(b.title);
      if (i === -1) return 1;
      if (j === -1) return -1;
      return i - j;
    });
  }, [order]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-bg via-white to-brand-bg/70">
      {/* Hero – immersive lake vibe, more personality */}
      <section className="relative aspect-[3/2] sm:aspect-[21/9] min-h-[300px] sm:min-h-[360px] lg:min-h-[440px] overflow-hidden bg-brand-dark">
        <Image
          src="/photos/IMG_8520.webp"
          alt=""
          fill
          className="object-cover object-center scale-105"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-dark via-brand-dark/50 via-30% to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_0%,rgba(80,189,186,0.12),transparent_50%)]" />
        <div className="absolute inset-0 flex flex-col justify-end px-5 py-10 sm:px-8 sm:py-14 lg:px-12 lg:py-20">
          <div className="container-wide mx-auto px-4 sm:px-6 lg:px-8">
            <p className="text-brand-primary font-semibold text-sm sm:text-base uppercase tracking-[0.2em] mb-2">
              Lake Austin · Captain-led
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-extrabold text-white tracking-tight drop-shadow-2xl [text-shadow:0_2px_20px_rgba(0,0,0,0.35)]">
              Your next adventure on the water
            </h1>
            <p className="mt-3 sm:mt-4 text-lg sm:text-xl lg:text-2xl text-white/90 max-w-2xl leading-relaxed">
              Chill pontoon days, wake sessions, sunset cruises — pick your vibe and we&apos;ll handle the rest.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 px-3 py-1.5 text-sm font-medium text-white">
                <Clock className="h-4 w-4 text-brand-primary" aria-hidden />
                Same-day trips
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 px-3 py-1.5 text-sm font-medium text-white">
                <Users className="h-4 w-4 text-brand-primary" aria-hidden />
                Groups 2–40+
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 px-3 py-1.5 text-sm font-medium text-white">
                <Sparkles className="h-4 w-4 text-brand-primary" aria-hidden />
                Licensed & insured
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Intro + cards – editorial feel */}
      <section className="section-padding">
        <div className="container-wide mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-lg sm:text-xl text-brand-dark/90 max-w-2xl mx-auto mb-12 sm:mb-14">
            Every trip is captain-led. Just show up, hop on, and enjoy the lake.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-8 sm:gap-10 lg:gap-12">
            {sortedExperiences.map((exp, i) => (
              <ExperienceCard key={exp.slug} experience={exp} index={i} />
            ))}
          </div>

          {/* Bottom CTA – warm, inviting */}
          <div className="mt-16 sm:mt-20 lg:mt-24 text-center">
            <TrustLine variant="default" className="justify-center flex-wrap mb-6" />
            <p className="text-brand-dark/80 text-base sm:text-lg mb-8 max-w-md mx-auto">
              Ready to get on the water? Book your slot or reach out — we&apos;re here to help.
            </p>
            <div className="inline-flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" className="rounded-xl h-14 px-10 text-base sm:text-lg shadow-soft-lg w-full sm:w-auto bg-brand-primary text-brand-dark hover:bg-brand-primary/90 font-semibold" onClick={() => setBookingModalOpen(true)}>
                Book your trip
              </Button>
              <span className="text-sm text-brand-muted">or</span>
              <Button asChild variant="outline" size="lg" className="rounded-xl h-14 px-10 text-base sm:text-lg w-full sm:w-auto border-brand-primary text-brand-dark hover:bg-brand-primary/10 font-medium">
                <Link href="/contact">Contact us</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
