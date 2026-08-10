"use client";

import { useMemo, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { brand } from "@/content/brand";
import { getCategoryLabel, type BlogCategory } from "@/content/blog";
import type { BlogPost } from "@/content/blog";
import { Clock, Anchor, ArrowRight, Sparkles, Waves } from "lucide-react";

const DOCK_CATEGORIES: { id: BlogCategory | "all"; label: string; description: string }[] = [
  { id: "all", label: "All", description: "All posts" },
  { id: "fishing-tips", label: "Fishing tips", description: "Tackle, techniques, and trip prep" },
  { id: "cabo-guides", label: "Cabo guides", description: "Marina, seasons, and what to expect" },
  { id: "charter-news", label: "Charter news", description: "Bite reports and charter updates" },
  { id: "general", label: "Stories", description: "Crew stories and Cabo life" },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

interface BlogCategoryFilterProps {
  allPosts: BlogPost[];
  initialCategory: BlogCategory | "all";
}

export function BlogCategoryFilter({ allPosts, initialCategory }: BlogCategoryFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<BlogCategory | "all">(initialCategory);

  const filtered = useMemo(
    () => (filter === "all" ? allPosts : allPosts.filter((p) => p.category === filter)),
    [filter, allPosts]
  );
  const featured = filtered[0];
  const rest = filtered.slice(1);

  const setCategory = useCallback(
    (cat: BlogCategory | "all") => {
      setFilter(cat);
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (cat === "all") params.delete("category");
      else params.set("category", cat);
      const qs = params.toString();
      const url = qs ? `/blog?${qs}` : "/blog";
      router.replace(url, { scroll: false });
    },
    [router, searchParams]
  );

  return (
    <>
      {/* Sticky category bar – touch-friendly on mobile */}
      <section className="sticky top-16 lg:top-20 z-30 border-b-2 border-brand-primary/20 bg-white shadow-[0_4px_20px_rgba(0,28,48,0.06)]">
        <div className="container-wide px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          <p className="text-center text-xs font-semibold uppercase tracking-wider text-brand-muted mb-3 sm:mb-4">
            Browse by topic
          </p>
          <div className="flex flex-wrap gap-2 sm:gap-3 justify-center">
            {DOCK_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={`min-h-[44px] min-w-[44px] touch-manipulation px-4 sm:px-5 py-3 sm:py-2.5 rounded-full text-sm font-semibold transition-all duration-200 ${
                  filter === cat.id
                    ? "bg-brand-primary text-white shadow-[0_4px_16px_rgba(80,189,186,0.45)] ring-2 ring-brand-primary/30"
                    : "bg-brand-bg text-brand-dark/80 hover:bg-brand-dark/5 border-2 border-brand-dark/10"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Featured post (first) + rest in grid */}
      <section className="section-padding bg-gradient-to-b from-brand-bg/50 via-white to-brand-bg/30">
        <div className="container-wide px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-brand-dark mb-2 text-center">
            Latest from the crew
          </h2>
          <p className="text-center text-brand-muted max-w-xl mx-auto mb-12">
            Tips, seasons, and trip news to get the most out of your Cabo fishing charter.
          </p>

          <AnimatePresence mode="wait">
            {filtered.length === 0 ? (
              <motion.div
                className="text-center py-20 rounded-3xl bg-white border-2 border-dashed border-brand-dark/10"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <Sparkles className="h-14 w-14 text-brand-primary/50 mx-auto mb-5" aria-hidden />
                <p className="text-brand-muted font-semibold text-lg">No posts in this category yet.</p>
                <p className="text-sm text-brand-muted mt-2">Check back soon or browse All.</p>
                <button
                  type="button"
                  onClick={() => setCategory("all")}
                  className="mt-6 min-h-[44px] min-w-[44px] touch-manipulation px-4 py-2 text-brand-primary font-bold hover:underline text-base rounded-lg"
                >
                  View all posts
                </button>
              </motion.div>
            ) : (
              <motion.div
                key={filter}
                variants={container}
                initial="hidden"
                animate="show"
                className="space-y-12"
              >
                {featured && (
                  <motion.article variants={item} className="group">
                    <Link
                      href={`/blog/${featured.slug}`}
                      className="block rounded-3xl overflow-hidden bg-white border-2 border-brand-dark/10 shadow-soft-lg hover:shadow-premium hover:border-brand-primary/25 transition-all duration-300 hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
                    >
                      <div className="grid md:grid-cols-2 gap-0">
                        {featured.image && (
                          <div className="relative aspect-[16/10] md:aspect-auto md:min-h-[320px] bg-brand-dark/5 overflow-hidden">
                            <Image
                              src={featured.image}
                              alt={featured.imageAlt || featured.title}
                              fill
                              className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                              sizes="(max-width: 768px) 100vw, 50vw"
                            />
                            <div className="absolute top-5 left-5">
                              <span className="inline-flex items-center gap-2 rounded-full bg-brand-primary px-4 py-2 text-sm font-bold text-white shadow-lg">
                                <Anchor className="h-4 w-4" aria-hidden />
                                Featured · {getCategoryLabel(featured.category)}
                              </span>
                            </div>
                          </div>
                        )}
                        <div className="p-5 sm:p-8 md:p-10 flex flex-col justify-center">
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-brand-muted mb-3 sm:mb-4">
                            <time dateTime={featured.date}>
                              {new Date(featured.date).toLocaleDateString("en-US", {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })}
                            </time>
                            {featured.readingTimeMinutes && (
                              <span className="inline-flex items-center gap-1.5">
                                <Clock className="h-4 w-4" aria-hidden />
                                {featured.readingTimeMinutes} min read
                              </span>
                            )}
                          </div>
                          <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-brand-dark group-hover:text-brand-primary transition-colors leading-tight">
                            {featured.title}
                          </h3>
                          <p className="mt-3 sm:mt-4 text-brand-muted text-[15px] sm:text-base leading-relaxed line-clamp-3">
                            {featured.excerpt}
                          </p>
                          <span className="mt-4 sm:mt-6 inline-flex items-center gap-2 min-h-[44px] text-brand-primary font-bold text-base group-hover:gap-3 transition-all touch-manipulation">
                            Read article
                            <ArrowRight className="h-5 w-5" aria-hidden />
                          </span>
                        </div>
                      </div>
                    </Link>
                  </motion.article>
                )}

                {rest.length > 0 && (
                  <>
                    <h3 className="text-xl font-bold text-brand-dark pt-4 border-t border-brand-dark/10">
                      More from The Dock
                    </h3>
                    <div className="grid gap-8 sm:grid-cols-2">
                      {rest.map((post) => (
                        <motion.article
                          key={post.slug}
                          variants={item}
                          className="group relative rounded-2xl overflow-hidden bg-white border-2 border-brand-dark/8 shadow-soft hover:shadow-premium hover:border-brand-primary/15 transition-all duration-300 hover:-translate-y-0.5"
                        >
                          <Link
                            href={`/blog/${post.slug}`}
                            className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 rounded-2xl"
                          >
                            {post.image && (
                              <div className="relative aspect-[16/10] bg-brand-dark/5 overflow-hidden">
                                <Image
                                  src={post.image}
                                  alt={post.imageAlt || post.title}
                                  fill
                                  className="object-cover transition-transform duration-600 ease-out group-hover:scale-105"
                                  sizes="(max-width: 768px) 100vw, 50vw"
                                />
                                <div className="absolute top-4 left-4">
                                  <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-dark/90 backdrop-blur-sm px-3 py-1.5 text-xs font-semibold text-white shadow-lg">
                                    <Anchor className="h-3 w-3 shrink-0" aria-hidden />
                                    {getCategoryLabel(post.category)}
                                  </span>
                                </div>
                              </div>
                            )}
                            <div className="p-5 sm:p-6 md:p-8">
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-brand-muted">
                                <time dateTime={post.date}>
                                  {new Date(post.date).toLocaleDateString("en-US", {
                                    year: "numeric",
                                    month: "long",
                                    day: "numeric",
                                  })}
                                </time>
                                {post.readingTimeMinutes && (
                                  <span className="inline-flex items-center gap-1.5">
                                    <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    {post.readingTimeMinutes} min read
                                  </span>
                                )}
                              </div>
                              <h4 className="mt-3 sm:mt-4 text-lg sm:text-xl md:text-2xl font-bold text-brand-dark group-hover:text-brand-primary transition-colors line-clamp-2 leading-snug">
                                {post.title}
                              </h4>
                              <p className="mt-2 sm:mt-3 text-brand-muted text-[15px] sm:text-base leading-relaxed line-clamp-3">
                                {post.excerpt}
                              </p>
                              <span className="mt-4 sm:mt-5 inline-flex items-center gap-2 min-h-[44px] text-brand-primary font-semibold text-sm group-hover:gap-3 transition-all duration-200 touch-manipulation">
                                Read more
                                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                              </span>
                            </div>
                          </Link>
                        </motion.article>
                      ))}
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    </>
  );
}
