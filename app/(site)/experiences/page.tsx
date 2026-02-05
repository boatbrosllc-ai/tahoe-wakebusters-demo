import type { Metadata } from "next";
import { brand } from "@/content/brand";
import { experiences } from "@/content/experiences";
import { ExperienceCard } from "@/components/site/ExperienceCard";
import { TrustLine } from "@/components/site/TrustLine";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Experiences | Lake Travis & Lake Austin Boat Rentals",
  description: `Pontoon party, wake & surf, sunset cruise, family day, corporate & bachelor/bachelorette on Lake Travis and Lake Austin. ${brand.companyName}, Austin TX.`,
};

export default function ExperiencesPage() {
  return (
    <div className="section-padding bg-white">
      <div className="container-wide px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-brand-dark mb-2">
          Our experiences
        </h1>
        <p className="text-lg text-brand-muted max-w-2xl mb-10">
          From chill pontoon days to wakeboarding and sunset cruises. Pick one and check availability.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {experiences.map((exp, i) => (
            <ExperienceCard key={exp.slug} experience={exp} index={i} />
          ))}
        </div>
        <div className="mt-12 text-center space-y-4">
          <TrustLine variant="default" className="justify-center" />
          <Button asChild size="lg" className="rounded-xl min-h-[48px]">
            <Link href="/book">Check Availability</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
