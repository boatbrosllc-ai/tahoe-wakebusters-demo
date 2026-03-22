"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { Plus, Search, ExternalLink, RefreshCw, Pencil, FileText, Archive, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

type BlogPostListItem = {
  id: string;
  title: string;
  slug: string;
  excerpt?: string;
  status: string;
  publishAt?: string | null;
  updatedAt: string;
  coverImage?: { url: string; alt?: string } | null;
  source?: "static";
};

const statusColors: Record<string, string> = {
  draft: "bg-brand-muted/30 text-brand-muted",
  in_review: "bg-amber-100 text-amber-800",
  scheduled: "bg-blue-100 text-blue-800",
  published: "bg-emerald-100 text-emerald-800",
  archived: "bg-brand-dark/10 text-brand-muted",
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  in_review: "In review",
  scheduled: "Scheduled",
  published: "Published",
  archived: "Archived",
};

function ListSkeleton() {
  return (
    <ul className="divide-y divide-brand-dark/10">
      {[1, 2, 3, 4, 5].map((i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-4 sm:px-6 animate-pulse">
          <div className="h-12 w-20 shrink-0 rounded-lg bg-brand-dark/10" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="h-4 w-3/4 rounded bg-brand-dark/10" />
            <div className="h-3 w-1/4 rounded bg-brand-dark/5" />
          </div>
          <div className="h-9 w-16 rounded-lg bg-brand-dark/10 shrink-0" />
        </li>
      ))}
    </ul>
  );
}

