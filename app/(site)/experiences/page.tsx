import type { Metadata } from "next";
import { brand } from "@/content/brand";
import { ExperiencesListClient } from "@/components/site/ExperiencesListClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Lake Austin Boat Rentals | Pontoon, Wake Surf, Sunset Cruise & More",
  description:
    "Boat rentals Lake Austin: pontoon rentals, wake boat & surf, sunset cruise. Book online. Captain included. Boat Bros ATX, Austin TX.",
  keywords: [
    "Lake Austin boat rentals",
    "pontoon rentals Lake Austin",
    "Lake Austin wake boat rental",
    "Lake Austin sunset cruise",
  ],
  openGraph: {
    title: "Lake Austin Boat Rentals | Pontoon, Wake & Sunset | Boat Bros",
    description:
      "Boat rentals Lake Austin — pontoon, wake surf, sunset cruise. Captain included. Book online.",
  },
};

export default function ExperiencesPage() {
  return <ExperiencesListClient />;
}
