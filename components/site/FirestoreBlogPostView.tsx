"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BlogContentRenderer } from "@/components/admin/blog/BlogContentRenderer";
import { brand } from "@/content/brand";
import type { ContentBlock } from "@/lib/blog/types";

interface FirestorePost {
  title?: string;
  excerpt?: string;
  slug?: string;
  coverImage?: { url: string; alt?: string } | null;
  author?: { name?: string };
  content?: ContentBlock[];
  updatedAt?: string;
  lastPublishedAt?: string | null;
}

export function FirestoreBlogPostView({ post }: { post: FirestorePost }) {
  const content = (post.content ?? []) as ContentBlock[];
  const date = post.lastPublishedAt ?? post.updatedAt;

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <header className="relative min-h-[50vh] sm:min-h-[55vh] flex flex-col justify-end bg-brand-dark overflow-hidden">
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
            <div className="absolute inset-0 bg-gradient-to-t from-brand-dark via-brand-dark/50 to-brand-dark/30" />
          </>
        )}
        <div className="relative z-10 section-padding pb-10 sm:pb-16 pt-20 sm:pt-24">
          <div className="container-wide px-4 sm:px-6 lg:px-8 max-w-4xl min-w-0">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs sm:text-sm text-white/80 mb-4">
              <Link href="/blog" className="hover:text-white transition-colors">
                The Dock
              </Link>
              <span className="text-white/60">/</span>
              <span className="text-white font-medium truncate">{post.title}</span>
            </nav>
            <h1 className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white tracking-tight">
              {post.title ?? "Untitled"}
            </h1>
            <div className="flex flex-wrap items-center gap-3 mt-4 text-xs sm:text-sm text-white/90">
              {date && (
                <time dateTime={date}>
                  {new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                </time>
              )}
              {post.author?.name && <span>{post.author.name}</span>}
            </div>
          </div>
        </div>
      </header>

      <main className="section-padding pt-10 sm:pt-14">
        <article className="container-wide px-4 sm:px-6 lg:px-8 max-w-4xl min-w-0">
          {post.excerpt && (
            <p className="text-lg text-brand-muted mb-8 max-w-[65ch]">{post.excerpt}</p>
          )}
          <BlogContentRenderer blocks={content} />

          <div className="mt-12 pt-10 border-t border-brand-dark/10">
            <p className="text-sm font-semibold text-brand-dark">{post.author?.name ?? brand.companyName}</p>
            <p className="text-sm text-brand-muted mt-1">Ready for your Lake Austin day? Book a pontoon, wake boat, or sunset cruise.</p>
            <Button asChild size="lg" className="mt-4 rounded-xl">
              <Link href="/experiences">Book a boat rental</Link>
            </Button>
          </div>

          <footer className="mt-10">
            <Button asChild variant="outline" size="lg" className="rounded-xl">
              <Link href="/blog" className="inline-flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" /> Back to The Dock
              </Link>
            </Button>
          </footer>
        </article>
      </main>
    </div>
  );
}
