"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { BlogEditorShell } from "@/components/admin/blog/BlogEditorShell";
import type { BlogPostSerialized } from "@/lib/blog/types";

export default function AdminBlogPostEditorPage() {
  const params = useParams();
  const router = useRouter();
  const postId = typeof params.postId === "string" ? params.postId : "";
  const [post, setPost] = useState<BlogPostSerialized | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPost = useCallback(async () => {
    if (!postId) return;
    const res = await fetch(`/api/admin/blog/${postId}`, { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Failed to load post");
      setPost(null);
      return;
    }
    setPost(data as BlogPostSerialized);
    setError(null);
  }, [postId]);

  useEffect(() => {
    fetchPost().finally(() => setLoading(false));
  }, [fetchPost]);

  if (!postId) {
    return (
      <div className="p-6 text-brand-muted">
        Missing post ID.
      </div>
    );
  }

  if (loading && !post) {
    return (
      <div className="p-6 sm:p-8 animate-pulse" aria-busy="true" aria-label="Loading post">
        <div className="h-8 w-48 rounded-lg bg-brand-dark/10 mb-6" />
        <div className="h-4 w-full rounded bg-brand-dark/10 mb-2" />
        <div className="h-4 w-3/4 rounded bg-brand-dark/10 mb-6" />
        <div className="h-24 rounded-xl bg-brand-dark/10 mb-4" />
        <div className="h-32 rounded-xl bg-brand-dark/10" />
      </div>
    );
  }

  if (error && !post) {
    return (
      <div className="p-6 sm:p-8 max-w-lg">
        <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-red-700" role="alert">
          <p className="font-medium">Couldn’t load this post</p>
          <p className="mt-1 text-sm">{error}</p>
          <div className="flex flex-wrap gap-3 mt-4">
            <button
              type="button"
              onClick={() => { setError(null); setLoading(true); fetchPost().finally(() => setLoading(false)); }}
              className="text-sm font-medium text-red-700 underline hover:no-underline"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => router.push("/admin/blog")}
              className="text-sm font-medium text-red-700 underline hover:no-underline"
            >
              Back to Blog Studio
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="p-6 text-brand-muted">
        Post not found.
      </div>
    );
  }

  return (
    <BlogEditorShell
      postId={postId}
      initialPost={post}
      onBack={() => router.push("/admin/blog")}
    />
  );
}
