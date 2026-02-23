"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PhotoUploader } from "@/components/admin/PhotoUploader";
import { ExternalLink } from "lucide-react";

const inputClass =
  "mt-1 block w-full min-h-[44px] rounded-lg border border-brand-dark/20 px-3 py-2.5 text-sm text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary sm:min-h-0 sm:py-2";
const textareaClass =
  "mt-1 block w-full rounded-lg border border-brand-dark/20 px-3 py-2.5 text-sm text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary";

const BOAT_TYPES = [{ value: "pontoon", label: "Pontoon" }, { value: "wake", label: "Wake boat" }, { value: "tritoon", label: "Tritoon" }] as const;

export type BoatFormData = {
  name: string;
  slug: string;
  description: string;
  boatType: string;
  heroSubtitle: string;
  capacity: string;
  photos: string[];
  active: boolean;
  experienceIds: string[];
};

type ExperienceOption = { id: string; slug: string; title: string; active: boolean };

function getDefaultFormData(): BoatFormData {
  return {
    name: "",
    slug: "",
    description: "",
    boatType: "",
    heroSubtitle: "",
    capacity: "",
    photos: [],
    active: true,
    experienceIds: [],
  };
}

function slugFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function dataFromApi(api: Record<string, unknown>): BoatFormData {
  const photos = Array.isArray(api.photos) ? api.photos.filter((x): x is string => typeof x === "string") : [];
  const experienceIds = Array.isArray(api.experienceIds) ? api.experienceIds.filter((x): x is string => typeof x === "string") : [];
  const cap = api.capacity;
  return {
    name: typeof api.name === "string" ? api.name : "",
    slug: typeof api.slug === "string" ? api.slug : "",
    description: typeof api.description === "string" ? api.description : "",
    boatType: typeof api.boatType === "string" ? api.boatType : "",
    heroSubtitle: typeof api.heroSubtitle === "string" ? api.heroSubtitle : "",
    capacity: typeof cap === "number" && cap > 0 ? String(cap) : "",
    photos,
    active: api.active !== false,
    experienceIds,
  };
}

function formDataToBody(d: BoatFormData): Record<string, unknown> {
  const capacityNum = d.capacity.trim() ? parseInt(d.capacity, 10) : null;
  return {
    name: d.name,
    slug: d.slug.trim() || undefined,
    description: d.description.trim(),
    boatType: d.boatType || undefined,
    heroSubtitle: d.heroSubtitle.trim(),
    capacity: capacityNum != null && capacityNum > 0 ? capacityNum : null,
    photos: d.photos,
    active: d.active,
    experienceIds: d.experienceIds,
  };
}

interface BoatFormProps {
  initialData: BoatFormData;
  boatId?: string | null;
  backHref: string;
  submitLabel: string;
  onSubmit: (body: Record<string, unknown>) => Promise<{ id?: string }>;
}

