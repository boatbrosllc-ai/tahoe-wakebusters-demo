import type { Metadata } from "next";
import { notFound } from "next/navigation";
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const firestoreData = await getFirestoreExperience(slug);
    if (firestoreData) {
      const exp = firestoreData.experience;
      const title = exp.metaTitle?.trim() || `${exp.title} | Lake Austin Boat Charter`;
      const description = exp.metaDescription?.trim() || exp.subtitle;
      return {
        title,
        description,
        openGraph: { title: exp.metaTitle?.trim() || `${exp.title} | ${brand.companyName}`, description },
      };
    }
    const staticExp = getStaticExperience(slug);
    if (staticExp) {
      return {
        title: `${staticExp.title} | Lake Austin Boat Charter`,
        description: staticExp.shortDescription,
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
