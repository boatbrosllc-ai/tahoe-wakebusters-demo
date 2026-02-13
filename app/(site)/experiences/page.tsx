import type { Metadata } from "next";
import { brand } from "@/content/brand";
import { ExperiencesListClient } from "@/components/site/ExperiencesListClient";

export const metadata: Metadata = {
  title: "Lake Austin Boat Rentals | Pontoon, Watersports, Sunset & More",
  description: `Lake Austin boat rentals – pontoon, watersports, sunset cruise, holiday tour. ${brand.companyName}, Austin TX.`,
};

export default function ExperiencesPage() {
  return <ExperiencesListClient />;
}
