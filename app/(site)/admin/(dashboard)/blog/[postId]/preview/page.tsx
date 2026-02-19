"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BlogContentRenderer } from "@/components/admin/blog/BlogContentRenderer";
import type { BlogPostSerialized } from "@/lib/blog/types";

export default function AdminBlogPreviewPage() {
  const params = useParams();
  const router = useRouter();
  const postId = typeof params.postId === "string" ? params.postId : "";
  const [post, setPost] = useState<BlogPostSerialized | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!postId) return;
    fetch(`/api/admin/blog/${postId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setPost(data as BlogPostSerialized);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [postId]);

  if (!postId) {
    return (
      <div className="p-6 text-brand-muted">
        Missing post.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[40vh] text-brand-muted">
        Loading preview…
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="p-6 rounded-2xl bg-red-50 border border-red-200 text-red-700">
        {error ?? "Post not found"}
        <Button variant="outline" size="sm" className="mt-3" onClick={() => router.push("/admin/blog")}>
          Back to Blog Studio
        </Button>
      </div>
    );
  }

  const content = (post.content ?? []) as import("@/lib/blog/types").ContentBlock[];

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b border-brand-dark/10 bg-white sticky top-0 z-10 px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/admin/blog/${postId}`} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to editor
          </Link>
        </Button>
        <span className="text-sm text-brand-muted">Preview</span>
      </div>

      <header className="relative min-h-[40vh] flex flex-col justify-end bg-brand-dark overflow-hidden">
        {post.coverImage?.url && (
          <>
            <Image
              src={post.coverImage.url}
              alt={post.coverImage.alt ?? post.title}
              fill
              className="object-cover"
              priority
              sizes="100vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-brand-dark via-brand-dark/50 to-transparent" />
          </>
        )}
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-12 w-full">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
            {post.title || "Untitled"}
          </h1>
          {(post.author?.name || post.excerpt) && (
            <div className="mt-4 text-white/90 text-sm">
              {post.author?.name && <span>{post.author.name}</span>}
              {post.excerpt && <p className="mt-2 opacity-90">{post.excerpt}</p>}
            </div>
          )}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <BlogContentRenderer blocks={content} />
      </div>
    </div>
  );
}
