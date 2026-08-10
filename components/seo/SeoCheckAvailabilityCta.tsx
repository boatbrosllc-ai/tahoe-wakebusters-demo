"use client";

import { BookingCTA } from "@/components/site/BookingCTA";
import { useBookingModal } from "@/components/site/BookingModalContext";
import { analytics } from "@/lib/analytics";

type Props = {
  page: string;
  source?: string;
  experienceSlug?: "nasty-half-day" | "nasty-full-day" | "pontoon" | "watersports";
  className?: string;
  showSecondaryLink?: boolean;
};

/** Map public SEO/canonical slugs to Firestore experience slugs for modal preselect. */
function toFirestoreSlug(slug: Props["experienceSlug"]): string | undefined {
  if (!slug) return undefined;
  if (slug === "nasty-half-day" || slug === "pontoon") return "pontoon";
  if (slug === "nasty-full-day" || slug === "watersports") return "watersports";
  return slug;
}

/**
 * Opens the existing booking modal (does not create new Firestore experiences).
 */
export function SeoCheckAvailabilityCta({
  page,
  source = "seo_page",
  experienceSlug,
  className,
  showSecondaryLink = true,
}: Props) {
  const { setOpen, openWithSelection } = useBookingModal();
  const firestoreSlug = toFirestoreSlug(experienceSlug);

  const onBook = () => {
    analytics.bookCtaClick(source, page, experienceSlug);
    if (firestoreSlug) {
      openWithSelection({ experienceSlug: firestoreSlug });
    } else {
      setOpen(true);
    }
  };

  return (
    <div className={className}>
      <BookingCTA
        source={source}
        page={page}
        experience={experienceSlug}
        onBookNowClick={onBook}
        showCall={showSecondaryLink}
        onDark={false}
        primaryLabel="Check availability"
        primaryHint="Same booking engine · Half Day & Full Day"
      />
    </div>
  );
}
