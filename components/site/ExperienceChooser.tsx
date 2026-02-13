"use client";

import { experiences } from "@/content/experiences";
import { ExperienceCard } from "./ExperienceCard";

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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 lg:gap-5">
          {experiences.map((exp, i) => (
            <ExperienceCard key={exp.slug} experience={exp} index={i} variant="compact" />
          ))}
        </div>
      </div>
    </section>
  );
}
