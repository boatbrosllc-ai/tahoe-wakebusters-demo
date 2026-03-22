import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { brand } from "@/content/brand";
import { blogPosts } from "@/content/blog";
import { BlogCategoryFilter } from "@/components/site/BlogCategoryFilter";
import { ArrowRight, Waves } from "lucide-react";

type SearchParams = { category?: string };
type PageProps = { searchParams?: Promise<SearchParams> | SearchParams };

export default async function TheDockPage(props: PageProps) {
  const resolved = props.searchParams instanceof Promise ? await props.searchParams : props.searchParams ?? {};
  const categoryParam = resolved.category?.trim();
  const validCategories = ["boat-tips", "austin-events", "lake-news", "general"] as const;
  const initialCategory =
    categoryParam && validCategories.includes(categoryParam as (typeof validCategories)[number])
      ? (categoryParam as (typeof validCategories)[number])
      : "all";

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* Hero – server-rendered for SEO */}
      <section className="relative overflow-hidden bg-brand-dark text-white min-h-[45vh] sm:min-h-[50vh] md:min-h-[55vh] flex flex-col justify-end">
        <div className="absolute inset-0">
          <Image
            src="/photos/DSC09399%20(2).webp"
            alt=""
            fill
            className="object-cover object-center opacity-40"
            priority
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-brand-dark/80 via-brand-dark/50 to-brand-dark" />
          <div className="absolute inset-0 grain-overlay" aria-hidden />
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-2 bg-brand-primary/30" aria-hidden />
        <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-2 pb-2" aria-hidden>
          <Waves className="h-5 w-5 text-brand-primary/60" />
        </div>
        <div className="relative z-10 section-padding text-center pb-12 sm:pb-20 pt-16 sm:pt-20 px-4">
          <p className="text-brand-primary font-bold uppercase tracking-[0.28em] sm:tracking-[0.35em] text-xs sm:text-sm mb-4 sm:mb-5">
            From the crew at {brand.companyName}
          </p>
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl 2xl:text-9xl font-bold tracking-tighter leading-[0.95]">
            The Dock
          </h1>
          <p className="mt-4 sm:mt-6 text-[15px] sm:text-base md:text-lg lg:text-xl text-white/90 max-w-2xl mx-auto leading-relaxed">
            Boat tips, Austin events, lake & boating news — everything that makes a day on Lake Austin better.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4 text-sm text-white/70">
            <span>Boat tips</span>
            <span aria-hidden>·</span>
            <span>Austin events</span>
            <span aria-hidden>·</span>
            <span>Lake news</span>
          </div>
        </div>
      </section>

      <Suspense
        fallback={
          <section className="section-padding bg-gradient-to-b from-brand-bg/50 via-white to-brand-bg/30">
            <div className="container-wide px-4 max-w-6xl mx-auto text-center text-brand-muted">
              Loading…
            </div>
          </section>
        }
      >
        <BlogCategoryFilter allPosts={blogPosts} initialCategory={initialCategory} />
      </Suspense>

      {/* CTA – server-rendered */}
      <section className="relative overflow-hidden bg-brand-dark text-white py-16 sm:py-24 lg:py-28">
        <div className="absolute inset-0">
          <Image
            src="/photos/DSC09399%20(2).webp"
            alt=""
            fill
            className="object-cover object-center opacity-25"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-brand-dark/88" />
        </div>
        <div className="relative z-10 container-wide px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white tracking-tight leading-tight">
            Ready for your Lake Austin day?
          </h2>
          <p className="mt-3 sm:mt-4 text-white/90 max-w-lg mx-auto text-base sm:text-lg leading-relaxed">
            Pontoon, wake surf, sunset cruise — book your boat rental and get on the water.
          </p>
          <Link
            href="/experiences"
            className="mt-8 sm:mt-10 inline-flex items-center justify-center gap-2 min-h-[48px] w-full sm:w-auto touch-manipulation rounded-2xl bg-brand-primary px-6 sm:px-8 py-4 text-white font-bold text-base sm:text-lg shadow-[0_8px_28px_rgba(80,189,186,0.4)] hover:bg-brand-primary/90 hover:shadow-[0_12px_36px_rgba(80,189,186,0.45)] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
          >
            See experiences
            <ArrowRight className="h-5 w-5 shrink-0" aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  );
}
