"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PhotoUploader } from "@/components/admin/PhotoUploader";
import { ExternalLink } from "lucide-react";
import { normalizePublicSlug } from "@/lib/booking/slug";
import { inferSlugFromTitle, isWatersportsSlug } from "@/lib/booking/experience-aliases";

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
  color: string;
  /** One HH:MM per line; empty = hourly grid (no restriction). */
  allowedStartTimesText: string;
  photos: string[];
  active: boolean;
  experienceIds: string[];
  updatedAt?: number | null;
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
    color: "",
    allowedStartTimesText: "",
    photos: [],
    active: true,
    experienceIds: [],
    updatedAt: null,
  };
}

function slugFromName(name: string): string {
  return normalizePublicSlug(name);
}

function formatAllowedStartTimesText(
  times: unknown
): string {
  if (!Array.isArray(times) || times.length === 0) return "";
  const lines: string[] = [];
  for (const t of times) {
    if (!t || typeof t !== "object") continue;
    const hour = (t as { hour?: unknown }).hour;
    const minute = (t as { minute?: unknown }).minute;
    if (typeof hour !== "number" || typeof minute !== "number") continue;
    lines.push(`${hour}:${String(minute).padStart(2, "0")}`);
  }
  return lines.join("\n");
}

/** Parse textarea lines like "9:00", "9:30", "15:00" into {hour,minute}[]. */
function parseAllowedStartTimesText(text: string): { hour: number; minute: number }[] {
  const out: { hour: number; minute: number }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) {
      throw new Error(`Invalid start time "${trimmed}". Use HH:MM with minutes 00 or 30.`);
    }
    const hour = parseInt(m[1], 10);
    const minute = parseInt(m[2], 10);
    if (hour < 0 || hour > 23 || (minute !== 0 && minute !== 30)) {
      throw new Error(`Invalid start time "${trimmed}". Hour 0–23, minute 00 or 30.`);
    }
    out.push({ hour, minute });
  }
  return out;
}

function dataFromApi(api: Record<string, unknown>): BoatFormData {
  const photos = Array.isArray(api.photos) ? api.photos.filter((x): x is string => typeof x === "string") : [];
  const experienceIds = Array.isArray(api.experienceIds) ? api.experienceIds.filter((x): x is string => typeof x === "string") : [];
  const cap = api.capacity;
  const colorRaw = api.color;
  const color = typeof colorRaw === "string" && /^#([0-9A-Fa-f]{3}){1,2}$/.test(colorRaw.trim()) ? colorRaw.trim() : "";
  return {
    name: typeof api.name === "string" ? api.name : "",
    slug: typeof api.slug === "string" ? api.slug : "",
    description: typeof api.description === "string" ? api.description : "",
    boatType: typeof api.boatType === "string" ? api.boatType : "",
    heroSubtitle: typeof api.heroSubtitle === "string" ? api.heroSubtitle : "",
    capacity: typeof cap === "number" && cap > 0 ? String(cap) : "",
    color,
    allowedStartTimesText: formatAllowedStartTimesText(api.allowedStartTimes),
    photos,
    active: api.active !== false,
    experienceIds,
    updatedAt: typeof api.updatedAt === "number" ? api.updatedAt : null,
  };
}

