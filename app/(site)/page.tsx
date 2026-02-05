import { Hero } from "@/components/site/Hero";
import { ExperienceChooser } from "@/components/site/ExperienceChooser";
import { HowItWorks } from "@/components/site/HowItWorks";
import { Testimonials } from "@/components/site/Testimonials";
import { GalleryPreview } from "@/components/site/GalleryPreview";
import { LeadCapture } from "@/components/site/LeadCapture";

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
