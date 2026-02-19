"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save, ExternalLink, Send, History } from "lucide-react";
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
  const lastSavedRef = useRef<BlogPostSerialized>(initialPost);

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
    <div className="min-h-screen flex flex-col bg-brand-bg/30">
      {publishError.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
          <p className="text-sm font-medium text-amber-800 mb-1">Fix these before publishing:</p>
          <ul className="list-disc list-inside text-sm text-amber-800 space-y-0.5">
            {publishError.map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
          <button type="button" onClick={() => setPublishError([])} className="mt-2 text-xs font-medium text-amber-700 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      <header className="sticky top-0 z-30 flex items-center justify-between gap-4 px-4 py-3 bg-white border-b border-brand-dark/10 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 shrink-0" asChild>
            <Link href="/admin/blog">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </Button>
          <span className="text-sm truncate text-brand-muted hidden sm:inline" aria-live="polite">
            {saveStatus === "saving" && "Saving…"}
            {saveStatus === "saved" && (
              <span className="text-emerald-600 font-medium">Saved</span>
            )}
            {saveStatus === "error" && (
              <span className="text-red-600" title={saveError ?? undefined}>{saveError ?? "Save failed"}</span>
            )}
            {saveStatus === "idle" && dirty && (
              <span className="text-amber-600">Unsaved changes (Ctrl+S to save)</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={performSave} disabled={saveStatus === "saving"} className="gap-2" type="button" title="Save (Ctrl+S)">
            <Save className="h-4 w-4" /> Save
          </Button>
          <a href={previewUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" className="gap-2" type="button">
              <ExternalLink className="h-4 w-4" /> Preview
            </Button>
          </a>
          <Button size="sm" variant="outline" onClick={() => setVersionDrawerOpen(true)} className="gap-2" type="button">
            <History className="h-4 w-4" /> History
          </Button>
          {status === "draft" || status === "in_review" ? (
            <>
              <Button size="sm" variant="outline" onClick={() => handlePublish("schedule")} disabled={publishing} className="gap-2" type="button">
                Schedule
              </Button>
              <Button size="sm" onClick={() => handlePublish("publish_now")} disabled={publishing} className="gap-2" type="button">
                <Send className="h-4 w-4" /> Publish now
              </Button>
            </>
          ) : status === "published" ? (
            <Button size="sm" variant="outline" onClick={() => handlePublish("unpublish")} disabled={publishing} type="button">
              Unpublish
            </Button>
          ) : status === "scheduled" ? (
            <Button size="sm" variant="outline" onClick={() => handlePublish("unpublish")} disabled={publishing} type="button">
              Cancel schedule
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row gap-0 overflow-hidden">
        {/* Left: content */}
        <div className="flex-1 min-w-0 overflow-y-auto p-4 lg:p-6">
          <div className="max-w-2xl mx-auto space-y-8">
            <section className="space-y-3" aria-label="Title and URL">
              <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide">Title</label>
              <input
                type="text"
                className="w-full text-2xl font-bold text-brand-dark border-0 border-b border-brand-dark/20 bg-transparent pb-2 focus:outline-none focus:ring-0 focus:border-brand-primary"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  markDirty();
                }}
                placeholder="Enter post title"
                aria-label="Post title"
              />
              <div className="flex gap-2 items-center flex-wrap">
                <span className="text-brand-muted text-sm">/blog/</span>
                <input
                  type="text"
                  className="flex-1 min-w-0 rounded-lg border border-brand-dark/20 bg-white px-3 py-2 text-sm"
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"));
                    markDirty();
                  }}
                  placeholder="url-slug"
                  aria-label="URL slug"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => { const s = slugFromTitle(title); if (s) { setSlug(s); markDirty(); } }}>
                  Use title
                </Button>
              </div>
            </section>

            <section className="space-y-2" aria-label="Excerpt">
              <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide">Excerpt</label>
              <textarea
                className="w-full rounded-lg border border-brand-dark/20 bg-white px-3 py-2 text-sm min-h-[80px] resize-y"
                value={excerpt}
                onChange={(e) => {
                  setExcerpt(e.target.value);
                  markDirty();
                }}
                placeholder="Short summary for cards and search results"
                aria-label="Post excerpt"
              />
            </section>

            <section aria-label="Cover image">
              <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-2">Cover image</label>
              {coverImage?.url ? (
                <div className="relative aspect-video rounded-lg overflow-hidden bg-brand-dark/10 mb-2">
                  <Image src={coverImage.url} alt={coverImage.alt ?? ""} fill className="object-cover" sizes="600px" />
                </div>
              ) : null}
              <div className="flex gap-2 flex-wrap">
                <label className="inline-flex items-center gap-2 rounded-lg border border-brand-dark/20 bg-white px-3 py-2 text-sm cursor-pointer hover:bg-brand-bg/50 shrink-0">
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
                        setCoverImage({ url: data.url, path: data.path ?? data.url, alt: coverImage?.alt ?? file.name });
                        markDirty();
                      }
                      e.target.value = "";
                    }}
                  />
                  Upload image
                </label>
                <input
                  type="url"
                  className="flex-1 min-w-0 rounded-lg border border-brand-dark/20 bg-white px-3 py-2 text-sm"
                  value={coverImage?.url ?? ""}
                  onChange={(e) => {
                    const url = e.target.value;
                    setCoverImage(url ? { url, path: url, alt: coverImage?.alt } : null);
                    markDirty();
                  }}
                  placeholder="Or paste image URL"
                />
              </div>
              <input
                type="text"
                className="w-full rounded-lg border border-brand-dark/20 bg-white px-3 py-2 text-sm mt-1"
                value={coverImage?.alt ?? ""}
                onChange={(e) => {
                  setCoverImage(coverImage ? { ...coverImage, alt: e.target.value } : null);
                  markDirty();
                }}
                placeholder="Alt text (required for publish)"
                aria-label="Cover image alt text"
              />
            </section>

            <section aria-label="Content blocks">
              <h3 className="text-sm font-semibold text-brand-dark mb-2">Content</h3>
              <p className="text-xs text-brand-muted mb-3">Add and reorder blocks. Use the dropdown next to each block to add another below or remove it.</p>
              <BlockEditor
                blocks={content}
                onChange={(blocks) => {
                  setContent(blocks);
                  markDirty();
                }}
              />
            </section>
          </div>
        </div>

        {/* Right: settings + SEO */}
        <aside className="w-full lg:w-80 xl:w-96 shrink-0 border-t lg:border-t-0 lg:border-l border-brand-dark/10 bg-white overflow-y-auto p-4 lg:p-6">
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
          <div className="mt-6">
            <SeoScoreCard post={seoPost} />
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
