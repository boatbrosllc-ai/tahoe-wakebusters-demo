"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save, ExternalLink, Send, History, Archive, Trash2, MoreVertical, Calendar, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BlogPostSerialized } from "@/lib/blog/types";
import { computeContentStats } from "@/lib/blog/content-stats";
import { contentBlocksToText } from "@/lib/blog/content-stats";
import { BlockEditor } from "./BlockEditor";
import { BlogSettingsPanel } from "./BlogSettingsPanel";
import { SeoScoreCard } from "./SeoScoreCard";
import { VersionHistoryDrawer } from "./VersionHistoryDrawer";

export interface BlogEditorShellProps {
  postId: string;
  initialPost: BlogPostSerialized;
  onBack: () => void;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function BlogEditorShell({ postId, initialPost, onBack }: BlogEditorShellProps) {
  const [title, setTitle] = useState(initialPost.title ?? "");
  const [slug, setSlug] = useState(initialPost.slug ?? "");
  const [excerpt, setExcerpt] = useState(initialPost.excerpt ?? "");
  const [coverImage, setCoverImage] = useState(initialPost.coverImage ?? null);
  const [content, setContent] = useState(initialPost.content ?? []);
  const [seo, setSeo] = useState(initialPost.seo ?? { metaTitle: "", metaDescription: "", robotsIndex: true, robotsFollow: true });
  const [author, setAuthor] = useState(initialPost.author ?? { name: "" });
  const [taxonomy, setTaxonomy] = useState(initialPost.taxonomy ?? { categories: [], tags: [] });
  const [status, setStatus] = useState(initialPost.status ?? "draft");
  const [publishAt, setPublishAt] = useState<string | null>(initialPost.publishAt ?? null);

  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [versionDrawerOpen, setVersionDrawerOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const lastSavedRef = useRef<BlogPostSerialized>(initialPost);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) setMoreMenuOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [moreMenuOpen]);

