"use client";

import { experiences } from "@/content/experiences";
import { ExperienceCard } from "./ExperienceCard";
import { cn } from "@/lib/utils";

const experienceTypes = [
  "Pontoon parties",
  "Wake & surf",
  "Sunset cruises",
  "Family days",
  "Corporate outings",
  "Bach & bachelorette",
];

export function ExperienceChooser() {
  return (
    <section className="section-padding bg-white" aria-labelledby="experience-chooser-heading">
      <div className="container-wide">
        <h2 id="experience-chooser-heading" className="text-2xl sm:text-3xl lg:text-4xl font-bold text-brand-dark text-center mb-4 sm:mb-4">
          Choose your experience
        </h2>
        <p className="text-base sm:text-lg text-brand-muted text-center max-w-2xl mx-auto mb-8 sm:mb-8">
          Pick one and check availability.
        </p>
        <ul
          className={cn(
            "grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-x-2 gap-y-3 sm:gap-3 mb-20 sm:mb-20 lg:mb-24",
            "list-none p-0 m-0"
          )}
          aria-hidden
        >
          {experienceTypes.map((label) => (
            <li key={label} className="min-w-0">
              <span className="block text-center text-xs sm:text-sm font-medium text-brand-muted bg-brand-bg rounded-lg py-2.5 px-2 sm:py-3 sm:px-3 whitespace-nowrap overflow-hidden text-ellipsis min-w-0 min-h-[2.5rem] sm:min-h-0" title={label}>
                {label}
              </span>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-7 sm:gap-8 pt-2 sm:pt-0">
          {experiences.map((exp, i) => (
            <ExperienceCard key={exp.slug} experience={exp} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
