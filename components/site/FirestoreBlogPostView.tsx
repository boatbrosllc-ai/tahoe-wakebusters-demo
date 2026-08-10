"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Calendar, ChevronRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BlogContentRenderer, QuickAnswerBox } from "@/components/admin/blog/BlogContentRenderer";
import type { RelatedArticleLink } from "@/components/experience/RelatedArticlesSection";
import { computeContentStats } from "@/lib/blog/content-stats";
import { brand } from "@/content/brand";
import type { ContentBlock } from "@/lib/blog/types";

export interface FirestorePost {
  id?: string;
  title?: string;
  excerpt?: string;
  slug?: string;
  coverImage?: { url: string; alt?: string } | null;
  author?: { name?: string };
  content?: ContentBlock[];
  updatedAt?: string;
  lastPublishedAt?: string | null;
  categories?: string[];
  tags?: string[];
}

function formatCategoryLabel(cat: string): string {
  return cat
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function GuideRelatedArticles({ articles }: { articles: RelatedArticleLink[] }) {
  if (!articles.length) return null;
  return (
    <aside className="mt-14 sm:mt-16 pt-12 border-t border-brand-dark/10" aria-label="Related guides">
      <h2 className="font-display text-xl sm:text-2xl font-bold text-brand-dark mb-6 sm:mb-8">
        Related Cabo fishing guides
      </h2>
      <ul className="grid gap-6 sm:grid-cols-2">
        {articles.map((article) => (
          <li key={article.href}>
            <Link
              href={article.href}
              className="group flex flex-col h-full rounded-xl sm:rounded-2xl overflow-hidden border border-brand-dark/10 bg-white shadow-soft hover:shadow-premium hover:border-brand-primary/25 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
            >
              {article.image && (
                <div className="relative aspect-[16/10] bg-brand-dark/5 overflow-hidden">
                  <Image
                    src={article.image}
                    alt={article.imageAlt ?? article.title}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, 50vw"
                  />
                </div>
              )}
              <div className="p-5 sm:p-6 flex flex-col flex-1">
                <h3 className="font-bold text-brand-dark group-hover:text-brand-primary transition-colors line-clamp-2 text-base sm:text-lg leading-snug">
                  {article.title}
                </h3>
                <p className="mt-2 text-sm text-brand-muted line-clamp-2 leading-relaxed flex-1">
                  {article.excerpt}
                </p>
                <span className="mt-3 text-sm font-medium text-brand-primary inline-flex items-center gap-1">
                  Read guide
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function FirestoreBlogPostView({
  post,
  relatedArticles = [],
}: {
  post: FirestorePost;
  relatedArticles?: RelatedArticleLink[];
}) {
  const content = (post.content ?? []) as ContentBlock[];
  const quickAnswerBlocks = content.filter((b) => b.type === "quickAnswer");
  const faqBlocks = content.filter((b) => b.type === "faq");
  const bodyBlocks = content.filter((b) => b.type !== "quickAnswer" && b.type !== "faq");
  const stats = computeContentStats(content);
  const date = post.lastPublishedAt ?? post.updatedAt;
  const primaryCategory = post.categories?.[0];

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <header className="relative min-h-[52vh] sm:min-h-[58vh] md:min-h-[62vh] flex flex-col justify-end bg-brand-dark overflow-hidden">
        {post.coverImage?.url && (
          <>
            <Image
              src={post.coverImage.url}
              alt={post.coverImage.alt ?? post.title ?? ""}
              fill
              className="object-cover object-center"
              priority
              sizes="100vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-brand-dark via-brand-dark/55 to-brand-dark/25" />
            <div className="absolute inset-0 grain-overlay" aria-hidden />
          </>
        )}
        <div className="relative z-10 section-padding pb-10 sm:pb-16 pt-20 sm:pt-24">
          <div className="container-wide px-4 sm:px-6 lg:px-8 max-w-4xl min-w-0">
            <nav
              aria-label="Breadcrumb"
              className="flex flex-wrap items-center gap-1.5 text-xs sm:text-sm text-white/80 mb-4 sm:mb-6"
            >
              <Link href="/blog" className="hover:text-white transition-colors">
                The Dock
              </Link>
              <ChevronRight className="h-3.5 w-3.5 text-white/50 shrink-0" aria-hidden />
              {primaryCategory && (
                <>
                  <span className="text-white/90">{formatCategoryLabel(primaryCategory)}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-white/50 shrink-0" aria-hidden />
                </>
              )}
              <span className="text-white font-medium truncate max-w-[200px] sm:max-w-none">{post.title}</span>
            </nav>
            {primaryCategory && (
              <span className="inline-block mb-3 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-white/15 text-white/95 backdrop-blur-sm border border-white/20">
                {formatCategoryLabel(primaryCategory)}
              </span>
            )}
            <h1 className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-[3.25rem] font-bold text-white tracking-tight leading-[1.12]">
              {post.title ?? "Untitled"}
            </h1>
            <div className="flex flex-wrap items-center gap-3 sm:gap-5 mt-4 sm:mt-6 text-xs sm:text-sm text-white/90">
              {date && (
                <time dateTime={date} className="inline-flex items-center gap-2">
                  <Calendar className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                  {new Date(date).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </time>
              )}
              {stats.readingTimeMinutes > 0 && (
                <span className="inline-flex items-center gap-2">
                  <Clock className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                  {stats.readingTimeMinutes} min read
                </span>
              )}
              {post.author?.name && <span>{post.author.name}</span>}
            </div>
          </div>
        </div>
      </header>

      <main className="section-padding pt-10 sm:pt-14 pb-16">
        <article className="container-narrow px-4 sm:px-6 lg:px-8">
          {post.excerpt && (
            <p className="text-lg sm:text-xl text-brand-muted leading-relaxed mb-8 sm:mb-10 max-w-[65ch] font-medium">
              {post.excerpt}
            </p>
          )}

          {quickAnswerBlocks.map((block) => (
            <QuickAnswerBox key={block.id} block={block} />
          ))}

          <BlogContentRenderer blocks={bodyBlocks} />

          {faqBlocks.map((block) => (
            <BlogContentRenderer key={block.id} blocks={[block]} variant="faq-section" />
          ))}

          <GuideRelatedArticles articles={relatedArticles} />

          <div className="mt-12 sm:mt-14 pt-8 sm:pt-10 border-t border-brand-dark/10 rounded-xl sm:rounded-2xl bg-brand-bg/60 px-5 py-7 sm:px-8 sm:py-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5 sm:gap-6">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-brand-dark">
                  {post.author?.name ?? brand.companyName}
                </p>
                <p className="text-sm text-brand-muted mt-1">
                  Ready for Cabo? Book Nasty Half Day or Nasty Full Day.
                </p>
              </div>
              <Button
                asChild
                size="lg"
                className="rounded-xl shrink-0 w-full sm:w-fit min-h-[48px] bg-brand-primary hover:bg-brand-primary/90 text-white shadow-[0_4px_14px_rgba(80,189,186,0.35)]"
              >
                <Link href="/experiences" className="w-full justify-center">
                  Book a Cabo charter
                </Link>
              </Button>
            </div>
          </div>

          <footer className="mt-8 sm:mt-10">
            <Button
              asChild
              variant="outline"
              size="lg"
              className="rounded-xl w-full sm:w-fit min-h-[48px]"
            >
              <Link href="/blog" className="inline-flex items-center justify-center gap-2">
                <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
                Back to The Bite
              </Link>
            </Button>
          </footer>
        </article>
      </main>
    </div>
  );
}