export default function AdminBlogPage() {
  const [posts, setPosts] = useState<BlogPostListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sort, setSort] = useState("updatedAt");

  const fetchPosts = useCallback(async () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (sort) params.set("sort", sort);
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    const res = await fetch(`/api/admin/blog?${params}`, { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.error ?? (res.status === 401 ? "Unauthorized" : "Failed to load");
      throw new Error(msg);
    }
    const list = (data.posts ?? []) as BlogPostListItem[];
    setPosts(list);
  }, [statusFilter, sort, debouncedSearch]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchPosts()
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [fetchPosts]);

  const handleRefresh = () => {
    setLoading(true);
    setError(null);
    fetchPosts().catch((e) => setError(e instanceof Error ? e.message : "Error")).finally(() => setLoading(false));
  };

  const handleArchive = useCallback(async (postId: string) => {
    try {
      const res = await fetch(`/api/admin/blog/${postId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "archive" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Archive failed");
      }
      await fetchPosts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Archive failed");
    }
  }, [fetchPosts]);

  const handleDelete = useCallback(async (postId: string, title: string) => {
    if (!confirm(`Permanently delete "${title || "Untitled"}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/blog/${postId}`, { method: "DELETE", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      await fetchPosts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }, [fetchPosts]);

  const filtered = posts;

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">Blog Studio</h1>
          <p className="mt-1 text-sm text-brand-muted max-w-xl">
            Create, edit, and publish posts. Every post has an edit button—open it to change title, content blocks, cover image, SEO, and publish settings.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading} className="gap-2 min-h-[44px]" aria-label="Refresh list">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
          <Link href="/admin/blog/new">
            <Button className="min-h-[44px] gap-2">
              <Plus className="h-4 w-4" aria-hidden />
              New post
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-muted" aria-hidden />
          <input
            type="search"
            placeholder="Search title, slug, or content…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-brand-dark/20 bg-white text-brand-dark placeholder:text-brand-muted text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
            aria-label="Search posts"
          />
        </div>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-brand-dark/20 bg-white px-3 py-2 text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="in_review">In review</option>
          <option value="scheduled">Scheduled</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <select
          aria-label="Sort by"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-xl border border-brand-dark/20 bg-white px-3 py-2 text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
        >
          <option value="updatedAt">Last updated</option>
          <option value="publishAt">Publish date</option>
        </select>
      </div>

      <div className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 overflow-hidden">
        {loading && !filtered.length ? (
          <ListSkeleton />
        ) : error ? (
          <div className="p-6 sm:p-8 text-red-600 bg-red-50 border-b border-red-200 text-sm rounded-t-2xl">
            <p className="font-medium">{error}</p>
            {(error === "Unauthorized" || error.includes("not configured")) && (
              <Link href="/admin/login" className="inline-block mt-2 text-brand-primary hover:underline font-medium">
                Sign in to Blog Studio
              </Link>
            )}
            <Button variant="outline" size="sm" className="mt-3" onClick={handleRefresh}>
              Try again
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 sm:p-12 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-primary/10 text-brand-primary mb-4">
              <FileText className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-semibold text-brand-dark">No posts match your filters</h2>
            <p className="mt-1 text-sm text-brand-muted max-w-sm mx-auto">
              {search || statusFilter ? "Try changing search or status filter, or create a new post." : "Create your first post to get started."}
            </p>
            <Link href="/admin/blog/new" className="inline-block mt-4">
              <Button className="gap-2 min-h-[44px]">
                <Plus className="h-4 w-4" />
                Create your first post
              </Button>
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-brand-dark/10">
            {filtered.map((post) => (
              <li
                key={post.id}
                className={cn(
                  "flex items-center gap-3 px-4 py-4 sm:px-6 transition-colors min-h-[72px]",
                  "hover:bg-brand-bg/50"
                )}
              >
                {post.coverImage?.url ? (
                  <div className="relative h-14 w-24 shrink-0 rounded-xl overflow-hidden bg-brand-dark/5">
                    <Image
                      src={post.coverImage.url}
                      alt={post.coverImage.alt ?? ""}
                      fill
                      className="object-cover"
                      sizes="96px"
                    />
                  </div>
                ) : (
                  <div className="h-14 w-24 shrink-0 rounded-xl bg-brand-dark/5 flex items-center justify-center text-brand-muted/50" aria-hidden>
                    <FileText className="w-6 h-6" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-brand-dark truncate">{post.title || "Untitled"}</p>
                  <p className="text-brand-muted text-sm truncate">/blog/{post.slug}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span
                      className={cn(
                        "text-xs font-medium px-2 py-0.5 rounded",
                        statusColors[post.status] ?? "bg-brand-muted/20 text-brand-muted"
                      )}
                    >
                      {statusLabels[post.status] ?? post.status}
                    </span>
                    {post.source === "static" && (
                      <span className="text-xs px-2 py-0.5 rounded bg-brand-primary/10 text-brand-primary font-medium">
                        The Dock (read-only)
                      </span>
                    )}
                    {post.publishAt && post.status === "scheduled" && (
                      <span className="text-xs text-brand-muted">
                        {new Date(post.publishAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {(post.status === "published" || post.source === "static") && (
                    <a
                      href={`/blog/${post.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg text-brand-muted hover:text-brand-primary hover:bg-brand-primary/10 transition-colors"
                      aria-label="View on site"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  {post.source === "static" ? (
                    <span className="text-xs text-brand-muted px-3 py-1.5 rounded-lg bg-brand-dark/5" title="This post lives in The Dock (content file). To edit, update content/blog.ts in code.">
                      Edit in code
                    </span>
                  ) : (
                    <>
                      {post.status !== "archived" && (
                        <button
                          type="button"
                          onClick={() => handleArchive(post.id)}
                          className="p-2 rounded-lg text-brand-muted hover:text-amber-600 hover:bg-amber-50 transition-colors"
                          title="Archive post"
                          aria-label="Archive post"
                        >
                          <Archive className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(post.id, post.title)}
                        className="p-2 rounded-lg text-brand-muted hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete post"
                        aria-label="Delete post"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <Link
                        href={`/admin/blog/${post.id}`}
                        className={cn(buttonVariants({ variant: "default", size: "sm" }), "gap-2 min-h-[40px] sm:min-h-[44px]")}
                        aria-label={`Edit post: ${(post.title || "Untitled").slice(0, 50)}`}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                        Edit
                      </Link>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
