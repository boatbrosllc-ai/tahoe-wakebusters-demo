import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getExperienceBySlug as getFirestoreExperience } from "@/lib/booking/get-experience-by-slug";
import { getExperienceBySlug as getStaticExperience } from "@/content/experiences";
import { ExperienceListingPage } from "@/components/experience/ExperienceListingPage";
import { StaticExperienceDetail } from "@/components/experience/StaticExperienceDetail";
import { brand } from "@/content/brand";

type Props = { params: Promise<{ slug: string }> };

const FIRESTORE_SLUGS = ["pontoon", "watersports", "sunset", "holiday"] as const;

export async function generateStaticParams() {
  return FIRESTORE_SLUGS.map((slug) => ({ slug }));
}

const SLUG_KEYWORDS: Record<string, string[]> = {
  pontoon: ["Lake Austin pontoon rentals", "pontoon rental Lake Austin", "Lake Austin pontoon party"],
  watersports: ["Lake Austin wake boat rental", "wake surf Lake Austin", "Lake Austin wakeboard rental"],
  sunset: ["Lake Austin sunset cruise", "sunset boat rental Lake Austin"],
  holiday: ["Lake Austin boat rental", "holiday boat rental Lake Austin"],
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (slug === "pontoon") {
    return {
      title: "Lake Austin Pontoon Rentals | Captain Included",
      description:
        "Pontoon rentals Lake Austin. Captain included, premium sound, lily pad, cooler (ice included). Chill, swim, celebrate. Book your Lake Austin pontoon rental.",
      keywords: ["Lake Austin pontoon rentals", "pontoon rental Lake Austin", "Lake Austin pontoon party"],
      openGraph: {
        title: "Lake Austin Pontoon Rentals | Boat Bros",
        description: "Pontoon rentals Lake Austin. Captain included, premium sound, lily pad. Book your day.",
      },
    };
  }
  try {
    const firestoreData = await getFirestoreExperience(slug);
    if (firestoreData) {
      const exp = firestoreData.experience;
      const title = exp.metaTitle?.trim() || `${exp.title} | Lake Austin Boat Rentals`;
      const description = exp.metaDescription?.trim() || exp.subtitle;
      const keywords = SLUG_KEYWORDS[slug];
      return {
        title,
        description,
        ...(keywords?.length ? { keywords } : {}),
        openGraph: { title: exp.metaTitle?.trim() || `${exp.title} | ${brand.companyName}`, description },
      };
    }
    const staticExp = getStaticExperience(slug);
    if (staticExp) {
      const keywords = SLUG_KEYWORDS[slug];
      return {
        title: `${staticExp.title} | Lake Austin Boat Rentals`,
        description: staticExp.shortDescription,
        ...(keywords?.length ? { keywords } : {}),
        openGraph: { title: `${staticExp.title} | ${brand.companyName}`, description: staticExp.shortDescription },
      };
    }
  } catch {
    // ignore
  }
  return { title: "Experience" };
}

export default async function ExperienceDetailPage({ params }: Props) {
  const { slug } = await params;
  if (slug === "pontoon") {
    redirect("/experiences/lake-austin-pontoon");
  }
  let firestoreData;
  try {
    firestoreData = await getFirestoreExperience(slug);
  } catch {
    firestoreData = null;
  }
  if (firestoreData) {
    return <ExperienceListingPage data={firestoreData} />;
  }
  const staticExperience = getStaticExperience(slug);
  if (staticExperience) {
    return <StaticExperienceDetail experience={staticExperience} />;
  }
  notFound();
}
