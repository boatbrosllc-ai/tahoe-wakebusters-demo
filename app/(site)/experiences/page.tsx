import type { Metadata } from "next";
import { brand } from "@/content/brand";
import { ExperiencesListClient } from "@/components/site/ExperiencesListClient";

export const metadata: Metadata = {
  title: "Experiences | Lake Travis & Lake Austin Boat Rentals",
  description: `Pontoon party, wake & surf, sunset cruise, family day, corporate & bachelor/bachelorette on Lake Travis and Lake Austin. ${brand.companyName}, Austin TX.`,
};

export default function ExperiencesPage() {
  return <ExperiencesListClient />;
}
