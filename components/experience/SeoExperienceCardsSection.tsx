"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Clock } from "lucide-react";
import { getDisplayImageUrl } from "@/lib/utils";
import { formatExperiencePriceLabel } from "@/content/experiences";

export interface SeoExperienceCard {
  href: string;
  title: string;
  description: string;
}

export interface SeoExperienceCardRich extends SeoExperienceCard {
  imageUrl: string;
  imageAlt: string;
  fromPriceCents?: number | null;
  durationLabel?: string;
}

export function SeoExperienceCardsSection({
  cards,
  headline = "Our trips",
}: {
  cards: SeoExperienceCardRich[];
  headline?: string;
}) {
  if (!cards.length) return null;
  return (
    <section className="px-5 sm:px-6 lg:px-8 py-12 sm:py-16 bg-white" aria-labelledby="seo-experience-cards-heading">
      <div className="max-w-7xl mx-auto">
        <h2
          id="seo-experience-cards-heading"
          className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-brand-dark text-center mb-8 sm:mb-10"
        >
          {headline}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {cards.map((card) => {
            const slug = card.href.split("/").filter(Boolean).pop() ?? "";
            const priceLabel = formatExperiencePriceLabel(slug, card.fromPriceCents ?? null);
            const imgSrc = getDisplayImageUrl(card.imageUrl);
            return (
              <Link
                key={card.href}
                href={card.href}
                className="group flex flex-col overflow-hidden rounded-2xl border border-brand-dark/10 bg-white shadow-soft hover:border-brand-primary/40 hover:shadow-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-brand-dark/5">
                  <Image
                    src={imgSrc}
                    alt={card.imageAlt}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  />
                </div>
                <div className="flex flex-col flex-1 p-5">
                  <h3 className="text-lg font-semibold text-brand-dark group-hover:text-brand-primary mb-1 flex items-start justify-between gap-2">
                    <span className="flex-1">{card.title}</span>
                    <ChevronRight className="h-5 w-5 shrink-0 opacity-50 group-hover:translate-x-0.5 transition-transform" aria-hidden />
                  </h3>
                  {priceLabel ? (
                    <p className="text-brand-primary font-semibold text-sm mb-2">{priceLabel}</p>
                  ) : null}
                  {card.durationLabel ? (
                    <p className="flex items-center gap-1 text-xs text-brand-dark/55 mb-2">
                      <Clock className="h-3.5 w-3.5" aria-hidden />
                      {card.durationLabel}
                    </p>
                  ) : null}
                  <p className="text-sm text-brand-dark/70 leading-relaxed flex-1">{card.description}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
