"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { brand } from "@/content/brand";
import { blogPosts, getCategoryLabel, type BlogCategory } from "@/content/blog";
import { Clock, Anchor, ArrowRight, Sparkles, Waves } from "lucide-react";

const DOCK_CATEGORIES: { id: BlogCategory; label: string; description: string }[] = [
  { id: "boat-tips", label: "Boat Tips", description: "What to bring, how to prep, captain advice" },
  { id: "austin-events", label: "Austin Events", description: "What's on in Austin & on the lake" },
  { id: "lake-news", label: "Lake & Boating News", description: "Lake Austin, boating, and water news" },
  { id: "general", label: "Stories", description: "Crew stories and lake life" },
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

export default function TheDockPage() {
  const [filter, setFilter] = useState<BlogCategory | "all">("all");
  const filtered = useMemo(
    () => (filter === "all" ? blogPosts : blogPosts.filter((p) => p.category === filter)),
    [filter]
  );
  const featured = filtered[0];
  const rest = filtered.slice(1);

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* Hero – bold, unmistakable: full-bleed + wave accent + big typography */}
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
        {/* Decorative wave line */}
        <div className="absolute bottom-0 left-0 right-0 h-2 bg-brand-primary/30" aria-hidden />
        <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-2 pb-2" aria-hidden>
          <Waves className="h-5 w-5 text-brand-primary/60" />
        </div>
        <div className="relative z-10 section-padding text-center pb-12 sm:pb-20 pt-16 sm:pt-20 px-4">
          <motion.p
            className="text-brand-primary font-bold uppercase tracking-[0.28em] sm:tracking-[0.35em] text-xs sm:text-sm mb-4 sm:mb-5"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          >
            From the crew at {brand.companyName}
          </motion.p>
          <motion.h1
            className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl 2xl:text-9xl font-bold tracking-tighter leading-[0.95]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.06 }}
          >
            The Dock
          </motion.h1>
          <motion.p
            className="mt-4 sm:mt-6 text-[15px] sm:text-base md:text-lg lg:text-xl text-white/90 max-w-2xl mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.12 }}
          >
            Boat tips, Austin events, lake & boating news — everything that makes a day on Lake Austin better.
          </motion.p>
          <motion.div
            className="mt-8 flex flex-wrap justify-center gap-4 text-sm text-white/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
          >
            <span>Boat tips</span>
            <span aria-hidden>·</span>
            <span>Austin events</span>
            <span aria-hidden>·</span>
            <span>Lake news</span>
          </motion.div>
        </div>
      </section>

      {/* Sticky category bar – touch-friendly on mobile */}
      <section className="sticky top-16 lg:top-20 z-30 border-b-2 border-brand-primary/20 bg-white shadow-[0_4px_20px_rgba(0,28,48,0.06)]">
        <div className="container-wide px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          <p className="text-center text-xs font-semibold uppercase tracking-wider text-brand-muted mb-3 sm:mb-4">
            Browse by topic
          </p>
          <div className="flex flex-wrap gap-2 sm:gap-3 justify-center">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`min-h-[44px] min-w-[44px] touch-manipulation px-4 sm:px-5 py-3 sm:py-2.5 rounded-full text-sm font-semibold transition-all duration-200 ${
                filter === "all"
                  ? "bg-brand-primary text-white shadow-[0_4px_16px_rgba(80,189,186,0.45)] ring-2 ring-brand-primary/30"
                  : "bg-brand-bg text-brand-dark/80 hover:bg-brand-dark/5 border-2 border-brand-dark/10"
              }`}
            >
              All
            </button>
            {DOCK_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setFilter(cat.id)}
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

      {/* Featured post (first) + rest in grid – unmistakable layout change */}
      <section className="section-padding bg-gradient-to-b from-brand-bg/50 via-white to-brand-bg/30">
        <div className="container-wide px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-brand-dark mb-2 text-center">
            Latest from the crew
          </h2>
          <p className="text-center text-brand-muted max-w-xl mx-auto mb-12">
            Tips, events, and lake news to get the most out of your Lake Austin boat rental.
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
                  onClick={() => setFilter("all")}
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
                {/* Featured: first post = large card */}
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

                {/* Rest of posts: grid */}
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

      {/* CTA – high impact, touch-friendly on mobile */}
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
