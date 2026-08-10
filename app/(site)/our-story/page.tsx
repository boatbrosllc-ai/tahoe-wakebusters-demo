import type { Metadata } from "next";
import Image from "next/image";
import { brand } from "@/content/brand";
import { BookingCTA } from "@/components/site/BookingCTA";

const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://nastysportfishing.com").replace(/\/+$/, "");
const canonical = `${baseUrl}/our-story`;

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Our Story | Cabo San Lucas Sport Fishing",
  description:
    "Nasty Sport Fishing — Cabo San Lucas sport fishing charters built for anglers who want marlin, tuna, dorado, and a crew that takes the day seriously.",
  keywords: [
    "Nasty Sport Fishing",
    "Cabo San Lucas sport fishing",
    "Cabo fishing charter story",
    "Los Cabos fishing",
  ],
  alternates: { canonical },
  openGraph: {
    title: "Our Story | Cabo San Lucas Sport Fishing | Nasty Sport Fishing",
    description: "How Nasty Sport Fishing brings serious Cabo charters to the marina.",
    url: canonical,
  },
};

export default function OurStoryPage() {
  return (
    <div className="min-h-screen w-full bg-brand-bg">
      {/* Hero – full width, centered content */}
      <section className="relative w-full aspect-[3/4] sm:aspect-[21/9] min-h-[360px] sm:min-h-[420px] lg:min-h-[480px] max-h-[80vh] sm:max-h-[60vh] overflow-hidden">
        <Image
          src="/photos/stock/cabo/el-arco-sunset-jarvis.jpg"
          alt="El Arco at sunset — Cabo San Lucas with Nasty Sport Fishing"
          fill
          className="object-cover object-[center_40%]"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-dark via-brand-dark/40 to-brand-dark/20" />
        <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/10 via-transparent to-brand-muted/5" aria-hidden />
        <div className="absolute inset-0 flex flex-col items-center justify-end text-center w-full px-5 py-12 sm:px-8 sm:py-14 lg:px-12 lg:py-20">
          <div className="w-full max-w-4xl mx-auto">
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.2em] text-brand-primary mb-3">
              Cabo San Lucas sport fishing
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-white tracking-tight drop-shadow-lg">
              Our story
            </h1>
            <p className="mt-3 text-lg sm:text-xl lg:text-2xl text-white/90 max-w-2xl mx-auto">
              The crew behind {brand.companyName} — Cabo charters that hit different.
            </p>
          </div>
        </div>
      </section>

      {/* Story content – centered card */}
      <section className="relative pt-10 sm:pt-12 lg:pt-16 z-20 w-full px-4 sm:px-6 lg:px-8 pb-20 lg:pb-28 flex justify-center bg-brand-bg">
        <div className="w-full max-w-4xl">
          <article className="rounded-2xl sm:rounded-3xl border-2 border-brand-dark/10 bg-white/90 shadow-premium overflow-hidden backdrop-blur-sm">
            <div className="p-6 sm:p-8 lg:p-10 xl:p-12">
              <p className="text-xl sm:text-2xl lg:text-3xl text-brand-dark font-semibold leading-relaxed mb-8 border-l-4 border-brand-primary pl-6 sm:pl-8">
                Built for Cabo. Obsessed with the bite.
              </p>
              <div className="space-y-6 text-brand-muted leading-relaxed text-base sm:text-lg">
                <p>
                  Nasty Sport Fishing started with a simple idea: Cabo San Lucas deserves charters that feel as serious as the fish that swim here — marlin, yellowfin, dorado, and wahoo — without the tourist-trap runaround.
                </p>
                <p>
                  We run licensed trips out of Marina Cabo San Lucas with captain and crew who know the Pacific and Sea of Cortez edges, the banks when they fire, and how to put first-timers and seasoned anglers on the same boat without chaos.
                </p>
                <p>
                  Every half-day, full-day, and sunset trip is private. Tackle and ice are ready. You show up ready to fish; we handle the rest — lines, safety, and the plan for the day&apos;s conditions.
                </p>
                <p>
                  Whether you&apos;re chasing a billfish release photo or a cooler of tuna for dinner, we&apos;re here for the fight. Welcome aboard — book a charter and we&apos;ll see you at the marina.
                </p>
              </div>
            </div>
          </article>

          {/* CTA block */}
          <div className="mt-14 sm:mt-16 rounded-3xl bg-brand-dark p-8 sm:p-10 lg:p-12 text-center shadow-premium overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/20 via-transparent to-brand-muted/10" aria-hidden />
            <div className="relative z-10">
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
                Ready to book?
              </h2>
              <p className="text-white/80 text-sm sm:text-base mb-6 max-w-md mx-auto">
                Pick your charter, date, and time. Instant confirmation · Easy reschedule.
              </p>
              <BookingCTA
                source="our_story_page"
                page="our-story"
                variant="secondary"
                showCall={true}
                onDark
                primaryHint=""
                callHint=""
                className="justify-center"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
