import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getExperienceBySlug as getFirestoreExperience } from "@/lib/booking/get-experience-by-slug";
import { getExperienceBySlug as getStaticExperience } from "@/content/experiences";
import { ExperienceBookFlow } from "@/components/experience/ExperienceBookFlow";
import { STATIC_TO_FIRESTORE_SLUG } from "@/lib/booking/static-slug-map";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const KNOWN_BOOK_SLUGS = ["pontoon", "watersports", "sunset", "holiday", ...Object.keys(STATIC_TO_FIRESTORE_SLUG)];

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ boatId?: string; date?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const firestoreSlug = STATIC_TO_FIRESTORE_SLUG[slug] ?? slug;
  try {
    const data = await getFirestoreExperience(firestoreSlug);
    if (data)
      return {
        title: `Book ${data.experience.title} | Lake Austin Boat Rental`,
        description: `Book your Lake Austin boat rental — ${data.experience.title}. Choose date and time. Captain included. Boat Bros ATX.`,
      };
    const staticExp = getStaticExperience(slug);
    if (staticExp)
      return {
        title: `Book ${staticExp.title} | Lake Austin Boat Rental`,
        description: `Book ${staticExp.title} on Lake Austin. Choose date and time. Captain included. Boat Bros ATX.`,
      };
  } catch {
    // ignore
  }
  return { title: "Book | Lake Austin Boat Rental" };
}

function BookingUnavailable({ backHref, experienceName }: { backHref: string; experienceName: string }) {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center px-4 py-12 text-center">
      <h1 className="text-2xl font-bold text-brand-dark">Booking unavailable</h1>
      <p className="mt-2 text-brand-muted max-w-md">
        Online booking for this experience is temporarily unavailable. Please try again later or contact us to reserve.
      </p>
      <Button asChild className="mt-6 rounded-xl" size="lg">
        <Link href={backHref} className="inline-flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to {experienceName}
        </Link>
      </Button>
    </div>
  );
}

export default async function ExperienceBookPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const firestoreSlug = STATIC_TO_FIRESTORE_SLUG[slug] ?? slug;

  let data: Awaited<ReturnType<typeof getFirestoreExperience>> = null;
  try {
    data = await getFirestoreExperience(firestoreSlug);
  } catch (err) {
    data = null;
  }

  if (data) {
    return (
      <ExperienceBookFlow
        experienceId={data.id}
        experienceName={data.experience.title}
        slug={data.experience.slug}
        rates={data.rates}
        addons={data.addons}
        maxGuests={data.experience.maxGuests ?? 14}
        petsMax={data.experience.petsMax ?? 0}
        backHref={`/booking`}
        initialBoatId={sp.boatId ?? undefined}
        initialDate={sp.date ?? undefined}
      />
    );
  }

  const staticExp = getStaticExperience(slug);
  const isKnownSlug = KNOWN_BOOK_SLUGS.includes(slug);
  if (staticExp || isKnownSlug) {
    const name = staticExp?.title ?? slug.replace(/-/g, " ");
    return (
      <BookingUnavailable backHref={`/experiences/${slug}`} experienceName={name} />
    );
  }

  notFound();
}
