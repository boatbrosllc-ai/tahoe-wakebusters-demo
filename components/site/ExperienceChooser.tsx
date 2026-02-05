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
  "Bachelor / bachelorette",
];

export function ExperienceChooser() {
  return (
    <section className="section-padding bg-white" aria-labelledby="experience-chooser-heading">
      <div className="container-wide px-4 sm:px-6 lg:px-8">
        <h2 id="experience-chooser-heading" className="text-2xl sm:text-3xl lg:text-4xl font-bold text-brand-dark text-center mb-3 sm:mb-4">
          Choose your experience
        </h2>
        <p className="text-base sm:text-lg text-brand-muted text-center max-w-2xl mx-auto mb-6 sm:mb-8">
          Pick one and check availability.
        </p>
        <ul
          className={cn(
            "grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 mb-10 sm:mb-12",
            "list-none p-0 m-0"
          )}
          aria-hidden
        >
          {experienceTypes.map((label) => (
            <li key={label}>
              <span className="block text-center text-xs sm:text-sm font-medium text-brand-muted bg-brand-bg rounded-lg py-2.5 px-2 sm:py-3 sm:px-3">
                {label}
              </span>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {experiences.map((exp, i) => (
            <ExperienceCard key={exp.slug} experience={exp} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
