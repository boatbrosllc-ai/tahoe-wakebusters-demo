import { PrefetchCriticalRoutes } from "@/components/site/PrefetchCriticalRoutes";
import { AbcBoatsHero } from "@/sites/abc-boats/components/Hero";
import { AbcBoatsStatsBar } from "@/sites/abc-boats/components/StatsBar";
import { AbcBoatsStoryRows } from "@/sites/abc-boats/components/StoryRows";
import { AbcBoatsFeatureCards } from "@/sites/abc-boats/components/FeatureCards";
import { AbcBoatsCtaBand } from "@/sites/abc-boats/components/CtaBand";

/**
 * ABC Boats homepage — editorial / magazine layout.
 * Shared engine is only consumed via BookingWidget (opens the platform booking modal).
 */
export function AbcBoatsHomePage() {
  return (
    <div className="abc-home">
      <PrefetchCriticalRoutes />
      <AbcBoatsHero />
      <AbcBoatsStatsBar />
      <AbcBoatsStoryRows />
      <AbcBoatsFeatureCards />
      <AbcBoatsCtaBand />
    </div>
  );
}