export function BoatForm({
  initialData,
  boatId,
  backHref,
  submitLabel,
  onSubmit,
}: BoatFormProps) {
  const [data, setData] = useState<BoatFormData>(() => initialData);
  const [experiences, setExperiences] = useState<ExperienceOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/experiences", { credentials: "include" })
      .then((res) => res.json())
      .then((list: ExperienceOption[]) => setExperiences(Array.isArray(list) ? list : []))
      .catch(() => setExperiences([]));
  }, []);

  const update = <K extends keyof BoatFormData>(key: K, value: BoatFormData[K]) => {
    setData((prev) => ({ ...prev, [key]: value }));
  };

  const toggleExperience = (expId: string) => {
    setData((prev) =>
      prev.experienceIds.includes(expId)
        ? { ...prev, experienceIds: prev.experienceIds.filter((id) => id !== expId) }
        : { ...prev, experienceIds: [...prev.experienceIds, expId] }
    );
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const body = formDataToBody(data);
      const result = await onSubmit(body);
      if (result.id) {
        window.location.href = boatId ? "/admin/boats" : `/admin/boats/${result.id}`;
      } else {
        window.location.href = "/admin/boats";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Link href={backHref}>
          <Button type="button" variant="ghost" size="sm" className="min-h-[44px] sm:min-h-0">Back</Button>
        </Link>
        <Button type="submit" disabled={loading} className="min-h-[44px] sm:min-h-0">{loading ? "Saving…" : submitLabel}</Button>
      </div>
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Public page — how the boat appears on the site */}
      <section className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 lg:p-8 space-y-4">
        <h2 className="text-lg font-semibold text-brand-dark">Public page — how it looks</h2>
        <p className="text-sm text-brand-muted">These fields control the boat’s title, URL, and the line under the title on the boat page. Use “Publish to Our Boats” on the boats list so this boat appears on /boats.</p>
        <div>
          <label className="block text-sm font-medium text-brand-dark" htmlFor="boat-name">Name *</label>
          <input id="boat-name" className={inputClass} value={data.name} onChange={(e) => update("name", e.target.value)} required placeholder="e.g. JC Neptoon Tritoon - 14 Person Capacity" />
          <p className="mt-1 text-xs text-brand-muted">Shown as the main title on the boat page and on cards.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-brand-dark" htmlFor="boat-slug">URL slug *</label>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <input id="boat-slug" className={`${inputClass} flex-1 min-w-[200px]`} value={data.slug} onChange={(e) => update("slug", e.target.value)} placeholder="jc-neptoon-tritoon" />
            <Button type="button" variant="outline" size="sm" onClick={() => update("slug", slugFromName(data.name))} disabled={!data.name.trim()}>
              Generate from name
            </Button>
          </div>
          <p className="mt-1 text-xs text-brand-muted">Public URL: /boats/{data.slug.trim() || "[slug]"}. Required for the boat to appear on the Our Boats page.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-brand-dark" htmlFor="boat-type">Boat type</label>
          <select id="boat-type" className={inputClass} value={data.boatType} onChange={(e) => update("boatType", e.target.value)} aria-label="Boat type">
            <option value="">—</option>
            {BOAT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-brand-muted">Used for default subtitle and SEO when hero subtitle is empty.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-brand-dark" htmlFor="boat-hero">Hero subtitle (optional)</label>
          <input id="boat-hero" className={inputClass} value={data.heroSubtitle} onChange={(e) => update("heroSubtitle", e.target.value)} placeholder="e.g. Lake Austin tritoon rental · Captain included · No license required" />
          <p className="mt-1 text-xs text-brand-muted">Line shown under the boat name on the public boat page. Leave blank to use the default based on boat type.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-brand-dark" htmlFor="boat-capacity">Max guests (optional)</label>
          <input id="boat-capacity" type="number" min={1} max={99} className={inputClass} value={data.capacity} onChange={(e) => update("capacity", e.target.value)} placeholder="14" />
          <p className="mt-1 text-xs text-brand-muted">Used in generated description (e.g. “up to 14 guests”). Defaults to 14 if empty.</p>
        </div>
        {data.slug.trim() && (
          <p className="text-sm">
            <a href={`/boats/${encodeURIComponent(data.slug.trim().toLowerCase())}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-brand-primary hover:underline font-medium">
              <ExternalLink className="h-4 w-4" aria-hidden />
              View public boat page
            </a>
          </p>
        )}
      </section>

      {/* Description and visibility */}
      <section className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 lg:p-8 space-y-4">
        <h2 className="text-lg font-semibold text-brand-dark">Description & visibility</h2>
        <div>
          <label className="block text-sm font-medium text-brand-dark" htmlFor="boat-desc">Description</label>
          <textarea id="boat-desc" className={textareaClass} rows={4} value={data.description} onChange={(e) => update("description", e.target.value)} placeholder="e.g. JC Neptoon Tritoon for up to 14 guests with captain included, Bluetooth audio, cooler, and lily pad — everything you need for a perfect Lake Austin day." />
          <p className="mt-1 text-xs text-brand-muted">Use the boat name in the first line so it appears correctly on cards and the boat page. If the description doesn’t match the boat name, the site will show generated copy instead.</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="boat-active" checked={data.active} onChange={(e) => update("active", e.target.checked)} className="rounded border-brand-dark/30" />
          <label htmlFor="boat-active" className="text-sm font-medium text-brand-dark">Active — show in booking and on Our Boats (when published)</label>
        </div>
      </section>

      <section className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 lg:p-8 space-y-4">
        <h2 className="text-lg font-semibold text-brand-dark">Photos</h2>
        <p className="text-sm text-brand-muted">Upload images or paste URLs. First photo is the main image in the boat picker.</p>
        <PhotoUploader
          value={data.photos}
          onChange={(urls) => setData((prev) => ({ ...prev, photos: urls }))}
          maxPhotos={20}
          listPrefix="boats/"
          reorderable
        />
      </section>

      <section className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 lg:p-8 space-y-4">
        <h2 className="text-lg font-semibold text-brand-dark">Assign to listings</h2>
        <p className="text-sm text-brand-muted">Select which experiences (listings) this boat appears in. Users will choose this boat when booking that experience. Pricing is set on each listing.</p>
        <div className="space-y-2">
          {experiences.length === 0 && <p className="text-sm text-brand-muted">No listings yet. Create experiences first.</p>}
          {experiences.map((exp) => (
            <label key={exp.id} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={data.experienceIds.includes(exp.id)}
                onChange={() => toggleExperience(exp.id)}
                className="rounded border-brand-dark/30"
              />
              <span className="text-sm font-medium text-brand-dark">{exp.title}</span>
              <span className="text-brand-muted text-xs">/{exp.slug}</span>
              {!exp.active && <span className="text-xs text-amber-600">Inactive</span>}
            </label>
          ))}
        </div>
      </section>

      <div className="flex gap-3">
        <Link href={backHref}>
          <Button type="button" variant="ghost" className="min-h-[44px]">Cancel</Button>
        </Link>
        <Button type="submit" disabled={loading} className="min-h-[44px]">{loading ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  );
}

export function boatFormDataFromApi(api: Record<string, unknown>): BoatFormData {
  return dataFromApi(api);
}

export function getDefaultBoatFormData(): BoatFormData {
  return getDefaultFormData();
}
