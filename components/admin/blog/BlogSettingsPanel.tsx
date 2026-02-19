"use client";

import { cn } from "@/lib/utils";
import type { BlogSeo, BlogAuthor, BlogTaxonomy, BlogPostStatus } from "@/lib/blog/types";

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
  return (
    <div className={cn("space-y-6", className)}>
      <section>
        <h3 className="text-sm font-semibold text-brand-dark mb-2">SEO</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="block text-xs text-brand-muted">Meta title</label>
            <button type="button" className="text-xs text-brand-primary hover:underline" onClick={() => onSeoChange({ ...seo, metaTitle: title.slice(0, 120) })}>Fill from title</button>
          </div>
          <input
            type="text"
            className="w-full rounded-lg border border-brand-dark/20 bg-white px-3 py-2 text-sm"
            value={seo.metaTitle}
            onChange={(e) => onSeoChange({ ...seo, metaTitle: e.target.value })}
            placeholder="50–60 chars"
            maxLength={120}
          />
          <div className="flex items-center justify-between gap-2">
            <label className="block text-xs text-brand-muted">Meta description</label>
            <button type="button" className="text-xs text-brand-primary hover:underline" onClick={() => onSeoChange({ ...seo, metaDescription: excerpt.slice(0, 320) })}>Fill from excerpt</button>
          </div>
          <textarea
            className="w-full rounded-lg border border-brand-dark/20 bg-white px-3 py-2 text-sm min-h-[80px] resize-y"
            value={seo.metaDescription}
            onChange={(e) => onSeoChange({ ...seo, metaDescription: e.target.value })}
            placeholder="140–160 chars"
            maxLength={320}
          />
          <label className="block text-xs text-brand-muted">Focus keyword</label>
          <input
            type="text"
            className="w-full rounded-lg border border-brand-dark/20 bg-white px-3 py-2 text-sm"
            value={seo.focusKeyword ?? ""}
            onChange={(e) => onSeoChange({ ...seo, focusKeyword: e.target.value || undefined })}
            placeholder="Optional"
          />
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={seo.robotsIndex}
              onChange={(e) => onSeoChange({ ...seo, robotsIndex: e.target.checked })}
            />
            Index (robots)
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={seo.robotsFollow}
              onChange={(e) => onSeoChange({ ...seo, robotsFollow: e.target.checked })}
            />
            Follow links
          </label>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-brand-dark mb-2">Author</h3>
        <input
          type="text"
          className="w-full rounded-lg border border-brand-dark/20 bg-white px-3 py-2 text-sm"
          value={author.name}
          onChange={(e) => onAuthorChange({ ...author, name: e.target.value })}
          placeholder="Author name"
        />
      </section>

      <section>
        <h3 className="text-sm font-semibold text-brand-dark mb-2">Taxonomy</h3>
        <div className="space-y-2">
          <label className="block text-xs text-brand-muted">Categories (comma-separated)</label>
          <input
            type="text"
            className="w-full rounded-lg border border-brand-dark/20 bg-white px-3 py-2 text-sm"
            value={(taxonomy.categories ?? []).join(", ")}
            onChange={(e) =>
              onTaxonomyChange({
                ...taxonomy,
                categories: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
              })
            }
            placeholder="e.g. Boating, Tips"
          />
          <label className="block text-xs text-brand-muted">Tags (comma-separated)</label>
          <input
            type="text"
            className="w-full rounded-lg border border-brand-dark/20 bg-white px-3 py-2 text-sm"
            value={(taxonomy.tags ?? []).join(", ")}
            onChange={(e) =>
              onTaxonomyChange({
                ...taxonomy,
                tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
              })
            }
            placeholder="e.g. lake austin, summer"
          />
        </div>
      </section>

      <section aria-label="Publish settings">
        <h3 className="text-sm font-semibold text-brand-dark mb-2">Publish</h3>
        <div className="space-y-2">
          <label className="block text-xs text-brand-muted">Status</label>
          <select
            aria-label="Post status"
            className="w-full rounded-lg border border-brand-dark/20 bg-white px-3 py-2 text-sm"
            value={status}
            onChange={(e) => onStatusChange(e.target.value as BlogPostStatus)}
          >
            <option value="draft">Draft</option>
            <option value="in_review">In review</option>
            <option value="scheduled">Scheduled</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
          <label className="block text-xs text-brand-muted">Scheduled publish (optional)</label>
          <input
            type="datetime-local"
            aria-label="Scheduled publish date and time"
            className="w-full rounded-lg border border-brand-dark/20 bg-white px-3 py-2 text-sm"
            value={publishAt ? publishAt.slice(0, 16) : ""}
            onChange={(e) => onPublishAtChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
          />
        </div>
      </section>
    </div>
  );
}
