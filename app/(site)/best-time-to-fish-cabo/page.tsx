import type { Metadata } from "next";
import { SeoGuideLayout } from "@/components/seo/SeoGuideLayout";
import { buildSeoMetadata } from "@/lib/seo/metadata";

const description =
  "Best time to fish Cabo — decision paths for marlin, tuna, dorado, variety, and tournament season. Honest timing depends on conditions; calendar ratings pending.";

export const metadata: Metadata = buildSeoMetadata({
  path: "/best-time-to-fish-cabo",
  title: "Best Time to Fish Cabo",
  description,
  ogImage: "/photos/stock/species/tuna-underwater-bacanek.jpg",
  ogImageAlt: "Yellowfin tuna swimming underwater",
});

export default function Page() {
  return (
    <SeoGuideLayout
      path="/best-time-to-fish-cabo"
      pageKey="best_time_to_fish_cabo"
      h1="Best Time to Fish Cabo"
      lede="There is no single “best month” for every angler. Use these decision paths to match your goal — and treat timing as a planning tool, not a catch guarantee."
      breadcrumbName="Best Time to Fish Cabo"
      metaDescription={description}
      heroImage="/photos/stock/species/tuna-underwater-bacanek.jpg"
      heroAlt="Yellowfin tuna swimming underwater"
      sections={[
        {
          type: "p",
          text: "This page answers “when should we go?” as a set of goals — not a copy of the species × month calendar. Cabo fishing changes with water, bait, and weather. Our calendar grid is ready for first-party ratings, but those cells stay pending until verified from Nasty trip reports. Until then, plan with goals and flexibility.",
        },
        {
          type: "h2",
          id: "marlin",
          text: "Best for marlin focus",
        },
        {
          type: "p",
          text: "If striped marlin or a broader billfish hunt is the reason you are booking, prioritize a Nasty Full Day for range and time. Read the marlin guide for release ethics and species context, then pick dates you can keep flexible if weather shifts. Ask about recent patterns when you book — do not rely on a fabricated peak-month claim.",
        },
        {
          type: "h2",
          id: "tuna",
          text: "Best for yellowfin tuna",
        },
        {
          type: "p",
          text: "Tuna windows can be excellent — and they can move. Full Day helps when you need to search; Half Day can still be the right call for a private morning or afternoon. Watch fishing reports as they publish for real Nasty tuna days rather than generic season blogs.",
        },
        {
          type: "h2",
          id: "dorado",
          text: "Best for dorado (mahi)",
        },
        {
          type: "p",
          text: "Dorado often show when warm-water forage lines up, but they are still day-to-day. If dorado are high on your list, say so at booking and keep an open mind for mixed-bag offshore fishing when the captain sees a better bite.",
        },
        { type: "cta" },
        {
          type: "h2",
          id: "variety",
          text: "Best for variety / first Cabo trip",
        },
        {
          type: "p",
          text: "First-timers who want a classic private Cabo day should optimize for good travel weather, a duration that matches energy levels (5h vs 8h), and clear inclusions — not a single trophy species. Half Day is popular for families and tighter schedules; Full Day suits anglers who want more water time.",
        },
        {
          type: "h2",
          id: "tournament",
          text: "Tournament season considerations",
        },
        {
          type: "p",
          text: "Tournament and peak holiday periods can raise demand and may use higher Full Day pricing when configured. Book early, read the prices page for founding vs standard vs peak presentation, and expect the marina and hotels to feel busier. Tournament calendars change year to year — confirm your travel dates against the live charter calendar rather than an old blog post.",
        },
        {
          type: "h2",
          id: "honest",
          text: "Honest limits of “best time” advice",
        },
        {
          type: "ul",
          items: [
            "Calendar month ratings are pending Nasty verification — cells may show as pending until trip data fills them.",
            "The captain sets the daily plan from live conditions.",
            "Weather can delay, shorten, or cancel for safety — see FAQs / booking terms.",
            "Species pages (marlin, roosterfish) explain intent; they do not promise fish.",
          ],
        },
        {
          type: "note",
          text: "For the month grid itself, use the Cabo fishing calendar. For real day write-ups, use fishing reports when published.",
        },
      ]}
      faqs={[
        {
          question: "What is the single best month to fish Cabo?",
          answer:
            "There isn’t one month that is best for every goal. Match your dates to marlin, tuna, dorado, variety, or travel constraints — and expect day-to-day variability.",
        },
        {
          question: "Why are calendar ratings pending?",
          answer:
            "We only fill season cells from first-party Nasty trip data. Until those reports accumulate, the grid stays honest with pending values instead of invented peaks.",
        },
        {
          question: "Should I book Full Day in “peak” season?",
          answer:
            "Full Day helps when you want more range. Peak or holiday dates may also price higher when configured — check the live calendar and prices page for your slot.",
        },
        {
          question: "What if weather ruins our window?",
          answer:
            "If conditions are unsafe, the captain may delay, shorten, or cancel. Weather cancellations are rescheduled or refunded per booking terms.",
        },
      ]}
      related={[
        { href: "/cabo-fishing-calendar", label: "Fishing calendar" },
        { href: "/cabo-marlin-fishing", label: "Marlin fishing" },
        { href: "/cabo-roosterfish-fishing", label: "Roosterfish" },
        { href: "/fishing-reports", label: "Fishing reports" },
        { href: "/cabo-fishing-charter-prices", label: "Prices" },
        { href: "/experiences/nasty-half-day", label: "Nasty Half Day" },
        { href: "/experiences/nasty-full-day", label: "Nasty Full Day" },
        { href: "/deep-sea-fishing-cabo", label: "Deep sea fishing" },
      ]}
    />
  );
}
