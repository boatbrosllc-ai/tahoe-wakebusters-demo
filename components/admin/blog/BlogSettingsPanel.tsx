"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { BlogSeo, BlogAuthor, BlogTaxonomy, BlogPostStatus } from "@/lib/blog/types";
import { ChevronDown, ChevronUp, FileText, User, Tag, Search } from "lucide-react";

export interface BlogSettingsPanelProps {
  seo: BlogSeo;
  author: BlogAuthor;
  taxonomy: BlogTaxonomy;
  status: BlogPostStatus;
  publishAt: string | null;
  title?: string;
  excerpt?: string;
  onSeoChange: (seo: BlogSeo) => void;
  onAuthorChange: (author: BlogAuthor) => void;
  onTaxonomyChange: (taxonomy: BlogTaxonomy) => void;
  onStatusChange: (status: BlogPostStatus) => void;
  onPublishAtChange: (publishAt: string | null) => void;
  className?: string;
}

const sectionHeaderClass = "text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2";

function CharBar({ value, low, high, max }: { value: number; low: number; high: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const inRange = value >= low && value <= high;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-colors",
            inRange ? "bg-emerald-500" : value > high ? "bg-amber-500" : "bg-slate-400"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn("text-xs tabular-nums w-8 text-right", inRange ? "text-emerald-600 font-medium" : "text-slate-500")}>
        {value}/{high}
      </span>
    </div>
  );
}

export function BlogSettingsPanel({
  seo,
  author,
  taxonomy,
  status,
  publishAt,
  onSeoChange,
  onAuthorChange,
  onTaxonomyChange,
  onStatusChange,
  onPublishAtChange,
  title = "",
  excerpt = "",
  className,
}: BlogSettingsPanelProps) {
  const [seoOpen, setSeoOpen] = useState(true);
  const [authorOpen, setAuthorOpen] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);
  const metaLen = (seo.metaTitle ?? "").length;
  const descLen = (seo.metaDescription ?? "").length;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Publish – first, always visible */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Publish">
        <h3 className={sectionHeaderClass}>
          <FileText className="h-3.5 w-3.5" /> Publish
        </h3>
        <div className="mt-3 space-y-3">
          <div>
            <label className="sr-only">Status</label>
            <select
              aria-label="Post status"
              className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm text-slate-800 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:bg-white"
              value={status}
              onChange={(e) => onStatusChange(e.target.value as BlogPostStatus)}
            >
              <option value="draft">Draft</option>
              <option value="in_review">In review</option>
              <option value="scheduled">Scheduled</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Schedule (optional)</label>
            <input
              type="datetime-local"
              aria-label="Scheduled publish"
              className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm text-slate-800 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:bg-white"
              value={publishAt ? publishAt.slice(0, 16) : ""}
              onChange={(e) => onPublishAtChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
            />
          </div>
        </div>
      </section>

      {/* SEO – collapsible */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => setSeoOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-2 p-4 text-left hover:bg-slate-50/50"
        >
          <h3 className={sectionHeaderClass}>
            <Search className="h-3.5 w-3.5" /> SEO
          </h3>
          {seoOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>
        {seoOpen && (
          <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Meta title</label>
              <input
                type="text"
                className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:bg-white"
                value={seo.metaTitle}
                onChange={(e) => onSeoChange({ ...seo, metaTitle: e.target.value })}
                placeholder="50–60 chars"
                maxLength={120}
              />
              <CharBar value={metaLen} low={50} high={60} max={120} />
              <button type="button" className="mt-1 text-xs text-brand-primary hover:underline" onClick={() => onSeoChange({ ...seo, metaTitle: title.slice(0, 120) })}>
                Fill from title
              </button>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Meta description</label>
              <textarea
                className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 min-h-[64px] resize-y focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:bg-white"
                value={seo.metaDescription}
                onChange={(e) => onSeoChange({ ...seo, metaDescription: e.target.value })}
                placeholder="140–160 chars"
                maxLength={320}
              />
              <CharBar value={descLen} low={140} high={160} max={320} />
              <button type="button" className="mt-1 text-xs text-brand-primary hover:underline" onClick={() => onSeoChange({ ...seo, metaDescription: excerpt.slice(0, 320) })}>
                Fill from excerpt
              </button>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Focus keyword (optional)</label>
              <input
                type="text"
                className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:bg-white"
                value={seo.focusKeyword ?? ""}
                onChange={(e) => onSeoChange({ ...seo, focusKeyword: e.target.value || undefined })}
                placeholder="e.g. lake austin boat rental"
              />
            </div>
            <div className="flex flex-wrap gap-4 pt-1">
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input type="checkbox" checked={seo.robotsIndex} onChange={(e) => onSeoChange({ ...seo, robotsIndex: e.target.checked })} className="rounded border-slate-300 text-brand-primary focus:ring-brand-primary/20" />
                Index
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input type="checkbox" checked={seo.robotsFollow} onChange={(e) => onSeoChange({ ...seo, robotsFollow: e.target.checked })} className="rounded border-slate-300 text-brand-primary focus:ring-brand-primary/20" />
                Follow
              </label>
            </div>
          </div>
        )}
      </section>

      {/* Author – collapsible */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <button type="button" onClick={() => setAuthorOpen((o) => !o)} className="w-full flex items-center justify-between gap-2 p-4 text-left hover:bg-slate-50/50">
          <h3 className={sectionHeaderClass}>
            <User className="h-3.5 w-3.5" /> Author
          </h3>
          {authorOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>
        {authorOpen && (
          <div className="px-4 pb-4 border-t border-slate-100 pt-3">
            <input
              type="text"
              className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:bg-white"
              value={author.name}
              onChange={(e) => onAuthorChange({ ...author, name: e.target.value })}
              placeholder="Author name"
            />
          </div>
        )}
      </section>

      {/* Taxonomy – collapsible */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <button type="button" onClick={() => setTaxOpen((o) => !o)} className="w-full flex items-center justify-between gap-2 p-4 text-left hover:bg-slate-50/50">
          <h3 className={sectionHeaderClass}>
            <Tag className="h-3.5 w-3.5" /> Categories & tags
          </h3>
          {taxOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>
        {taxOpen && (
          <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Categories</label>
              <input
                type="text"
                className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:bg-white"
                value={(taxonomy.categories ?? []).join(", ")}
                onChange={(e) => onTaxonomyChange({ ...taxonomy, categories: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                placeholder="Boating, Tips"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Tags</label>
              <input
                type="text"
                className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:bg-white"
                value={(taxonomy.tags ?? []).join(", ")}
                onChange={(e) => onTaxonomyChange({ ...taxonomy, tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                placeholder="lake austin, summer"
              />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
