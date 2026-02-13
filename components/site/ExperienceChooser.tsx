"use client";

import { experiences } from "@/content/experiences";
import { ExperienceCard } from "./ExperienceCard";
import { cn } from "@/lib/utils";

const experienceTypes = [
  "Pontoon",
  "Watersports",
  "Sunset Cruise",
  "Holiday Tour",
];

export function ExperienceChooser() {
  return (
    <section className="section-padding bg-white" aria-labelledby="experience-chooser-heading">
      <div className="container-wide px-4 sm:px-6 lg:px-8">
        <h2 id="experience-chooser-heading" className="text-3xl sm:text-4xl lg:text-5xl font-bold text-brand-dark text-center mb-4 sm:mb-5">
          Choose your experience
        </h2>
        <p className="text-lg sm:text-xl text-brand-muted text-center max-w-2xl mx-auto mb-10 sm:mb-12 leading-relaxed">
          Pick one and book now.
        </p>
        <ul
          className={cn(
            "grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-14 sm:mb-16 lg:mb-20",
            "list-none p-0 m-0"
          )}
          aria-hidden
        >
          {experienceTypes.map((label) => (
            <li key={label} className="min-w-0">
              <span className="block text-center text-xs sm:text-sm font-medium text-brand-muted bg-brand-bg rounded-xl py-3 px-2 sm:py-3.5 sm:px-3 whitespace-nowrap overflow-hidden text-ellipsis min-w-0 min-h-[2.75rem] sm:min-h-0" title={label}>
                {label}
              </span>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 sm:gap-10 lg:gap-12">
          {experiences.map((exp, i) => (
            <ExperienceCard key={exp.slug} experience={exp} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
