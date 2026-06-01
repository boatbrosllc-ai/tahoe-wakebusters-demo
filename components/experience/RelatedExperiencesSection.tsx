"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface RelatedExperienceLink {
  href: string;
  title: string;
}

export function RelatedExperiencesSection({ experiences }: { experiences: RelatedExperienceLink[] }) {
  if (!experiences.length) return null;
  return (
    <section className="px-5 sm:px-6 lg:px-8 py-10 sm:py-12 bg-brand-dark border-t border-white/10" aria-labelledby="related-experiences-heading">
      <div className="max-w-7xl mx-auto">
        <h2 id="related-experiences-heading" className="text-xl sm:text-2xl font-bold text-white text-center mb-6">
          Explore our experiences
        </h2>
        <ul className="flex flex-wrap justify-center gap-3 sm:gap-4">
          {experiences.map((exp) => (
            <li key={exp.href}>
              <Link
                href={exp.href}
                className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:border-brand-primary hover:bg-brand-primary/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
              >
                {exp.title}
                <ChevronRight className="h-4 w-4 opacity-70" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