function formDataToBody(d: BoatFormData): Record<string, unknown> {
  const capacityNum = d.capacity.trim() ? parseInt(d.capacity, 10) : null;
  const color = d.color.trim() && /^#([0-9A-Fa-f]{3}){1,2}$/.test(d.color.trim()) ? d.color.trim() : undefined;
  const boatTypeTrimmed = d.boatType.trim();
  const allowedStartTimes = parseAllowedStartTimesText(d.allowedStartTimesText);
  return {
    name: d.name,
    slug: normalizePublicSlug(d.slug) || undefined,
    description: d.description.trim(),
    // null clears boatType on PATCH (must not omit the key)
    boatType: boatTypeTrimmed || null,
    heroSubtitle: d.heroSubtitle.trim(),
    capacity: capacityNum != null && capacityNum > 0 ? capacityNum : null,
    color: color ?? null,
    // null/empty clears allowedStartTimes on PATCH
    allowedStartTimes: allowedStartTimes.length > 0 ? allowedStartTimes : null,
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
  createRequestKey?: string;
}

export function BoatForm({
  initialData,
  boatId,
  backHref,
  submitLabel,
  onSubmit,
  createRequestKey,
}: BoatFormProps) {
  const [data, setData] = useState<BoatFormData>(() => initialData);
  const [experiences, setExperiences] = useState<ExperienceOption[]>([]);
  const [experiencesError, setExperiencesError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photosUploading, setPhotosUploading] = useState(false);
  const initialSlug = normalizePublicSlug(initialData.slug ?? "");

  useEffect(() => {
    fetch("/api/admin/experiences", { credentials: "include" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg =
            (typeof data === "object" && data && typeof (data as { error?: unknown }).error === "string"
              ? (data as { error: string }).error
              : null) ??
            (res.status === 401 ? "Unauthorized" : "Failed to load listings");
          throw new Error(msg);
        }
        return data;
      })
      .then((list: ExperienceOption[]) => {
        setExperiencesError(null);
        setExperiences(Array.isArray(list) ? list : []);
      })
      .catch((err) => {
        setExperiences([]);
        setExperiencesError(err instanceof Error ? err.message : "Failed to load listings");
      });
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
    if (photosUploading) {
      setError("Please wait for all photo uploads to finish before saving.");
      setLoading(false);
      return;
    }
    try {
      const nextSlug = normalizePublicSlug(data.slug);
      if (!nextSlug) {
        throw new Error("Slug is required and must contain letters or numbers.");
      }
      if (boatId && initialSlug && nextSlug && nextSlug !== initialSlug) {
        const confirmed = window.confirm(
          "Changing this boat slug will change the public /boats/[slug] URL and may break old links. Continue?"
        );
        if (!confirmed) {
          setLoading(false);
          return;
        }
      }
      const selectedExperiences = experiences.filter((exp) => data.experienceIds.includes(exp.id));
      const hasWatersportsExperience = selectedExperiences.some((exp) => {
        const candidateSlug = (exp.slug || inferSlugFromTitle(exp.title) || "").toLowerCase();
        return isWatersportsSlug(candidateSlug);
      });
      if (hasWatersportsExperience && data.boatType.trim().toLowerCase() !== "wake") {
        throw new Error("Watersports-family experiences require boat type: Wake boat.");
      }
      const body = formDataToBody({ ...data, slug: nextSlug });
      if (boatId) {
        body.lastKnownUpdatedAt = data.updatedAt ?? null;
      } else if (createRequestKey) {
        body.createRequestKey = createRequestKey;
      }
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
        <Button type="submit" disabled={loading || photosUploading} className="min-h-[44px] sm:min-h-0">
          {loading ? "Saving…" : photosUploading ? "Waiting for uploads…" : submitLabel}
        </Button>
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
            <input id="boat-slug" className={`${inputClass} flex-1 min-w-[200px]`} value={data.slug} onChange={(e) => update("slug", normalizePublicSlug(e.target.value))} placeholder="jc-neptoon-tritoon" required />
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
          <input id="boat-hero" className={inputClass} value={data.heroSubtitle} onChange={(e) => update("heroSubtitle", e.target.value)} placeholder="e.g. Private charter · Captain included · Up to 12 guests" />
          <p className="mt-1 text-xs text-brand-muted">Line shown under the boat name on the public boat page. Leave blank to use the default based on boat type.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-brand-dark" htmlFor="boat-capacity">Max guests (optional)</label>
          <input id="boat-capacity" type="number" min={1} max={99} className={inputClass} value={data.capacity} onChange={(e) => update("capacity", e.target.value)} placeholder="6" />
          <p className="mt-1 text-xs text-brand-muted">Used in generated description (e.g. “up to 6 guests”). Defaults to 6 if empty.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-brand-dark" htmlFor="boat-allowed-starts">Restricted start times (optional)</label>
          <textarea
            id="boat-allowed-starts"
            className={textareaClass}
            rows={4}
            value={data.allowedStartTimesText}
            onChange={(e) => update("allowedStartTimesText", e.target.value)}
            placeholder={"9:00\n9:30\n15:00"}
          />
          <p className="mt-1 text-xs text-brand-muted">One per line as HH:MM (e.g. 9:00, 9:30, 15:00). Leave empty for hourly grid. Clear to remove restrictions.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-brand-dark" htmlFor="boat-color">Calendar color (optional)</label>
          <div className="flex items-center gap-2 mt-1">
            <input
              id="boat-color"
              type="color"
              value={data.color || "#14b8a6"}
              onChange={(e) => update("color", e.target.value)}
              className="h-10 w-14 rounded-lg border border-brand-dark/20 cursor-pointer"
              aria-label="Boat color for calendar"
            />
            <input
              type="text"
              className={`${inputClass} flex-1 max-w-[120px] font-mono text-xs`}
              value={data.color}
              onChange={(e) => update("color", e.target.value.replace(/[^#0-9A-Fa-f]/g, ""))}
              placeholder="#14b8a6"
            />
          </div>
          <p className="mt-1 text-xs text-brand-muted">Used on the admin calendar to identify this boat. Leave empty for default palette.</p>
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
          <textarea id="boat-desc" className={textareaClass} rows={4} value={data.description} onChange={(e) => update("description", e.target.value)} placeholder="e.g. Private charter boat for up to 12 guests with captain included, cooler, and safety gear — ideal for a day on the water." />
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
          onUploadStateChange={setPhotosUploading}
          maxPhotos={20}
          listPrefix="boats/"
          reorderable
        />
      </section>

      <section className="rounded-2xl bg-white shadow-soft border border-brand-dark/10 p-4 sm:p-6 lg:p-8 space-y-4">
        <h2 className="text-lg font-semibold text-brand-dark">Assign to listings</h2>
        <p className="text-sm text-brand-muted">Select which experiences (listings) this boat appears in. Users will choose this boat when booking that experience. Pricing is set on each listing.</p>
        <div className="space-y-2">
          {experiencesError && (
            <p className="text-sm text-red-700">Could not load listings: {experiencesError}</p>
          )}
          {!experiencesError && experiences.length === 0 && (
            <p className="text-sm text-brand-muted">No listings yet. Create experiences first.</p>
          )}
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
        <Button type="submit" disabled={loading || photosUploading} className="min-h-[44px]">
          {loading ? "Saving…" : photosUploading ? "Waiting for uploads…" : submitLabel}
        </Button>
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
