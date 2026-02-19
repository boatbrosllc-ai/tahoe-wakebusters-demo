import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { brand } from "@/content/brand";
import {
  blogPosts,
  getBlogPostBySlug,
  getCategoryLabel,
  getBlogPostsByCategory,
  type BlogBodyBlock,
} from "@/content/blog";
import { getPublishedPostBySlug } from "@/lib/blog/firestore";
import { FirestoreBlogPostView } from "@/components/site/FirestoreBlogPostView";
import { Clock, Anchor, ArrowLeft, ChevronRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReadingProgress } from "@/components/site/ReadingProgress";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://boatbrosatx.com";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return blogPosts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const staticPost = getBlogPostBySlug(slug);
  if (staticPost) {
    const title = `${staticPost.title} | The Dock | ${brand.companyName}`;
    const description = staticPost.excerpt.slice(0, 160);
    const canonical = `${baseUrl}/blog/${staticPost.slug}`;
    const ogImage = staticPost.image ? `${baseUrl}${staticPost.image}` : undefined;
    return {
      title,
      description,
      keywords: staticPost.seoKeywords ?? [],
      openGraph: {
        title: staticPost.title,
        description,
        url: canonical,
        type: "article",
        publishedTime: staticPost.date,
        modifiedTime: staticPost.dateModified,
        authors: staticPost.author ? [staticPost.author] : undefined,
        images: ogImage ? [{ url: ogImage, alt: staticPost.imageAlt ?? staticPost.title }] : undefined,
      },
      alternates: { canonical },
      robots: "index, follow",
    };
  }
  const firestorePost = await getPublishedPostBySlug(slug);
  if (firestorePost) {
    const title = `${(firestorePost.title as string) ?? "Post"} | The Dock | ${brand.companyName}`;
    const descRaw = (firestorePost.seo as { metaDescription?: string })?.metaDescription ?? (firestorePost.excerpt as string | undefined) ?? "";
    const description = String(descRaw).slice(0, 160);
    const canonical = `${baseUrl}/blog/${firestorePost.slug}`;
    const cover = firestorePost.coverImage as { url?: string } | null;
    const ogImage = cover?.url;
    return {
      title,
      description,
      openGraph: {
        title: firestorePost.title as string,
        description,
        url: canonical,
        type: "article",
        publishedTime: (firestorePost.lastPublishedAt as string) ?? undefined,
        modifiedTime: (firestorePost.updatedAt as string) ?? undefined,
        authors: (firestorePost.author as { name?: string })?.name ? [(firestorePost.author as { name: string }).name] : undefined,
        images: ogImage ? [{ url: ogImage, alt: (firestorePost.coverImage as { alt?: string })?.alt ?? (firestorePost.title as string) }] : undefined,
      },
      alternates: { canonical },
      robots: (firestorePost.seo as { robotsIndex?: boolean })?.robotsIndex !== false ? "index, follow" : "noindex, nofollow",
    };
  }
  return { title: "The Dock" };
}

function ArticleJsonLd({
  post,
  canonical,
}: {
  post: NonNullable<ReturnType<typeof getBlogPostBySlug>>;
  canonical: string;
}) {
  const imageUrl = post.image ? `${baseUrl}${post.image}` : undefined;
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    image: imageUrl ? [imageUrl] : undefined,
    datePublished: post.date,
    dateModified: post.dateModified ?? post.date,
    author: {
      "@type": "Organization",
      name: post.author ?? brand.companyName,
      url: baseUrl,
    },
    publisher: {
      "@type": "Organization",
      name: brand.companyName,
      url: baseUrl,
      logo: {
        "@type": "ImageObject",
        url: `${baseUrl}${brand.logoPath}`,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": canonical,
    },
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

function BreadcrumbJsonLd({
  post,
  canonical,
}: {
  post: NonNullable<ReturnType<typeof getBlogPostBySlug>>;
  canonical: string;
}) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "The Dock", item: `${baseUrl}/blog` },
      { "@type": "ListItem", position: 2, name: getCategoryLabel(post.category), item: `${baseUrl}/blog?category=${post.category}` },
      { "@type": "ListItem", position: 3, name: post.title, item: canonical },
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

function FaqJsonLd({ post }: { post: NonNullable<ReturnType<typeof getBlogPostBySlug>> }) {
  if (!post.faqs?.length) return null;
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: post.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.a,
      },
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

/** Parse [text](url) in paragraph content for inline links (internal + external). */
function parseInlineLinks(content: string): (string | { text: string; href: string; external: boolean })[] {
  const segments: (string | { text: string; href: string; external: boolean })[] = [];
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push(content.slice(lastIndex, match.index));
    }
    segments.push({
      text: match[1],
      href: match[2],
      external: match[2].startsWith("http"),
    });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < content.length) {
    segments.push(content.slice(lastIndex));
  }
  return segments.length ? segments : [content];
}

