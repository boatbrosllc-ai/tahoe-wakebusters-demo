"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ExperienceCalendarPage } from "./ExperienceCalendarPage";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";

type RateDto = { id: string; durationHours: number; priceCents: number; displayName: string };
type AddonDto = { id: string; name: string; priceCents: number; type: "toggle" | "quantity" | "tip"; maxQty?: number };

type BoatOption = {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  photos: string[];
  fromPriceCents: number | null;
  rates: { id: string; durationHours: number; displayName: string; priceCents: number }[];
};

interface ExperienceBookFlowProps {
  experienceId: string;
  experienceName: string;
  slug: string;
  rates: RateDto[];
  addons: AddonDto[];
  maxGuests: number;
  petsMax: number;
  backHref: string;
  /** When coming from /booking with boat & date pre-selected, skip boat picker */
  initialBoatId?: string;
  initialDate?: string;
}

export function ExperienceBookFlow({
  experienceId,
  experienceName,
  slug,
  rates,
  addons,
  maxGuests,
  petsMax,
  backHref,
  initialBoatId,
  initialDate,
}: ExperienceBookFlowProps) {
  const [boats, setBoats] = useState<BoatOption[]>([]);
  const [boatsLoading, setBoatsLoading] = useState(true);
  const [selectedBoat, setSelectedBoat] = useState<BoatOption | null>(null);

  useEffect(() => {
    fetch(`/api/booking/boats?experienceId=${encodeURIComponent(experienceId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.boats && Array.isArray(data.boats)) {
          setBoats(data.boats);
          if (initialBoatId) {
            const pre = data.boats.find((b: BoatOption) => b.id === initialBoatId);
            if (pre) setSelectedBoat(pre);
          }
        }
      })
      .catch(() => setBoats([]))
      .finally(() => setBoatsLoading(false));
  }, [experienceId, initialBoatId]);

  if (boatsLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <p className="text-brand-muted">Loading…</p>
      </div>
    );
  }

  const showBoatPicker = boats.length > 0 && !selectedBoat;
  if (showBoatPicker) {
    return (
      <div className="min-h-screen flex flex-col bg-brand-bg/30">
        <header className="sticky top-0 z-10 shrink-0 border-b border-brand-dark/10 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-full items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <Link href={backHref} className="text-brand-primary font-medium text-sm hover:underline">
              ← Back
            </Link>
            <h1 className="text-lg font-bold text-brand-dark truncate">Choose your boat</h1>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-3xl">
            <p className="text-brand-muted text-sm mb-6">
              {experienceName} is available with the boats below. Select one to see availability and pricing.
            </p>
            <div className="grid gap-4 sm:gap-6 sm:grid-cols-2">
              {boats.map((boat) => {
                const thumb = boat.photos?.[0];
                return (
                  <button
                    key={boat.id}
                    type="button"
                    onClick={() => setSelectedBoat(boat)}
                    className="group text-left rounded-2xl border border-brand-dark/10 bg-white shadow-soft overflow-hidden transition-all duration-200 hover:shadow-lg hover:border-brand-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                  >
                    <div className="relative aspect-[3/2] bg-brand-dark/5">
                      {thumb ? (
                        <Image src={thumb} alt="" fill className="object-cover" sizes="(max-width: 640px) 100vw, 50vw" />
                      ) : (
                        <div className="absolute inset-0 bg-brand-dark/10" />
                      )}
                      {boat.fromPriceCents != null && (
                        <span className="absolute top-3 right-3 rounded-lg bg-white/95 px-2.5 py-1.5 text-sm font-semibold text-brand-dark shadow-sm">
                          From ${(boat.fromPriceCents / 100).toFixed(0)}
                        </span>
                      )}
                    </div>
                    <div className="p-4 sm:p-5">
                      <h2 className="text-lg font-bold text-brand-dark">{boat.name}</h2>
                      {boat.description && (
                        <p className="mt-1 text-sm text-brand-muted line-clamp-2">{boat.description}</p>
                      )}
                      <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-primary group-hover:gap-2 transition-all">
                        Select & continue
                        <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </main>
      </div>
    );
  }

  const effectiveRates = selectedBoat ? selectedBoat.rates : rates;
  const rateDtos: RateDto[] = effectiveRates.map((r) => ({
    id: r.id ?? "",
    durationHours: r.durationHours,
    priceCents: r.priceCents,
    displayName: r.displayName,
  }));

  return (
    <ExperienceCalendarPage
      experienceId={experienceId}
      experienceName={experienceName}
      slug={slug}
      rates={rateDtos}
      addons={addons}
      maxGuests={maxGuests}
      petsMax={petsMax}
      backHref={backHref}
      boatId={selectedBoat?.id}
      boatName={selectedBoat?.name}
    />
  );
}
