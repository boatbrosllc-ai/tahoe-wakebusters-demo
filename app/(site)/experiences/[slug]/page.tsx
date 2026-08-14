import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getExperienceBySlug as getFirestoreExperience } from "@/lib/booking/get-experience-by-slug";
import { getExperienceBySlug as getStaticExperience } from "@/content/experiences";
import { ExperienceListingPage } from "@/components/experience/ExperienceListingPage";
import { StaticExperienceDetail } from "@/components/experience/StaticExperienceDetail";
import { brand } from "@/content/brand";
import { getDb } from "@/lib/booking/firebase-admin";
import { getSiteBaseUrl } from "@/config/site";
import {
  getSlugLookupCandidates,
  isExperienceAliasSlug,
  resolveCanonicalExperienceSlug,
} from "@/lib/booking/experience-aliases";

const baseUrl = getSiteBaseUrl();

type Props = { params: Promise<{ slug: string }> };

const FIRESTORE_SLUGS = ["pontoon", "watersports", "nasty-half-day", "nasty-full-day", "sunset", "holiday"] as const;

async function getAdminManagedExperience(slug: string): Promise<{ active: boolean } | null> {
  const db = getDb();
  const candidates = getSlugLookupCandidates(slug.trim().toLowerCase());
  for (const candidate of candidates) {
    const snap = await db.collection("experiences").where("slug", "==", candidate).limit(1).get();
    if (!snap.empty) {
      const data = snap.docs[0].data() as { active?: boolean };
      return { active: data.active === true };
    }
  }
  return null;
}

function experienceCanonicalUrl(canonicalSlug: string): string {
  return `${baseUrl}/experiences/${canonicalSlug}`;
}

async function resolveExperienceRoute(slug: string) {
  const normalized = slug.trim().toLowerCase();
  let firestoreData = null;
  try {
    firestoreData = await getFirestoreExperience(normalized);
  } catch {
    firestoreData = null;
  }
  const firestoreSlug = firestoreData?.experience.slug?.trim().toLowerCase();
  const canonicalSlug = resolveCanonicalExperienceSlug(normalized, firestoreSlug);
  return { normalized, canonicalSlug, firestoreData, firestoreSlug };
}

export async function generateStaticParams() {
  const slugs = new Set<string>(FIRESTORE_SLUGS);
  try {
    const db = getDb();
    const snap = await db.collection("experiences").where("active", "==", true).get();
    for (const doc of snap.docs) {
      const data = doc.data() as { slug?: string };
      const raw = typeof data.slug === "string" ? data.slug.trim().toLowerCase() : "";
      if (raw) {
        slugs.add(raw);
        slugs.add(resolveCanonicalExperienceSlug(raw, raw));
      }
    }
  } catch {
    // build without Firebase — use static slug list only
  }
  return Array.from(slugs, (slug) => ({ slug }));
}

const SLUG_KEYWORDS: Record<string, string[]> = {
  pontoon: ["half day boat rental", "Half Day", "private boat charter"],
  "nasty-half-day": ["Half Day", "half day boat rental", "5 hour charter"],
  "lake-austin-pontoon": ["boat rental", "private boat charter"],
  watersports: ["full day boat rental", "Full Day", "private boat charter"],
  "nasty-full-day": ["Full Day", "full day boat rental", "8 hour charter"],
  sunset: ["sunset boat rental", "evening charter"],
  holiday: ["specialty charter", "private boat trip"],
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { normalized, canonicalSlug, firestoreData } = await resolveExperienceRoute(slug);
  if (isExperienceAliasSlug(normalized, firestoreData?.experience.slug)) {
    return {};
  }

  const keywords = SLUG_KEYWORDS[canonicalSlug] ?? SLUG_KEYWORDS[normalized];
  const canonical = experienceCanonicalUrl(canonicalSlug);

  if (firestoreData) {
    const exp = firestoreData.experience;
    const title = exp.metaTitle?.trim() || `${exp.title} | Boat Rentals`;
    const description = exp.metaDescription?.trim() || exp.subtitle;
    return {
      title,
      description,
      ...(keywords?.length ? { keywords } : {}),
      alternates: { canonical },
      openGraph: { title: exp.metaTitle?.trim() || `${exp.title} | ${brand.companyName}`, description, url: canonical },
    };
  }

  try {
    const staticExp = getStaticExperience(normalized);
    if (staticExp) {
      const managed = await getAdminManagedExperience(normalized);
      if (managed && !managed.active) {
        return { title: "Experience" };
      }
      return {
        title: `${staticExp.title} | Boat Rentals`,
        description: staticExp.shortDescription,
        ...(keywords?.length ? { keywords } : {}),
        alternates: { canonical },
        openGraph: {
          title: `${staticExp.title} | ${brand.companyName}`,
          description: staticExp.shortDescription,
          url: canonical,
        },
      };
    }
  } catch {
    // ignore
  }
  return { title: "Experience" };
}

export default async function ExperienceDetailPage({ params }: Props) {
  const { slug } = await params;
  const { normalized, canonicalSlug, firestoreData } = await resolveExperienceRoute(slug);

  if (isExperienceAliasSlug(normalized, firestoreData?.experience.slug)) {
    permanentRedirect(`/experiences/${canonicalSlug}`);
  }

  if (firestoreData) {
    return <ExperienceListingPage data={firestoreData} />;
  }

  const staticExperience = getStaticExperience(normalized);
  if (staticExperience) {
    const managed = await getAdminManagedExperience(normalized);
    if (managed && !managed.active) {
      notFound();
    }
    return <StaticExperienceDetail experience={staticExperience} />;
  }
  notFound();
}
