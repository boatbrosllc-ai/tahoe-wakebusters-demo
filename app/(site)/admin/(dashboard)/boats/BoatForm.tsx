"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PhotoUploader } from "@/components/admin/PhotoUploader";

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
    photos: [],
    active: true,
    experienceIds: [],
  };
}

function dataFromApi(api: Record<string, unknown>): BoatFormData {
  const photos = Array.isArray(api.photos) ? api.photos.filter((x): x is string => typeof x === "string") : [];
  const experienceIds = Array.isArray(api.experienceIds) ? api.experienceIds.filter((x): x is string => typeof x === "string") : [];
  return {
    name: typeof api.name === "string" ? api.name : "",
    slug: typeof api.slug === "string" ? api.slug : "",
    description: typeof api.description === "string" ? api.description : "",
    boatType: typeof api.boatType === "string" ? api.boatType : "",
    photos,
    active: api.active !== false,
    experienceIds,
  };
}

function formDataToBody(d: BoatFormData): Record<string, unknown> {
  return {
    name: d.name,
    slug: d.slug || undefined,
    description: d.description || undefined,
    boatType: d.boatType || undefined,
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

      <section className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 lg:p-8 space-y-4">
        <h2 className="text-lg font-semibold text-brand-dark">Basics</h2>
        <div>
          <label className="block text-sm font-medium text-brand-dark" htmlFor="boat-name">Name *</label>
          <input id="boat-name" className={inputClass} value={data.name} onChange={(e) => update("name", e.target.value)} required placeholder="e.g. Party Pontoon A" />
        </div>
        <div>
          <label className="block text-sm font-medium text-brand-dark" htmlFor="boat-slug">Slug (optional)</label>
          <input id="boat-slug" className={inputClass} value={data.slug} onChange={(e) => update("slug", e.target.value)} placeholder="party-pontoon-a" />
        </div>
        <div>
          <label className="block text-sm font-medium text-brand-dark" htmlFor="boat-type">Boat type (optional)</label>
          <select id="boat-type" className={inputClass} value={data.boatType} onChange={(e) => update("boatType", e.target.value)} aria-label="Boat type">
            <option value="">—</option>
            {BOAT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-brand-dark" htmlFor="boat-desc">Description</label>
          <textarea id="boat-desc" className={textareaClass} rows={3} value={data.description} onChange={(e) => update("description", e.target.value)} placeholder="Short description for the boat" />
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="boat-active" checked={data.active} onChange={(e) => update("active", e.target.checked)} />
          <label htmlFor="boat-active" className="text-sm font-medium text-brand-dark">Active (show in booking)</label>
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
          <Button type="button" variant="ghost">Cancel</Button>
        </Link>
        <Button type="submit" disabled={loading}>{loading ? "Saving…" : submitLabel}</Button>
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
