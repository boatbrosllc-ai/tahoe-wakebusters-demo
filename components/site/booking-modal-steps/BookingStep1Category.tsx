"use client";

import Image from "next/image";
import { cn, getDisplayImageUrl } from "@/lib/utils";
import { bundlePresets, type BundleId, type BundlePreset } from "@/content/bundle-presets";
import { siteConfig } from "@/config/site";
import type { ExperienceItem } from "./types";

/** Same heroes as BundleChooser — keep Book Now visually aligned with /experiences. */
const PACKAGE_HEROES: Record<BundleId, string> = {
  "half-day": siteConfig.media.welcome,
  "full-day": siteConfig.media.boats,
  "all-in": siteConfig.media.hero,
};

function packageHero(bundle: BundlePreset): string {
  return PACKAGE_HEROES[bundle.id] ?? siteConfig.media.galleryFallback;
}

function packageHoursLabel(bundle: BundlePreset): string {
  const hours =
    bundle.charterOptions[bundle.defaultOptionIndex]?.durationHours ??
    bundle.charterOptions[0]?.durationHours;
  return hours != null ? `${hours} hours` : bundle.tagline;
}

/** Key bullets for the modal — skip the redundant “N-hour private charter” line (hours shown above). */
function packageHighlights(bundle: BundlePreset): string[] {
  return bundle.includes
    .filter((line) => !/^\d+-hour\b/i.test(line))
    .slice(0, 4);
}

export interface BookingStep1CategoryProps {
  loading: boolean;
  experiences: ExperienceItem[] | null;
  experiencesLoadError: string | null;
  /** Bundle id when a package is selected (step 1 highlight). */
  selectedBundleId: BundleId | null;
  onSelectPackage: (bundle: BundlePreset) => void;
  panel1Collapsed: boolean;
}

export function BookingStep1Category({
  loading,
  experiences,
  experiencesLoadError,
  selectedBundleId,
  onSelectPackage,
  panel1Collapsed,
}: BookingStep1CategoryProps) {
  const ready = !loading && !!experiences && experiences.length > 0;

  return (
    <div
      className={cn(
        "relative w-full h-full min-w-0 shrink-0 pr-1 flex flex-col min-h-0 transition-[min-height] duration-300",
        loading ? "overflow-hidden" : "overflow-y-auto",
        panel1Collapsed && "!min-h-0 !h-0 overflow-hidden"
      )}
    >
      {loading && !experiences ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-2 py-8">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" aria-hidden />
          <p className="text-sm text-brand-muted text-center">Loading packages…</p>
        </div>
      ) : experiencesLoadError && !ready ? (
        <p className="text-sm text-amber-700 py-8 px-4">
          {experiencesLoadError}. Please try again or contact us.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 md:gap-4 flex-1 min-h-0 min-w-0 content-start">
          {bundlePresets.map((bundle) => {
            const isSelected = selectedBundleId === bundle.id;
            const hero = packageHero(bundle);
            const hours = packageHoursLabel(bundle);
            const highlights = packageHighlights(bundle);
            return (
              <button
                key={bundle.id}
                type="button"
                disabled={!ready}
                onClick={() => onSelectPackage(bundle)}
                className={cn(
                  "relative flex flex-col overflow-hidden rounded-xl sm:rounded-2xl border-2 min-h-[160px] sm:min-h-[280px] md:min-h-[320px] transition-all text-left",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2",
                  "disabled:opacity-60 disabled:cursor-wait",
                  isSelected
                    ? "border-brand-primary ring-1 sm:ring-2 ring-brand-primary/30"
                    : "border-brand-dark/15 hover:border-brand-dark/30 sm:hover:scale-[1.02] active:scale-[0.99]"
                )}
              >
                <div className="absolute inset-0 bg-brand-dark/5">
                  <Image
                    src={getDisplayImageUrl(hero)}
                    alt=""
                    fill
                    className="object-cover object-center"
                    sizes="(max-width: 640px) 100vw, 33vw"
                  />
                </div>
                <div className="relative flex flex-1 flex-col justify-end p-3 sm:p-4 md:p-5 bg-gradient-to-t from-black/90 via-black/55 to-transparent">
                  <span className="text-lg sm:text-xl md:text-2xl font-bold text-white drop-shadow-md leading-tight">
                    {bundle.title}
                  </span>
                  <span className="mt-0.5 text-[11px] sm:text-xs md:text-sm font-semibold uppercase tracking-wide text-brand-secondary">
                    {bundle.tagline} · {hours}
                  </span>
                  <ul className="mt-2 hidden space-y-0.5 sm:block">
                    {highlights.map((line) => (
                      <li
                        key={line}
                        className="text-[10px] md:text-[11px] leading-snug text-white/85 line-clamp-1"
                      >
                        · {line}
                      </li>
                    ))}
                  </ul>
                  <ul className="mt-1.5 space-y-0.5 sm:hidden">
                    {highlights.slice(0, 2).map((line) => (
                      <li key={line} className="text-[10px] leading-snug text-white/85 line-clamp-1">
                        · {line}
                      </li>
                    ))}
                  </ul>
                  <span className="mt-2 text-xs sm:text-sm font-semibold text-white">
                    {bundle.fromPriceLabel}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {!loading && ready && (
        <p className="text-center text-[11px] sm:text-xs text-brand-muted mt-2 sm:mt-4">
          Select a package to continue
        </p>
      )}
    </div>
  );
}
