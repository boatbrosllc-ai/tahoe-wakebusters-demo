import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { brand } from "@/content/brand";
import { siteConfig } from "@/config/site";
import { BlogCategoryFilter } from "@/components/site/BlogCategoryFilter";
import { getBlogHubPosts } from "@/lib/blog/get-blog-hub-posts";
import type { BlogCategory } from "@/content/blog";
import { ArrowRight } from "lucide-react";

type SearchParams = { category?: string };
type PageProps = { searchParams?: Promise<SearchParams> | SearchParams };

const validCategories: BlogCategory[] = ["fishing-tips", "cabo-guides", "charter-news", "general"];

export default async function BlogHubPage(props: PageProps) {
  const resolved = props.searchParams instanceof Promise ? await props.searchParams : props.searchParams ?? {};
  const categoryParam = resolved.category?.trim();
  const initialCategory =
    categoryParam && validCategories.includes(categoryParam as BlogCategory)
      ? (categoryParam as BlogCategory)
      : "all";

  const allPosts = await getBlogHubPosts();
  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <section className="relative overflow-hidden bg-brand-dark text-white min-h-[40vh] sm:min-h-[45vh] flex flex-col items-center justify-center text-center">
        <div className="absolute inset-0">
          <Image
            src={siteConfig.media.hero}
            alt=""
            fill
            className="object-cover object-center opacity-40"
            priority
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-brand-dark/80 via-brand-dark/50 to-brand-dark" />
        </div>
        <div className="relative z-10 section-padding text-center pb-12 sm:pb-16 pt-16 sm:pt-20 px-4 w-full max-w-4xl mx-auto">
          <p className="text-brand-primary font-bold uppercase tracking-[0.28em] text-xs sm:text-sm mb-4">
            From the crew at {brand.companyName}
          </p>
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight">
            {siteConfig.seo.blogName}
          </h1>
          <p className="mt-4 sm:mt-6 text-base sm:text-lg text-white/90 max-w-2xl mx-auto leading-relaxed">
            Tips, charter guides, and trip notes.
          </p>
        </div>
      </section>

      <Suspense
        fallback={
          <section className="section-padding">
            <div className="container-wide px-4 max-w-6xl mx-auto text-center text-brand-muted">Loading…</div>
          </section>
        }
      >
        <BlogCategoryFilter allPosts={allPosts} initialCategory={initialCategory} />
      </Suspense>

      <section className="relative overflow-hidden bg-brand-dark text-white py-16 sm:py-20">
        <div className="relative z-10 container-wide px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Ready to book?</h2>
          <p className="mt-3 text-white/90 max-w-lg mx-auto">
            Book Half Day or Full Day on the live calendar.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/experiences"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-primary px-6 py-3.5 text-white font-bold hover:brightness-110"
            >
              View charters
              <ArrowRight className="h-5 w-5" aria-hidden />
            </Link>
            <Link
              href="/experiences"
              className="inline-flex items-center justify-center rounded-xl border border-white/30 px-6 py-3.5 text-white font-semibold hover:bg-white/10"
            >
              Browse trips
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
