import type { Metadata } from "next";
import { brand } from "@/content/brand";
import { Hero } from "@/components/site/Hero";
import { ExperienceChooser } from "@/components/site/ExperienceChooser";
import { HowItWorks } from "@/components/site/HowItWorks";
import { Testimonials } from "@/components/site/Testimonials";
import { GalleryPreview } from "@/components/site/GalleryPreview";
import { LeadCapture } from "@/components/site/LeadCapture";

export const metadata: Metadata = {
  title: "Lake Austin Boat Rentals | Pontoon, Wake Surf & Sunset Cruises",
  description:
    "Lake Austin boat rentals with captain included. Pontoon rentals, wake boat & surf, sunset cruises. Book online — Boat Bros ATX. Austin TX.",
  keywords: [
    "Lake Austin boat rentals",
    "boat rentals Lake Austin",
    "Lake Austin pontoon rentals",
    "pontoon rentals Lake Austin",
    "Lake Austin wake boat rental",
    "Lake Austin sunset cruise",
    "captained boat rental Lake Austin",
    "Austin boat rental",
  ],
  openGraph: {
    title: "Lake Austin Boat Rentals | Pontoon, Wake & Sunset | Boat Bros",
    description:
      "Lake Austin boat rentals with captain. Pontoon, wake surf, sunset cruises. Book online. Boat Bros ATX.",
  },
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <ExperienceChooser />
      <HowItWorks />
      <Testimonials />
      <GalleryPreview />
      <LeadCapture />
    </>
  );
}
