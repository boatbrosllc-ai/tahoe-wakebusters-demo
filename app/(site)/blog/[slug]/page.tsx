import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { brand } from "@/content/brand";
import { blogPosts, getBlogPostBySlug } from "@/content/blog";
import { Button } from "@/components/ui/button";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return blogPosts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) return { title: "Blog" };
  return {
    title: `${post.title} | Blog`,
    description: post.excerpt,
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) notFound();

  return (
    <div className="section-padding bg-white">
      <article className="container-narrow px-4 sm:px-6 lg:px-8">
        <Link
          href="/blog"
          className="inline-block text-sm font-medium text-brand-primary hover:underline mb-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 rounded"
        >
          ← Blog
        </Link>
        {post.image && (
          <div className="relative aspect-[16/10] rounded-2xl overflow-hidden bg-brand-dark/5 mb-8">
            <Image
              src={post.image}
              alt=""
              fill
              className="object-cover"
              priority
              sizes="(max-width: 1024px) 100vw, 896px"
            />
          </div>
        )}
        <header className="mb-8">
          <time className="text-sm text-brand-muted" dateTime={post.date}>
            {new Date(post.date).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </time>
          {post.author && (
            <span className="text-sm text-brand-muted ml-2">· {post.author}</span>
          )}
          <h1 className="text-3xl sm:text-4xl font-bold text-brand-dark mt-2">
            {post.title}
          </h1>
        </header>
        <div className="prose prose-lg text-brand-muted max-w-none">
          {/* TODO: Replace with MDX or CMS body content when wired up */}
          <p>{post.excerpt}</p>
          <p>
            Full article content will be loaded from CMS or MDX. For now this is a placeholder.
          </p>
        </div>
        <footer className="mt-12 pt-8 border-t border-brand-dark/10">
          <Button asChild variant="outline" size="lg" className="rounded-xl">
            <Link href="/blog">All posts</Link>
          </Button>
        </footer>
      </article>
    </div>
  );
}