const linkClass =
  "text-brand-primary font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 rounded";

function Block({ block }: { block: BlogBodyBlock }) {
  switch (block.type) {
    case "p": {
      const segments = parseInlineLinks(block.content);
      return (
        <p className="text-brand-muted text-base sm:text-[17px] leading-[1.75] mb-5 sm:mb-6 max-w-[65ch]">
          {segments.map((seg, i) =>
            typeof seg === "string" ? (
              <span key={i}>{seg}</span>
            ) : seg.external ? (
              <a
                key={i}
                href={seg.href}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
              >
                {seg.text}
                <span className="sr-only">(opens in new tab)</span>
              </a>
            ) : (
              <Link key={i} href={seg.href} className={linkClass}>
                {seg.text}
              </Link>
            )
          )}
        </p>
      );
    }
    case "h2":
      return (
        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-brand-dark mt-10 sm:mt-12 mb-3 sm:mb-4 pt-2 border-l-4 border-brand-primary pl-4 sm:pl-5 first:mt-0">
          {block.content}
        </h2>
      );
    case "h3":
      return (
        <h3 className="text-lg sm:text-xl font-bold text-brand-dark mt-6 sm:mt-8 mb-2 sm:mb-3">
          {block.content}
        </h3>
      );
    case "ul":
      return (
        <ul className="list-none space-y-2.5 sm:space-y-3 mb-5 sm:mb-6 pl-0 max-w-[65ch] text-base sm:text-[17px]">
          {block.items.map((item, i) => (
            <li key={i} className="pl-6 relative text-brand-muted leading-relaxed">
              {item}
            </li>
          ))}
        </ul>
      );
    default:
      return null;
  }
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const staticPost = getBlogPostBySlug(slug);
  const firestorePost = !staticPost ? await getPublishedPostBySlug(slug) : null;

  if (firestorePost) {
    const schema = firestorePost.schema as { articleJsonLd?: object; breadcrumbJsonLd?: object; faqJsonLd?: object } | undefined;
    return (
      <>
        {schema?.articleJsonLd && (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema.articleJsonLd) }} />
        )}
        {schema?.breadcrumbJsonLd && (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema.breadcrumbJsonLd) }} />
        )}
        {schema?.faqJsonLd && (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema.faqJsonLd) }} />
        )}
        <ReadingProgress />
        <FirestoreBlogPostView post={firestorePost as import("@/components/site/FirestoreBlogPostView").FirestorePost} />
      </>
    );
  }

  const post = staticPost;
  if (!post) notFound();

  const canonical = `${baseUrl}/blog/${post.slug}`;
  const related = getBlogPostsByCategory(post.category).filter(
    (p) => p.slug !== post.slug
  );

  return (
    <>
      <ArticleJsonLd post={post} canonical={canonical} />
      <BreadcrumbJsonLd post={post} canonical={canonical} />
      <FaqJsonLd post={post} />
      <ReadingProgress />
      <div className="min-h-screen bg-white overflow-x-hidden">
        {/* Hero – full viewport height option, premium overlay */}
        <header className="relative min-h-[50vh] sm:min-h-[55vh] md:min-h-[60vh] flex flex-col justify-end bg-brand-dark overflow-hidden">
          {post.image && (
            <>
              <Image
                src={post.image}
                alt={post.imageAlt ?? post.title}
                fill
                className="object-cover object-center"
                priority
                sizes="100vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-brand-dark via-brand-dark/50 to-brand-dark/30" />
              <div className="absolute inset-0 grain-overlay" aria-hidden />
            </>
          )}
          <div className="relative z-10 section-padding pb-10 sm:pb-16 pt-20 sm:pt-24">
            <div className="container-wide px-4 sm:px-6 lg:px-8 max-w-4xl min-w-0">
              <nav
                aria-label="Breadcrumb"
                className="flex flex-wrap items-center gap-1.5 text-xs sm:text-sm text-white/80 mb-4 sm:mb-6 overflow-x-auto scrollbar-hide"
              >
                <Link
                  href="/blog"
                  className="hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark rounded"
                >
                  The Dock
                </Link>
                <ChevronRight className="h-4 w-4 text-white/60 shrink-0" aria-hidden />
                <span className="text-white/90">{getCategoryLabel(post.category)}</span>
                <ChevronRight className="h-4 w-4 text-white/60 shrink-0" aria-hidden />
                <span className="text-white font-medium truncate max-w-[180px] sm:max-w-none">
                  {post.title}
                </span>
              </nav>
              <h1 className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-white tracking-tight leading-[1.12]">
                {post.title}
              </h1>
              <div className="flex flex-wrap items-center gap-3 sm:gap-6 mt-4 sm:mt-6 text-xs sm:text-sm text-white/90">
                {post.date && (
                  <time dateTime={post.date} className="inline-flex items-center gap-2">
                    <Calendar className="h-4 w-4 shrink-0" aria-hidden />
                    {new Date(post.date).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </time>
                )}
                {post.readingTimeMinutes && (
                  <span className="inline-flex items-center gap-2">
                    <Clock className="h-4 w-4 shrink-0" aria-hidden />
                    {post.readingTimeMinutes} min read
                  </span>
                )}
                {post.author && (
                  <span className="inline-flex items-center gap-2">
                    <Anchor className="h-4 w-4 shrink-0" aria-hidden />
                    {post.author}
                  </span>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Article body – elevated prose */}
        <main>
          <article className="section-padding">
            <div className="container-narrow px-4 sm:px-6 lg:px-8">
              {post.keyTakeaways && post.keyTakeaways.length > 0 && (
                <div className="mb-10 sm:mb-12 rounded-xl sm:rounded-2xl border-2 border-brand-primary/30 bg-brand-bg/70 px-4 py-5 sm:px-8 sm:py-8" role="complementary" aria-label="Key takeaways">
                  <h2 className="text-base sm:text-lg font-bold text-brand-dark mb-3 sm:mb-4">Key takeaways</h2>
                  <ul className="space-y-2.5 sm:space-y-3">
                    {post.keyTakeaways.map((takeaway, i) => (
                      <li key={i} className="flex gap-3 text-brand-muted text-[15px] sm:text-base leading-relaxed">
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-primary" aria-hidden />
                        {takeaway}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="article-prose max-w-none">
                {post.body.map((block, i) => (
                  <Block key={i} block={block} />
                ))}
              </div>
              {post.faqs && post.faqs.length > 0 && (
                <section className="mt-12 sm:mt-14 pt-10 sm:pt-12 border-t border-brand-dark/10" aria-label="Frequently asked questions">
                  <h2 className="text-xl sm:text-2xl font-bold text-brand-dark mb-6 sm:mb-8">Frequently asked questions</h2>
                  <ul className="space-y-4 sm:space-y-6">
                    {post.faqs.map((faq, i) => (
                      <li key={i} className="rounded-xl border border-brand-dark/10 bg-white p-4 sm:p-6 shadow-soft">
                        <h3 className="font-bold text-brand-dark text-base sm:text-lg mb-1.5 sm:mb-2">{faq.q}</h3>
                        <p className="text-brand-muted text-[15px] sm:text-base leading-relaxed">{faq.a}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Related links – internal + external for SEO (Google values both) */}
              {post.relatedLinks && post.relatedLinks.length > 0 && (
                <nav className="mt-12 sm:mt-14 pt-10 sm:pt-12 border-t border-brand-dark/10" aria-label="More to explore">
                  <h2 className="text-xl sm:text-2xl font-bold text-brand-dark mb-6">More to explore</h2>
                  <div className={`grid gap-6 ${post.relatedLinks.some((l) => l.external) && post.relatedLinks.some((l) => !l.external) ? "sm:grid-cols-2" : ""}`}>
                    {post.relatedLinks.some((l) => !l.external) && (
                      <div>
                        <h3 className="text-sm font-semibold uppercase tracking-wider text-brand-muted mb-3">On our site</h3>
                        <ul className="space-y-2">
                          {post.relatedLinks.filter((l) => !l.external).map((link, i) => (
                            <li key={i}>
                              <Link
                                href={link.href}
                                className="text-brand-primary font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 rounded"
                              >
                                {link.text}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {post.relatedLinks.some((l) => l.external) && (
                      <div>
                        <h3 className="text-sm font-semibold uppercase tracking-wider text-brand-muted mb-3">Elsewhere</h3>
                        <ul className="space-y-2">
                          {post.relatedLinks.filter((l) => l.external).map((link, i) => (
                            <li key={i}>
                              <a
                                href={link.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-brand-primary font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 rounded"
                              >
                                {link.text}
                                <span className="sr-only">(opens in new tab)</span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </nav>
              )}

              {/* Author / CTA strip – full-width CTA on mobile */}
              <div className="mt-12 sm:mt-14 pt-8 sm:pt-10 border-t border-brand-dark/10 rounded-xl sm:rounded-2xl bg-brand-bg/60 px-4 py-6 sm:px-8 sm:py-8">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5 sm:gap-6">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-brand-dark">{post.author ?? brand.companyName}</p>
                    <p className="text-sm text-brand-muted mt-1">
                      Ready for your Lake Austin day? Book a pontoon, wake boat, or sunset cruise.
                    </p>
                  </div>
                  <Button asChild size="lg" className="rounded-xl shrink-0 w-full sm:w-fit min-h-[48px] touch-manipulation bg-brand-primary hover:bg-brand-primary/90 text-white shadow-[0_4px_14px_rgba(80,189,186,0.35)]">
                    <Link href="/experiences" className="w-full justify-center">Book a boat rental</Link>
                  </Button>
                </div>
              </div>

              <footer className="mt-8 sm:mt-10 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
                <Button asChild variant="outline" size="lg" className="rounded-xl w-full sm:w-fit min-h-[48px] touch-manipulation">
                  <Link href="/blog" className="inline-flex items-center justify-center gap-2 w-full sm:w-auto">
                    <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
                    Back to The Dock
                  </Link>
                </Button>
              </footer>

              {/* More from this category – image cards */}
              {related.length > 0 && (
                <aside className="mt-12 sm:mt-16 pt-10 sm:pt-14 border-t border-brand-dark/10" aria-label="More from this category">
                  <h2 className="text-xl sm:text-2xl font-bold text-brand-dark mb-6 sm:mb-8">
                    More from {getCategoryLabel(post.category)}
                  </h2>
                  <ul className="grid gap-6 sm:gap-8 sm:grid-cols-2">
                    {related.slice(0, 2).map((p) => (
                      <li key={p.slug}>
                        <Link
                          href={`/blog/${p.slug}`}
                          className="group block rounded-xl sm:rounded-2xl overflow-hidden border border-brand-dark/10 bg-white shadow-soft hover:shadow-premium hover:border-brand-primary/20 transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 min-h-[44px] touch-manipulation"
                        >
                          {p.image && (
                            <div className="relative aspect-[16/10] bg-brand-dark/5 overflow-hidden">
                              <Image
                                src={p.image}
                                alt={p.imageAlt ?? p.title}
                                fill
                                className="object-cover transition-transform duration-500 group-hover:scale-105"
                                sizes="(max-width: 640px) 100vw, 50vw"
                              />
                            </div>
                          )}
                          <div className="p-4 sm:p-5 md:p-6">
                            <span className="text-xs font-semibold text-brand-primary uppercase tracking-wider">
                              {getCategoryLabel(p.category)}
                            </span>
                            <h3 className="mt-1.5 sm:mt-2 font-bold text-brand-dark group-hover:text-brand-primary transition-colors line-clamp-2 text-base sm:text-lg leading-snug">
                              {p.title}
                            </h3>
                            <p className="mt-1.5 sm:mt-2 text-[15px] sm:text-sm text-brand-muted line-clamp-2 leading-relaxed">
                              {p.excerpt}
                            </p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </aside>
              )}
            </div>
          </article>
        </main>
      </div>
    </>
  );
}
