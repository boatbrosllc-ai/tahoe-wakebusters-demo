"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { ListingBoat, BoatRate } from "@/lib/booking/types";

const inputClass =
  "mt-1 block w-full min-h-[44px] rounded-lg border border-brand-dark/20 px-3 py-2.5 text-sm text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary sm:min-h-0 sm:py-2";
const textareaClass =
  "mt-1 block w-full rounded-lg border border-brand-dark/20 px-3 py-2.5 text-sm text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary";

type RateRow = { durationHours: number; displayName: string; priceCents: number };

export type BoatFormData = {
  name: string;
  slug: string;
  description: string;
  photos: string[];
  active: boolean;
  experienceIds: string[];
  rates: RateRow[];
};

type ExperienceOption = { id: string; slug: string; title: string; active: boolean };

function getDefaultFormData(): BoatFormData {
  return {
    name: "",
    slug: "",
    description: "",
    photos: [],
    active: true,
    experienceIds: [],
    rates: [],
  };
}

function dataFromApi(api: Record<string, unknown>): BoatFormData {
  const photos = Array.isArray(api.photos) ? api.photos.filter((x): x is string => typeof x === "string") : [];
  const experienceIds = Array.isArray(api.experienceIds) ? api.experienceIds.filter((x): x is string => typeof x === "string") : [];
  const rates = Array.isArray(api.rates)
    ? (api.rates as { id?: string; durationHours?: number; displayName?: string; priceCents?: number }[]).map((r) => ({
        durationHours: typeof r.durationHours === "number" ? r.durationHours : 0,
        displayName: typeof r.displayName === "string" ? r.displayName : "",
        priceCents: typeof r.priceCents === "number" ? r.priceCents : 0,
      }))
    : [];
  return {
    name: typeof api.name === "string" ? api.name : "",
    slug: typeof api.slug === "string" ? api.slug : "",
    description: typeof api.description === "string" ? api.description : "",
    photos,
    active: api.active !== false,
    experienceIds,
    rates,
  };
}

function formDataToBody(d: BoatFormData): Record<string, unknown> {
  return {
    name: d.name,
    slug: d.slug || undefined,
    description: d.description || undefined,
    photos: d.photos,
    active: d.active,
    experienceIds: d.experienceIds,
    rates: d.rates,
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

  const addPhoto = () => setData((prev) => ({ ...prev, photos: [...prev.photos, ""] }));
  const removePhoto = (i: number) => setData((prev) => ({ ...prev, photos: prev.photos.filter((_, idx) => idx !== i) }));
  const setPhoto = (i: number, value: string) => {
    setData((prev) => ({
      ...prev,
      photos: prev.photos.map((v, idx) => (idx === i ? value : v)),
    }));
  };

  const toggleExperience = (expId: string) => {
    setData((prev) =>
      prev.experienceIds.includes(expId)
        ? { ...prev, experienceIds: prev.experienceIds.filter((id) => id !== expId) }
        : { ...prev, experienceIds: [...prev.experienceIds, expId] }
    );
  };

  const addRate = () => setData((prev) => ({ ...prev, rates: [...prev.rates, { durationHours: 3, displayName: "", priceCents: 0 }] }));
  const removeRate = (i: number) => setData((prev) => ({ ...prev, rates: prev.rates.filter((_, idx) => idx !== i) }));
  const setRate = (i: number, field: keyof RateRow, value: number | string) => {
    setData((prev) => ({
      ...prev,
      rates: prev.rates.map((r, idx) =>
        idx === i ? { ...r, [field]: value } : r
      ),
    }));
  };
  const setRateNum = (i: number, field: "durationHours" | "priceCents", value: number) => {
    setData((prev) => ({
      ...prev,
      rates: prev.rates.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)),
    }));
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
        <p className="text-sm text-brand-muted">Photo URLs (one per line or add multiple). First photo is used as the main image in the boat picker.</p>
        {data.photos.map((url, i) => (
          <div key={i} className="flex gap-2">
            <input className={inputClass} value={url} onChange={(e) => setPhoto(i, e.target.value)} placeholder="/photos/boat1.webp or https://..." aria-label={`Photo URL ${i + 1}`} />
            <Button type="button" variant="ghost" size="icon" onClick={() => removePhoto(i)} aria-label={`Remove photo ${i + 1}`}>−</Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addPhoto}>Add photo URL</Button>
      </section>

      <section className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 lg:p-8 space-y-4">
        <h2 className="text-lg font-semibold text-brand-dark">Assign to listings</h2>
        <p className="text-sm text-brand-muted">Select which experiences (listings) this boat appears in. Users will choose this boat when booking that experience.</p>
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

      <section className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 lg:p-8 space-y-4">
        <h2 className="text-lg font-semibold text-brand-dark">Pricing (rates)</h2>
        <p className="text-sm text-brand-muted">Rates for this boat. When a user selects this boat for an experience, this pricing is used.</p>
        {data.rates.map((r, i) => (
          <div key={i} className="flex flex-wrap gap-2 items-center">
            <input type="number" min={0} step={0.5} className={`${inputClass} w-24`} placeholder="Hours" value={r.durationHours || ""} onChange={(e) => setRateNum(i, "durationHours", parseFloat(e.target.value) || 0)} />
            <input className={`${inputClass} flex-1 min-w-[120px]`} placeholder="Display name" value={r.displayName} onChange={(e) => setRate(i, "displayName", e.target.value)} />
            <input type="number" min={0} className={`${inputClass} w-28`} placeholder="Price cents" value={r.priceCents || ""} onChange={(e) => setRateNum(i, "priceCents", parseInt(e.target.value, 10) || 0)} />
            <Button type="button" variant="ghost" size="icon" onClick={() => removeRate(i)}>−</Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addRate}>Add rate</Button>
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