  const markDirty = useCallback(() => setDirty(true), []);
  const slugFromTitle = (t: string) =>
    t.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "") || "post";

  useEffect(() => {
    setTitle(initialPost.title ?? "");
    setSlug(initialPost.slug ?? "");
    setExcerpt(initialPost.excerpt ?? "");
    setCoverImage(initialPost.coverImage ?? null);
    setContent(initialPost.content ?? []);
    setSeo(initialPost.seo ?? { metaTitle: "", metaDescription: "", robotsIndex: true, robotsFollow: true });
    setAuthor(initialPost.author ?? { name: "" });
    setTaxonomy(initialPost.taxonomy ?? { categories: [], tags: [] });
    setStatus(initialPost.status ?? "draft");
    setPublishAt(initialPost.publishAt ?? null);
  }, [initialPost]);

  const performSave = useCallback(async () => {
    setSaveStatus("saving");
    setSaveError(null);
    const contentText = contentBlocksToText(content);
    const stats = computeContentStats(content);
    const slugClean = slug.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "") || "post";
    const body = {
      title,
      slug: slugClean,
      excerpt,
      coverImage,
      content,
      contentText,
      seo,
      author,
      taxonomy,
      status,
      publishAt,
      stats,
    };
    try {
      const res = await fetch(`/api/admin/blog/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Save failed");
      }
      lastSavedRef.current = data as BlogPostSerialized;
      setSaveStatus("saved");
      setDirty(false);
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
      setSaveStatus("error");
    }
  }, [postId, title, slug, excerpt, coverImage, content, seo, author, taxonomy, status, publishAt]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (dirty) performSave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dirty, performSave]);

  useEffect(() => {
    if (!dirty) return;
    const t = setInterval(performSave, 15000);
    return () => clearInterval(t);
  }, [dirty, performSave]);

  const handlePublish = useCallback(
    async (action: "publish_now" | "schedule" | "unpublish" | "archive") => {
      setPublishError([]);
      if (action === "schedule" && !publishAt) {
        setPublishError(["Set a date and time under Publish → Scheduled publish, then click Schedule."]);
        return;
      }
      setPublishing(true);
      try {
        await performSave();
        const body = action === "schedule" && publishAt ? { action, publishAt } : { action };
        const res = await fetch(`/api/admin/blog/${postId}/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const errList = Array.isArray(data.errors) ? data.errors : data.error ? [data.error] : ["Publish failed"];
          setPublishError(errList);
          return;
        }
        lastSavedRef.current = { ...lastSavedRef.current, ...data };
        setStatus(data.status ?? status);
        setPublishAt(data.publishAt ?? null);
      } finally {
        setPublishing(false);
      }
    },
    [postId, performSave, publishAt, status]
  );

  const handleArchive = useCallback(async () => {
    await handlePublish("archive");
  }, [handlePublish]);

  const handleDelete = useCallback(async () => {
    if (!confirm("Permanently delete this post? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/blog/${postId}`, { method: "DELETE", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      onBack();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Delete failed");
      setSaveStatus("error");
    } finally {
      setDeleting(false);
    }
  }, [postId, onBack]);

  const handleRestore = useCallback(() => {
    fetch(`/api/admin/blog/${postId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        lastSavedRef.current = data;
        setTitle(data.title ?? "");
        setSlug(data.slug ?? "");
        setExcerpt(data.excerpt ?? "");
        setCoverImage(data.coverImage ?? null);
        setContent(data.content ?? []);
        setSeo(data.seo ?? seo);
        setAuthor(data.author ?? author);
        setTaxonomy(data.taxonomy ?? taxonomy);
        setStatus(data.status ?? "draft");
        setPublishAt(data.publishAt ?? null);
        setDirty(false);
      })
      .catch(console.error);
  }, [postId, seo, author, taxonomy]);

  const previewUrl = `/admin/blog/${postId}/preview`;

  const seoPost = {
    seo,
    stats: computeContentStats(content),
    slug,
    status,
    content,
    contentText: contentBlocksToText(content),
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/80">
      {publishError.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-amber-900 mb-1">Fix these before publishing</p>
            <ul className="list-disc list-inside text-sm text-amber-800 space-y-0.5">
              {publishError.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          </div>
          <button type="button" onClick={() => setPublishError([])} className="text-xs font-medium text-amber-700 hover:text-amber-900 underline shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {/* Top bar: minimal, primary CTA clear */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-2.5 bg-white/98 backdrop-blur-sm border-b border-slate-200/80">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0 text-slate-600 hover:text-slate-900 -ml-1" asChild>
            <Link href="/admin/blog">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <span className="text-slate-400 font-mono text-xs truncate max-w-[180px] sm:max-w-[240px]" title={slug || "URL slug"}>
            /blog/{slug || "…"}
          </span>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
              saveStatus === "saving" && "bg-slate-100 text-slate-600",
              saveStatus === "saved" && "bg-emerald-100 text-emerald-700",
              saveStatus === "error" && "bg-red-100 text-red-700",
              saveStatus === "idle" && dirty && "bg-amber-100 text-amber-700"
            )}
            aria-live="polite"
          >
            {saveStatus === "saving" && "Saving…"}
            {saveStatus === "saved" && "Saved"}
            {saveStatus === "error" && (saveError ?? "Error")}
            {saveStatus === "idle" && dirty && "Unsaved"}
            {saveStatus === "idle" && !dirty && "Saved"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={performSave} disabled={saveStatus === "saving"} className="gap-1.5" type="button" title="Save (Ctrl+S)">
            <Save className="h-3.5 w-3.5" /> Save
          </Button>
          {(status === "draft" || status === "in_review") && (
            <Button size="sm" onClick={() => handlePublish("publish_now")} disabled={publishing} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" type="button">
              <Send className="h-3.5 w-3.5" /> Publish
            </Button>
          )}
          <div className="relative" ref={moreMenuRef}>
            <Button
              size="sm"
              variant="outline"
              className={cn("gap-1 w-9 px-0", moreMenuOpen && "bg-slate-50")}
              type="button"
              aria-label="More actions"
              aria-expanded={moreMenuOpen}
              onClick={() => setMoreMenuOpen((o) => !o)}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
            {moreMenuOpen && (
              <div className="absolute right-0 top-full mt-1 py-1 min-w-[200px] rounded-lg border border-slate-200 bg-white shadow-lg z-50">
                <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => setMoreMenuOpen(false)}>
                  <Eye className="h-3.5 w-3.5" /> Preview
                </a>
                <button type="button" onClick={() => { setVersionDrawerOpen(true); setMoreMenuOpen(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left">
                  <History className="h-3.5 w-3.5" /> History
                </button>
                {(status === "draft" || status === "in_review") && (
                  <button type="button" onClick={() => { handlePublish("schedule"); setMoreMenuOpen(false); }} disabled={publishing} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left">
                    <Calendar className="h-3.5 w-3.5" /> Schedule
                  </button>
                )}
                {(status === "published" || status === "scheduled") && (
                  <button type="button" onClick={() => { handlePublish("unpublish"); setMoreMenuOpen(false); }} disabled={publishing} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left">
                    {status === "scheduled" ? "Cancel schedule" : "Unpublish"}
                  </button>
                )}
                {status !== "archived" && (
                  <button type="button" onClick={() => { handleArchive(); setMoreMenuOpen(false); }} disabled={publishing} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left">
                    <Archive className="h-3.5 w-3.5" /> Archive
                  </button>
                )}
                <div className="border-t border-slate-100 my-1" />
                <button type="button" onClick={() => { handleDelete(); setMoreMenuOpen(false); }} disabled={deleting} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 text-left">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row gap-0 overflow-hidden">
        {/* Main: document */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
            {/* Title – clear hierarchy */}
            <div className="mb-4">
              <input
                type="text"
                className="w-full text-3xl sm:text-4xl font-bold text-slate-900 placeholder:text-slate-400 border-0 bg-transparent focus:outline-none focus:ring-0"
                value={title}
                onChange={(e) => { setTitle(e.target.value); markDirty(); }}
                placeholder="Post title"
                aria-label="Post title"
              />
              <div className="flex items-center gap-2 mt-1.5 text-sm">
                <span className="text-slate-400 font-mono">/blog/</span>
                <input
                  type="text"
                  className="flex-1 min-w-0 max-w-[220px] rounded border border-slate-200 bg-slate-50/80 px-2 py-1 text-slate-600 font-mono text-xs focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/20 focus:bg-white"
                  value={slug}
                  onChange={(e) => { setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-")); markDirty(); }}
                  placeholder="url-slug"
                  aria-label="URL slug"
                />
                <button
                  type="button"
                  onClick={() => { const s = slugFromTitle(title); if (s) { setSlug(s); markDirty(); } }}
                  className="text-xs text-brand-primary hover:underline"
                >
                  Use title
                </button>
              </div>
            </div>

            {/* Excerpt – single line hint */}
            <div className="mb-6">
              <input
                type="text"
                className="w-full text-slate-600 placeholder:text-slate-400 border-0 border-b border-slate-200/80 bg-transparent px-0 py-2 text-base focus:outline-none focus:ring-0 focus:border-brand-primary"
                value={excerpt}
                onChange={(e) => { setExcerpt(e.target.value); markDirty(); }}
                placeholder="Short summary for cards and search (optional)"
                aria-label="Post excerpt"
              />
            </div>

            {/* Cover image – one card */}
            <section className="mb-8 rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
              {coverImage?.url ? (
                <>
                  <div className="relative aspect-video bg-slate-100">
                    <Image src={coverImage.url} alt={coverImage.alt ?? ""} fill className="object-cover" sizes="672px" />
                  </div>
                  <div className="p-3 flex flex-wrap gap-2 items-center border-t border-slate-100">
                    <input
                      type="url"
                      className="flex-1 min-w-[200px] rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/20 focus:bg-white"
                      value={coverImage.url}
                      onChange={(e) => {
                        const url = e.target.value;
                        setCoverImage(url ? { url, path: url, alt: coverImage?.alt } : null);
                        markDirty();
                      }}
                      placeholder="Image URL"
                    />
                    <input
                      type="text"
                      className="flex-1 min-w-[160px] rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/20 focus:bg-white"
                      value={coverImage.alt ?? ""}
                      onChange={(e) => { setCoverImage(coverImage ? { ...coverImage, alt: e.target.value } : null); markDirty(); }}
                      placeholder="Alt text (for accessibility)"
                      aria-label="Cover image alt text"
                    />
                  </div>
                </>
              ) : (
                <label className="block p-8 text-center cursor-pointer hover:bg-slate-50/50 transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const form = new FormData();
                      form.set("file", file);
                      form.set("prefix", "blog/");
                      const res = await fetch("/api/admin/upload", { method: "POST", body: form, credentials: "include" });
                      const data = await res.json().catch(() => ({}));
                      if (res.ok && data.url) {
                        setCoverImage({ url: data.url, path: data.path ?? data.url, alt: file.name });
                        markDirty();
                      }
                      e.target.value = "";
                    }}
                  />
                  <p className="text-slate-500 text-sm font-medium">Cover image</p>
                  <p className="text-slate-400 text-xs mt-0.5">Click to upload or paste URL below</p>
                </label>
              )}
              {!coverImage?.url && (
                <div className="px-4 pb-4">
                  <input
                    type="url"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-600 placeholder:text-slate-400 focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/20 focus:bg-white"
                    placeholder="Paste image URL"
                    onChange={(e) => {
                      const url = e.target.value.trim();
                      setCoverImage(url ? { url, path: url, alt: "" } : null);
                      markDirty();
                    }}
                  />
                </div>
              )}
            </section>

            {/* Content blocks – no heavy label */}
            <section aria-label="Content">
              <BlockEditor
                blocks={content}
                onChange={(blocks) => { setContent(blocks); markDirty(); }}
              />
            </section>
          </div>
        </main>

        {/* Sidebar – SEO first, then Publish & settings */}
        <aside className="w-full lg:w-[320px] xl:w-[360px] shrink-0 border-t lg:border-t-0 lg:border-l border-slate-200/80 bg-slate-50/50 lg:bg-white overflow-y-auto">
          <div className="p-4 lg:p-5 space-y-5 lg:sticky lg:top-20">
          <SeoScoreCard post={seoPost} />
          <BlogSettingsPanel
            seo={seo}
            author={author}
            taxonomy={taxonomy}
            status={status}
            publishAt={publishAt}
            title={title}
            excerpt={excerpt}
            onSeoChange={(s) => {
              setSeo(s);
              markDirty();
            }}
            onAuthorChange={(a) => {
              setAuthor(a);
              markDirty();
            }}
            onTaxonomyChange={(t) => {
              setTaxonomy(t);
              markDirty();
            }}
            onStatusChange={(s) => {
              setStatus(s);
              markDirty();
            }}
            onPublishAtChange={(p) => {
              setPublishAt(p);
              markDirty();
            }}
          />
          </div>
        </aside>
      </div>

      <VersionHistoryDrawer
        postId={postId}
        open={versionDrawerOpen}
        onClose={() => setVersionDrawerOpen(false)}
        onRestore={handleRestore}
      />
    </div>
  );
}
