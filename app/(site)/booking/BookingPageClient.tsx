"use client";

import { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import { useBookingModal } from "@/components/site/BookingModalContext";
import { formatExperiencePriceLabel } from "@/content/experiences";
import { cn } from "@/lib/utils";

interface ExperienceItem {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  heroMedia: { type: "image" | "video"; url: string };
  maxGuests: number;
  petsMax: number;
  fromPriceCents: number | null;
  active: boolean;
}

interface BoatOption {
  id: string;
  name: string;
  photos: string[];
  fromPriceCents: number | null;
  rates: { id: string; durationHours: number; displayName: string; priceCents: number }[];
}

function getNextDays(days: number): { dateStr: string; label: string; weekday: string }[] {
  const out: { dateStr: string; label: string; weekday: string }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    out.push({
      dateStr,
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
    });
  }
  return out;
}

export function BookingPageClient() {
  const { openWithSelection } = useBookingModal();
  const [experiences, setExperiences] = useState<ExperienceItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedExperience, setSelectedExperience] = useState<ExperienceItem | null>(null);
  const [boats, setBoats] = useState<BoatOption[]>([]);
  const [boatsLoading, setBoatsLoading] = useState(false);
  const [selectedBoat, setSelectedBoat] = useState<BoatOption | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/experiences")
      .then((res) => res.json())
      .then((data) => {
        if (data.experiences?.length) setExperiences(data.experiences);
        else setError(data.error ?? null);
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedExperience) {
      setBoats([]);
      setSelectedBoat(null);
      return;
    }
    setBoatsLoading(true);
    setSelectedBoat(null);
    setSelectedDate(null);
    fetch(`/api/booking/boats?experienceId=${encodeURIComponent(selectedExperience.id)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.boats && Array.isArray(data.boats)) setBoats(data.boats);
        else setBoats([]);
      })
      .catch(() => setBoats([]))
      .finally(() => setBoatsLoading(false));
  }, [selectedExperience]);

  const dateOptions = useMemo(() => getNextDays(35), []);
  const useExperiencePicker = experiences != null && experiences.length > 0;

  const canContinue =
    selectedExperience && (selectedBoat || boats.length === 0) && selectedDate;

  const handleContinueToCheckout = () => {
    if (!canContinue || !selectedExperience) return;
    openWithSelection({
      experienceId: selectedExperience.id,
      experienceSlug: selectedExperience.slug,
      boatId: selectedBoat?.id,
      date: selectedDate ?? undefined,
    });
  };

  return (
    <div className="section-padding">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
        <header className="text-center mb-8 sm:mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-brand-dark tracking-tight mb-2">
            Book your experience
          </h1>
          <p className="text-sm text-brand-muted">
            Pick a category, boat, and date — then choose your time and checkout.
          </p>
        </header>

        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-4">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" aria-hidden />
            <p className="text-brand-muted text-sm">Loading…</p>
          </div>
        ) : useExperiencePicker ? (
          <div className="space-y-8 sm:space-y-10">
            {/* 1. Categories – 2x2 squares */}
            <section>
              <h2 className="text-sm font-semibold text-brand-dark uppercase tracking-wider mb-3">
                Category
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {experiences!.map((exp) => {
                  const isSelected = selectedExperience?.id === exp.id;
                  const hasImage = exp.heroMedia?.url && exp.heroMedia.type === "image";
                  return (
                    <button
                      key={exp.id}
                      type="button"
                      onClick={() => setSelectedExperience(exp)}
                      className={cn(
                        "relative flex flex-col overflow-hidden rounded-xl border-2 aspect-square transition-all",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2",
                        isSelected
                          ? "border-brand-primary ring-2 ring-brand-primary/30"
                          : "border-brand-dark/15 hover:border-brand-dark/30"
                      )}
                    >
                      <div className="absolute inset-0 bg-brand-dark/5">
                        {hasImage ? (
                          <Image
                            src={exp.heroMedia.url}
                            alt=""
                            fill
                            className="object-cover"
                            sizes="(max-width: 640px) 50vw, 240px"
                          />
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/15 to-brand-dark/10" />
                        )}
                      </div>
                      <div className="relative flex flex-1 flex-col justify-end p-3 sm:p-4 bg-gradient-to-t from-black/70 via-black/20 to-transparent">
                        <span className="text-sm font-semibold text-white drop-shadow-sm">{exp.title}</span>
                        {exp.fromPriceCents != null && (
                          <span className="text-xs text-white/90 mt-0.5">
                            {formatExperiencePriceLabel(exp.slug, exp.fromPriceCents)}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 2. Select your boat – only when category selected */}
            {selectedExperience && (
              <section>
                <h2 className="text-sm font-semibold text-brand-dark uppercase tracking-wider mb-3">
                  Select your boat
                </h2>
                {boatsLoading ? (
                  <p className="text-brand-muted text-sm py-2">Loading boats…</p>
                ) : boats.length === 0 ? (
                  <p className="text-brand-muted text-sm py-2">
                    No boats assigned — you can still pick a date and use experience pricing.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-4">
                    {boats.map((boat) => {
                      const isSelected = selectedBoat?.id === boat.id;
                      const thumb = boat.photos?.[0];
                      return (
                        <button
                          key={boat.id}
                          type="button"
                          onClick={() => setSelectedBoat(boat)}
                          className={cn(
                            "inline-flex items-center gap-4 rounded-xl border-2 px-4 py-4 sm:px-5 sm:py-5 text-left transition-all min-w-0",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2",
                            isSelected
                              ? "border-brand-primary bg-brand-primary/10 text-brand-dark font-semibold"
                              : "border-brand-dark/15 bg-white text-brand-dark hover:border-brand-dark/30"
                          )}
                        >
                          {thumb ? (
                            <span className="relative h-14 w-20 sm:h-16 sm:w-24 shrink-0 block overflow-hidden rounded-lg bg-brand-dark/5">
                              <Image src={thumb} alt="" width={96} height={64} className="object-cover h-full w-full" />
                            </span>
                          ) : (
                            <span className="h-14 w-20 sm:h-16 sm:w-24 shrink-0 rounded-lg bg-brand-dark/10" aria-hidden />
                          )}
                          <span className="text-base sm:text-lg font-medium truncate">{boat.name}</span>
                          {boat.fromPriceCents != null && (
                            <span className="text-sm text-brand-muted shrink-0 font-medium">${(boat.fromPriceCents / 100).toFixed(0)}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* 3. Select your date – only when boat selected (or no boats) */}
            {selectedExperience && (boats.length === 0 || selectedBoat) && (
              <section>
                <h2 className="text-sm font-semibold text-brand-dark uppercase tracking-wider mb-3">
                  Select your date
                </h2>
                <div className="grid grid-cols-5 sm:grid-cols-7 gap-2">
                  {dateOptions.map(({ dateStr, label, weekday }) => {
                    const isSelected = selectedDate === dateStr;
                    const isPast = dateStr < new Date().toISOString().slice(0, 10);
                    return (
                      <button
                        key={dateStr}
                        type="button"
                        disabled={isPast}
                        onClick={() => setSelectedDate(dateStr)}
                        className={cn(
                          "rounded-xl border-2 py-2.5 px-2 text-center transition-all",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2",
                          isPast && "opacity-50 cursor-not-allowed",
                          isSelected
                            ? "border-brand-primary bg-brand-primary/10 text-brand-dark font-semibold"
                            : !isPast && "border-brand-dark/15 bg-white hover:border-brand-dark/30"
                        )}
                      >
                        <span className="block text-[10px] sm:text-xs text-brand-muted uppercase">{weekday}</span>
                        <span className="block text-sm font-medium mt-0.5">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Continue CTA */}
            {canContinue && (
              <div className="pt-4">
                <button
                  type="button"
                  onClick={handleContinueToCheckout}
                  className="block w-full rounded-xl bg-brand-primary text-white font-semibold text-center py-4 px-6 hover:bg-brand-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 transition-colors"
                >
                  Continue to choose time & checkout
                </button>
                <p className="text-center text-xs text-brand-muted mt-3">
                  Instant confirmation · 10-minute hold at checkout
                </p>
              </div>
            )}

            {error && (
              <p className="text-center text-sm text-red-600">{error}</p>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-brand-dark/10 bg-white p-8 sm:p-10 text-center shadow-soft">
            <p className="text-brand-dark font-semibold">No experiences available yet</p>
            <p className="mt-2 text-sm text-brand-muted">
              Check back soon — experiences will appear here once they are published.
            </p>
          </div>
        )}

        {error && !useExperiencePicker && (
          <p className="text-center text-sm text-brand-muted mt-6">{error}</p>
        )}
      </div>
    </div>
  );
}
