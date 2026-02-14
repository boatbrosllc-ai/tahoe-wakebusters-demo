/**
 * Experience detail loading — staged skeleton (hero first, then content blocks).
 * Shown while Firestore data and page segment load for /experiences/[slug].
 */
import { ExperiencePageSkeleton } from "@/components/site/ExperiencePageSkeleton";

export default function ExperienceSlugLoading() {
  return <ExperiencePageSkeleton />;
}
