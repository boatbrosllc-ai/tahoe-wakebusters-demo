import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { brand } from "@/content/brand";
import { blogPosts } from "@/content/blog";

export const metadata: Metadata = {
  title: "Blog | Lake Travis & Lake Austin Boat Tips & News",
  description: `Tips, guides, and updates from ${brand.companyName}. Lake Travis and Lake Austin boat rentals, Austin TX.`,
};

export default function BlogPage() {
  return (
    <div className="section-padding bg-white">
      <div className="container-wide px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-brand-dark mb-2">
          Blog
        </h1>
        <p className="text-lg text-brand-muted mb-10 max-w-2xl">
          Lake Travis tips, what to bring, and updates from the crew.
        </p>
        <div className="grid sm:grid-cols-2 gap-8">
          {blogPosts.map((post) => (
            <article
              key={post.slug}
              className="rounded-2xl border border-brand-dark/10 overflow-hidden bg-white shadow-soft hover:shadow-premium transition-shadow"
            >
              <Link href={`/blog/${post.slug}`} className="block">
                {post.image && (
                  <div className="relative aspect-[16/10] bg-brand-dark/5">
                    <Image
                      src={post.image}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, 50vw"
                    />
                  </div>
                )}
                <div className="p-6">
                  <time className="text-sm text-brand-muted" dateTime={post.date}>
                    {new Date(post.date).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </time>
                  <h2 className="text-xl font-semibold text-brand-dark mt-2 hover:text-brand-primary transition-colors">
                    {post.title}
                  </h2>
                  <p className="text-brand-muted mt-2 line-clamp-2">{post.excerpt}</p>
                </div>
              </Link>
            </article>
          ))}
        </div>
        {blogPosts.length === 0 && (
          <p className="text-brand-muted">Posts coming soon.</p>
        )}
      </div>
    </div>
  );
}
