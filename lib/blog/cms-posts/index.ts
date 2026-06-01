import { funThingsToDoInAustinForAdults } from "./fun-things-to-do-in-austin-for-adults";
import { dateIdeasAustin } from "./date-ideas-austin";
import { partyBoatRentalAustinLakeComparison } from "./party-boat-rental-austin-lake-austin-vs-lake-travis";
import { lakeAustinBoatGuide } from "./lake-austin-boat-guide";
import { austinBachelorettePartyIdeas } from "./austin-bachelorette-party-ideas";
import { austinBachelorPartyIdeas } from "./austin-bachelor-party-ideas";
import { bacheloretteWeekendInAustin } from "./bachelorette-weekend-in-austin";
import { austinWeekendTrip } from "./austin-weekend-trip";
import { austinWeekendGetaway } from "./austin-weekend-getaway";
import { funThingsToDoInAustin } from "./fun-things-to-do-in-austin";
import { thingsToDoInAustin } from "./things-to-do-in-austin";
import { outdoorThingsToDoInAustin } from "./outdoor-things-to-do-in-austin";
import { austinActivities } from "./austin-activities";
import { thingsToDoInDowntownAustin } from "./things-to-do-in-downtown-austin";
import { familyFriendlyThingsToDoInAustin } from "./family-friendly-things-to-do-in-austin";
import { austinAttractions } from "./austin-attractions";
import type { CmsBlogPostSeed } from "./helpers";

/** SEO cluster articles for Firestore CMS — seed via POST /api/admin/seed/blog */
export const CMS_BLOG_POST_SEEDS: CmsBlogPostSeed[] = [
  // Phase 0 — original six
  funThingsToDoInAustinForAdults,
  dateIdeasAustin,
  partyBoatRentalAustinLakeComparison,
  lakeAustinBoatGuide,
  austinBachelorettePartyIdeas,
  austinBachelorPartyIdeas,
  // Phase 1 — ten new articles (publishing priority order)
  bacheloretteWeekendInAustin,
  austinWeekendTrip,
  austinWeekendGetaway,
  funThingsToDoInAustin,
  thingsToDoInAustin,
  outdoorThingsToDoInAustin,
  austinActivities,
  thingsToDoInDowntownAustin,
  familyFriendlyThingsToDoInAustin,
  austinAttractions,
];

export function getCmsBlogPostSeedBySlug(slug: string): CmsBlogPostSeed | undefined {
  return CMS_BLOG_POST_SEEDS.find((p) => p.slug === slug);
}
