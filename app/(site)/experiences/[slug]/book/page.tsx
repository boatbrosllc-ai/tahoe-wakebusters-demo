import { redirect } from "next/navigation";
import { STATIC_TO_FIRESTORE_SLUG } from "@/lib/booking/static-slug-map";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ boatId?: string; date?: string }> };

/**
 * Legacy standalone booking route — redirects to /booking (BookingModal Payment-Element flow).
 * ExperienceBookFlow + ExperienceCalendarPage (create-checkout-session path) have been removed.
 */
export default async function ExperienceBookPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const firestoreSlug = STATIC_TO_FIRESTORE_SLUG[slug] ?? slug;

  const query = new URLSearchParams({ experience: firestoreSlug });
  if (sp.boatId) query.set("boatId", sp.boatId);
  if (sp.date) query.set("date", sp.date);

  redirect(`/booking?${query.toString()}`);
}
