"use client";

import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "lucide-react";

export interface RelatedArticleLink {
  href: string;
  title: string;
  excerpt: string;
  image?: string;
  imageAlt?: string;
}

export function RelatedArticlesSection({ articles }: { articles: RelatedArticleLink[] }) {
  if (!articles.length) return null;
  return (
    <section className="px-5 sm:px-6 lg:px-8 py-12 sm:py-16 bg-brand-bg" aria-labelledby="related-articles-heading">
      <div className="max-w-7xl mx-auto">
        <h2
          id="related-articles-heading"
          className="font-display text-2xl sm:text-3xl font-bold text-brand-dark text-center mb-8"
        >
          From The Dock
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {articles.map((article) => (
            <Link
              key={article.href}
              href={article.href}
              className="group flex flex-col overflow-hidden rounded-xl border border-brand-dark/10 bg-white hover:border-brand-primary/40 hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
            >
              {article.image ? (
                <div className="relative aspect-[16/10] bg-brand-dark/5">
                  <Image
                    src={article.image}
                    alt={article.imageAlt ?? article.title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                </div>
              ) : null}
              <div className="p-6">
                <h3 className="text-lg font-semibold text-brand-dark group-hover:text-brand-primary mb-2 flex items-start gap-1">
                  <span className="flex-1">{article.title}</span>
                  <ChevronRight className="h-5 w-5 shrink-0 opacity-60 group-hover:translate-x-0.5 transition-transform" aria-hidden />
                </h3>
                <p className="text-sm text-brand-dark/70 leading-relaxed">{article.excerpt}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
